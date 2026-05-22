/**
 * Face Recognition Service — Reconhecimento facial server-side
 *
 * Usado exclusivamente pela câmera IP (worker permanente).
 * A câmera USB continua usando face-api.js no browser (inalterado).
 *
 * Estratégia para câmera olho de peixe (Dahua):
 * - As faces aparecem pequenas no frame completo (1280x724)
 * - Divide o frame em 4 quadrantes e aplica zoom 2.5x em cada um
 * - Detecta faces em cada quadrante ampliado com SSD MobileNet
 * - Deduplica faces que aparecem em múltiplos quadrantes por IoU
 *
 * Carrega os modelos uma única vez na memória.
 */
import { join } from "path";
import { fileURLToPath } from "url";

// Caminho dos modelos (inclui ssd_mobilenetv1 copiado do pacote face-api)
const MODELS_PATH = join(
  fileURLToPath(import.meta.url),
  "../../client/public/models"
);

// Threshold de distância euclidiana para match de face (mesmo do browser)
const MATCH_THRESHOLD = 0.55;

// Score mínimo de confiança para SSD MobileNet
const SSD_MIN_CONFIDENCE = 0.4;

// Fator de zoom aplicado a cada quadrante
const TILE_SCALE = 2.5;

// Sobreposição entre tiles (% do tamanho do tile) para não perder faces nas bordas
const TILE_OVERLAP = 0.15;

// IoU mínimo para considerar duas detecções como duplicatas
const IOU_DEDUP_THRESHOLD = 0.3;

let faceapi: typeof import("@vladmandic/face-api") | null = null;
let modelsLoaded = false;
let loadingPromise: Promise<void> | null = null;

export interface FaceDetectionResult {
  descriptor: number[];          // Float32Array[128] como array
  expression: string;            // expressão dominante
  satisfactionLevel: "satisfied" | "neutral" | "unsatisfied";
  confidence: number;            // score da detecção (0-1)
  box: { x: number; y: number; width: number; height: number };
}

/**
 * Inicializa o face-api com backend TensorFlow e carrega os modelos.
 * Idempotente — pode ser chamado múltiplas vezes sem efeito.
 */
export async function initFaceRecognition(): Promise<void> {
  if (modelsLoaded) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    console.log("[FaceRecognition] Inicializando modelos SSD MobileNet (multi-tile)...");
    const t0 = Date.now();

    // Importar canvas para monkey-patch
    const { Canvas, Image, ImageData } = await import("canvas");

    // Importar face-api (versão Node.js)
    faceapi = await import("@vladmandic/face-api");

    // Monkey-patch: fornece implementação de canvas para o face-api em Node.js
    faceapi.env.monkeyPatch({ Canvas: Canvas as any, Image: Image as any, ImageData: ImageData as any });

    // Carregar modelos do disco
    // SSD MobileNet: melhor para rostos pequenos e distantes (câmera olho de peixe)
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_PATH);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);
    await faceapi.nets.faceExpressionNet.loadFromDisk(MODELS_PATH);

    modelsLoaded = true;
    console.log(`[FaceRecognition] Modelos carregados em ${Date.now() - t0}ms`);
  })();

  return loadingPromise;
}

/**
 * Detecta faces em um frame JPEG (Buffer).
 * Retorna array de resultados — vazio se nenhuma face detectada.
 *
 * Estratégia multi-tile para câmera olho de peixe:
 * Divide o frame em quadrantes sobrepostos, aplica zoom TILE_SCALE em cada um,
 * detecta faces e converte as coordenadas de volta para o frame original.
 */
