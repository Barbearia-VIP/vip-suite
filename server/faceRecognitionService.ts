/**
 * Face Recognition Service — Reconhecimento facial server-side
 *
 * Usado exclusivamente pela câmera IP (worker permanente).
 * A câmera USB continua usando face-api.js no browser (inalterado).
 *
 * Carrega os modelos uma única vez na memória e expõe
 * detectFaces() para processar frames JPEG do worker.
 */
import { join } from "path";
import { fileURLToPath } from "url";

// Caminho dos modelos (mesmos usados pelo browser)
const MODELS_PATH = join(
  fileURLToPath(import.meta.url),
  "../../client/public/models"
);

// Threshold de distância euclidiana para match de face (mesmo do browser)
const MATCH_THRESHOLD = 0.55;

// Tamanho do input para o TinyFaceDetector (múltiplo de 32)
const INPUT_SIZE = 416;

// Score mínimo de confiança para aceitar uma detecção
const SCORE_THRESHOLD = 0.4;

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
    console.log("[FaceRecognition] Inicializando modelos...");
    const t0 = Date.now();

    // Importar canvas para monkey-patch
    const { Canvas, Image, ImageData } = await import("canvas");

    // Importar face-api (versão Node.js)
    faceapi = await import("@vladmandic/face-api");

    // Monkey-patch: fornece implementação de canvas para o face-api em Node.js
    faceapi.env.monkeyPatch({ Canvas: Canvas as any, Image: Image as any, ImageData: ImageData as any });

    // Carregar modelos do disco
    await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS_PATH);
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
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img as any, 0, 0);

  // Detectar todas as faces com landmarks, descriptors e expressões
  const detections = await faceapi
    .detectAllFaces(
      canvas as any,
      new faceapi.TinyFaceDetectorOptions({
        inputSize: INPUT_SIZE,
        scoreThreshold: SCORE_THRESHOLD,
      })
    )
    .withFaceLandmarks()
    .withFaceDescriptors()
    .withFaceExpressions();

  return detections.map((d) => {
    const expressions = d.expressions as unknown as Record<string, number>;
    const [topExpr, topScore] = Object.entries(expressions).sort(
      ([, a], [, b]) => b - a
    )[0];

    // Mapear expressão para nível de satisfação
    const satisfactionLevel = mapExpressionToSatisfaction(topExpr, topScore);

    return {
      descriptor: Array.from(d.descriptor),
      expression: topExpr,
      satisfactionLevel,
      confidence: d.detection.score,
      box: {
        x: Math.round(d.detection.box.x),
        y: Math.round(d.detection.box.y),
        width: Math.round(d.detection.box.width),
        height: Math.round(d.detection.box.height),
      },
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
  // Expressões positivas
  if (expression === "happy" && score > 0.4) return "satisfied";

  // Expressões negativas
  if (
    (expression === "angry" || expression === "disgusted" || expression === "sad") &&
    score > 0.4
  ) {
    return "unsatisfied";
  }

  return "neutral";
}