export async function detectFaces(
  frameBuffer: Buffer
): Promise<FaceDetectionResult[]> {
  if (!modelsLoaded || !faceapi) {
    throw new Error("Face recognition não inicializado. Chame initFaceRecognition() primeiro.");
  }

  const { loadImage, createCanvas } = await import("canvas");

  // Carregar o buffer como imagem
  const img = await loadImage(frameBuffer);
  const W = img.width;
  const H = img.height;

  // Definir tiles (quadrantes com sobreposição)
  // 2x2 grid com TILE_OVERLAP de sobreposição
  const cols = 2;
  const rows = 2;
  const tileW = Math.round(W / cols * (1 + TILE_OVERLAP));
  const tileH = Math.round(H / rows * (1 + TILE_OVERLAP));
  const stepX = Math.round(W / cols);
  const stepY = Math.round(H / rows);

  interface RawDetection {
    score: number;
    box: { x: number; y: number; width: number; height: number }; // coords no frame original
    descriptor: Float32Array;
    expressions: Record<string, number>;
  }

  const allDetections: RawDetection[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const srcX = col * stepX;
      const srcY = row * stepY;
      const srcW = Math.min(tileW, W - srcX);
      const srcH = Math.min(tileH, H - srcY);

      // Criar canvas do tile ampliado
      const dstW = Math.round(srcW * TILE_SCALE);
      const dstH = Math.round(srcH * TILE_SCALE);
      const tileCanvas = createCanvas(dstW, dstH);
      const tileCtx = tileCanvas.getContext("2d");
      tileCtx.drawImage(img as any, srcX, srcY, srcW, srcH, 0, 0, dstW, dstH);

      // Detectar faces no tile
      const dets = await faceapi!
        .detectAllFaces(
          tileCanvas as any,
          new faceapi!.SsdMobilenetv1Options({ minConfidence: SSD_MIN_CONFIDENCE })
        )
        .withFaceLandmarks()
        .withFaceDescriptors()
        .withFaceExpressions();

      // Converter coordenadas do tile para o frame original
      for (const d of dets) {
        const box = d.detection.box;
        allDetections.push({
          score: d.detection.score,
          box: {
            x: Math.round(srcX + box.x / TILE_SCALE),
            y: Math.round(srcY + box.y / TILE_SCALE),
            width: Math.round(box.width / TILE_SCALE),
            height: Math.round(box.height / TILE_SCALE),
          },
          descriptor: d.descriptor,
          expressions: d.expressions as unknown as Record<string, number>,
        });
      }
    }
  }

  // Deduplicar por IoU (remover detecções sobrepostas do mesmo rosto)
  const deduplicated = deduplicateByIoU(allDetections, IOU_DEDUP_THRESHOLD);

  // Filtrar caixas muito pequenas (< 10px) — provavelmente ruído
  // Valor baixo pois câmera olho de peixe produz rostos pequenos no frame original
  const filtered = deduplicated.filter(
    (d) => d.box.width >= 10 && d.box.height >= 10
  );

  return filtered.map((d) => {
    const [topExpr, topScore] = Object.entries(d.expressions).sort(
      ([, a], [, b]) => b - a
    )[0];

    return {
      descriptor: Array.from(d.descriptor),
      expression: topExpr,
      satisfactionLevel: mapExpressionToSatisfaction(topExpr, topScore),
      confidence: d.score,
      box: d.box,
    };
  });
}

/**
 * Encontra o cliente mais próximo no banco de dados para um descriptor.
 * Retorna o id do cliente se a distância for menor que MATCH_THRESHOLD,
 * ou null se for um rosto novo.
 */
export function matchFaceDescriptor(
  descriptor: number[],
  knownClientes: Array<{ id: number; faceDescriptor: number[] | null }>
): { clienteId: number; distance: number } | null {
  let best: { clienteId: number; distance: number } | null = null;

  for (const cliente of knownClientes) {
    if (!cliente.faceDescriptor || cliente.faceDescriptor.length !== descriptor.length) continue;
    const dist = euclideanDistance(descriptor, cliente.faceDescriptor);
    if (dist < MATCH_THRESHOLD && (!best || dist < best.distance)) {
      best = { clienteId: cliente.id, distance: dist };
    }
  }

  return best;
}

// ─── Helpers internos ────────────────────────────────────────────────────────

interface RawDet {
  score: number;
  box: { x: number; y: number; width: number; height: number };
  descriptor: Float32Array;
  expressions: Record<string, number>;
}

/**
 * Remove detecções duplicadas usando Intersection over Union (IoU).
 * Mantém a detecção com maior score quando duas se sobrepõem acima do threshold.
 */
function deduplicateByIoU(detections: RawDet[], threshold: number): RawDet[] {
  // Ordenar por score decrescente
  const sorted = [...detections].sort((a, b) => b.score - a.score);
  const kept: RawDet[] = [];

  for (const det of sorted) {
    const overlaps = kept.some((k) => iou(det.box, k.box) > threshold);
    if (!overlaps) {
      kept.push(det);
    }
  }

  return kept;
}

function iou(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): number {
  const ax1 = a.x, ay1 = a.y, ax2 = a.x + a.width, ay2 = a.y + a.height;
  const bx1 = b.x, by1 = b.y, bx2 = b.x + b.width, by2 = b.y + b.height;

  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);

  if (ix2 <= ix1 || iy2 <= iy1) return 0;

  const intersection = (ix2 - ix1) * (iy2 - iy1);
  const aArea = a.width * a.height;
  const bArea = b.width * b.height;
  const union = aArea + bArea - intersection;

  return union <= 0 ? 0 : intersection / union;
}

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

function mapExpressionToSatisfaction(
  expression: string,
  score: number
): "satisfied" | "neutral" | "unsatisfied" {
  if (expression === "happy" && score > 0.4) return "satisfied";

  if (
    (expression === "angry" || expression === "disgusted" || expression === "sad") &&
    score > 0.4
  ) {
    return "unsatisfied";
  }

  return "neutral";
}
