/**
 * IP Camera Worker — Captura contínua + Reconhecimento facial server-side
 *
 * Mantém um stream ffmpeg permanente por unidade, independente do browser.
 * - Reconecta automaticamente quando o stream cai
 * - Expõe o último frame JPEG via getLastFrame(unitId)
 * - Não para quando o browser fecha ou troca de página
 * - Gerenciado via startWorker/stopWorker por unitId
 *
 * Para câmeras IP: detecta faces automaticamente no servidor a cada N segundos
 * e salva capturas no banco sem precisar do browser aberto.
 * Para câmeras USB: comportamento inalterado (browser-side face-api.js).
 */
import { spawn, ChildProcess } from "child_process";
import ffmpegStatic from "ffmpeg-static";

const FFMPEG_BIN = ffmpegStatic ?? "ffmpeg";

// Intervalo de reconexão em caso de falha (ms)
const RECONNECT_DELAY_MS = 5_000;
// Máximo de tentativas consecutivas antes de aumentar o delay
const MAX_FAST_RETRIES = 3;
// Intervalo entre rodadas de detecção facial (ms) — 30 segundos por padrão
const FACE_DETECTION_INTERVAL_MS = 15_000;
// Cooldown mínimo entre capturas do mesmo cliente (ms)
const SAME_CLIENT_COOLDOWN_MS = 60_000;

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  satisfaction: "satisfied" | "neutral" | "unsatisfied";
  expression: string;
  confidence: number;
  detectedAt: number; // timestamp
}

interface WorkerState {
  unitId: number;
  rtspUrl: string;
  ffmpeg: ChildProcess | null;
  lastFrame: Buffer | null;
  lastFrameAt: number;     // timestamp do último frame recebido
  running: boolean;        // true enquanto o worker deve continuar
  retryCount: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  startedAt: number;
  // Face recognition state
  faceDetectionTimer: ReturnType<typeof setTimeout> | null;
  lastDetectionAt: number;         // timestamp da última detecção
  lastDetectionCount: number;      // faces detectadas na última rodada
  lastClientCooldown: Map<number, number>; // clienteId → último timestamp de captura
  totalCapturesSaved: number;      // total de capturas salvas no DB
  lastDetections: FaceBox[];       // boxes das últimas faces detectadas (para overlay)
}

// Mapa de workers ativos por unitId
const workers = new Map<number, WorkerState>();

/**
 * Inicia o worker de captura contínua para uma unidade.
 * Se já estiver rodando com a mesma URL, não faz nada.
 */
export function startWorker(unitId: number, rtspUrl: string): void {
  const existing = workers.get(unitId);
  if (existing) {
    if (existing.rtspUrl === rtspUrl && existing.running) {
      // Já rodando com a mesma URL
      return;
    }
    // URL mudou ou estava parado — reinicia
    stopWorker(unitId);
  }

  const state: WorkerState = {
    unitId,
    rtspUrl,
    ffmpeg: null,
    lastFrame: null,
    lastFrameAt: 0,
    running: true,
    retryCount: 0,
    retryTimer: null,
    startedAt: Date.now(),
    faceDetectionTimer: null,
    lastDetectionAt: 0,
    lastDetectionCount: 0,
    lastClientCooldown: new Map(),
    totalCapturesSaved: 0,
    lastDetections: [],
  };
  workers.set(unitId, state);
  console.log(`[IP Worker] Unit ${unitId}: iniciando worker (${rtspUrl.replace(/:[^:@]*@/, ':***@')})`);
  spawnFfmpeg(state);
  scheduleFaceDetection(state);
}

/**
 * Para o worker de uma unidade e libera recursos.
 */
export function stopWorker(unitId: number): void {
  const state = workers.get(unitId);
  if (!state) return;
  state.running = false;
  if (state.retryTimer) {
    clearTimeout(state.retryTimer);
    state.retryTimer = null;
  }
  if (state.faceDetectionTimer) {
    clearTimeout(state.faceDetectionTimer);
    state.faceDetectionTimer = null;
  }
  if (state.ffmpeg) {
    try { state.ffmpeg.kill("SIGTERM"); } catch {}
    state.ffmpeg = null;
  }
  workers.delete(unitId);
  console.log(`[IP Worker] Unit ${unitId}: worker parado`);
}

/**
 * Retorna o último frame JPEG capturado para uma unidade.
 * Retorna null se o worker não estiver ativo ou ainda não capturou nenhum frame.
 */
export function getLastFrame(unitId: number): Buffer | null {
  return workers.get(unitId)?.lastFrame ?? null;
}

/**
 * Retorna o timestamp do último frame recebido (ms desde epoch).
 */
export function getLastFrameAt(unitId: number): number {
  return workers.get(unitId)?.lastFrameAt ?? 0;
}

/**
 * Retorna as últimas detecções (boxes) de uma unidade para overlay no frontend.
 * Retorna array vazio se o worker não estiver ativo ou sem detecções recentes.
 */
export function getLastDetections(unitId: number): FaceBox[] {
  return workers.get(unitId)?.lastDetections ?? [];
}

/**
 * Retorna status de todos os workers ativos.
 */
export function getWorkersStatus(): Array<{
  unitId: number;
  running: boolean;
  hasFrame: boolean;
  lastFrameAge: number;        // segundos desde o último frame
  uptime: number;              // segundos desde o início
  retryCount: number;
  lastDetectionAt: number;     // timestamp da última detecção facial
  lastDetectionCount: number;  // faces detectadas na última rodada
  totalCapturesSaved: number;  // total de capturas salvas no DB
}> {
  const now = Date.now();
  return Array.from(workers.values()).map(s => ({
    unitId: s.unitId,
    running: s.running && s.ffmpeg !== null,
    hasFrame: s.lastFrame !== null,
    lastFrameAge: s.lastFrameAt > 0 ? Math.round((now - s.lastFrameAt) / 1000) : -1,
    uptime: Math.round((now - s.startedAt) / 1000),
    retryCount: s.retryCount,
    lastDetectionAt: s.lastDetectionAt,
    lastDetectionCount: s.lastDetectionCount,
    totalCapturesSaved: s.totalCapturesSaved,
  }));
}

// ─── ffmpeg ──────────────────────────────────────────────────────────────────

/**
 * Inicia o processo ffmpeg para captura contínua.
 * Reconecta automaticamente em caso de falha.
 */
function spawnFfmpeg(state: WorkerState): void {
  if (!state.running) return;

  console.log(`[IP Worker] Unit ${state.unitId}: iniciando ffmpeg (tentativa ${state.retryCount + 1})`);

  const ffmpeg = spawn(FFMPEG_BIN, [
    "-loglevel", "error",
    "-rtsp_transport", "tcp",
    "-i", state.rtspUrl,
    "-an",                    // sem áudio
    "-f", "mjpeg",            // output MJPEG
    "-q:v", "5",              // qualidade JPEG (1=melhor, 31=pior)
    "-r", "5",                // 5 fps (suficiente para reconhecimento facial)
    "-vf", "scale=1280:-2",   // redimensiona para 1280px
    "pipe:1",                 // output para stdout
  ]);

  state.ffmpeg = ffmpeg;

  let buffer = Buffer.alloc(0);

  ffmpeg.stdout?.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);

    // Extrai todos os frames JPEG completos do buffer
    let processed = true;
    while (processed) {
      processed = false;
      const soiIdx = buffer.indexOf(Buffer.from([0xff, 0xd8]));
      if (soiIdx === -1) break;
      if (soiIdx > 0) buffer = buffer.slice(soiIdx);

      let eoiIdx = -1;
      for (let i = 2; i < buffer.length - 1; i++) {
        if (buffer[i] === 0xff && buffer[i + 1] === 0xd9) {
          eoiIdx = i + 2;
          break;
        }
      }
      if (eoiIdx === -1) break;

      const frame = buffer.slice(0, eoiIdx);
      buffer = buffer.slice(eoiIdx);

      // Armazena o frame
      state.lastFrame = frame;
      state.lastFrameAt = Date.now();
      state.retryCount = 0; // reset retry count ao receber frames
      processed = true;
    }
  });

  ffmpeg.stderr?.on("data", (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg && !msg.includes("frame=") && !msg.includes("fps=") && !msg.includes("speed=")) {
      console.error(`[IP Worker] Unit ${state.unitId} ffmpeg: ${msg}`);
    }
  });

  ffmpeg.on("close", (code) => {
    if (!state.running) return; // parado intencionalmente

    state.ffmpeg = null;
    state.retryCount++;
    console.log(`[IP Worker] Unit ${state.unitId}: ffmpeg encerrado (code=${code}), reconectando em ${RECONNECT_DELAY_MS / 1000}s...`);

    // Delay exponencial: 5s, 10s, 20s, máximo 60s
    const delay = state.retryCount <= MAX_FAST_RETRIES
      ? RECONNECT_DELAY_MS
      : Math.min(RECONNECT_DELAY_MS * Math.pow(2, state.retryCount - MAX_FAST_RETRIES), 60_000);

    state.retryTimer = setTimeout(() => {
      if (state.running) spawnFfmpeg(state);
    }, delay);
  });

  ffmpeg.on("error", (err) => {
    console.error(`[IP Worker] Unit ${state.unitId}: erro ao iniciar ffmpeg:`, err.message);
  });
}

// ─── Face Detection Loop ─────────────────────────────────────────────────────

/**
 * Agenda a próxima rodada de detecção facial.
 * Executa a cada FACE_DETECTION_INTERVAL_MS segundos.
 */
function scheduleFaceDetection(state: WorkerState): void {
  if (!state.running) return;

  state.faceDetectionTimer = setTimeout(async () => {
    if (!state.running) return;

    try {
      await runFaceDetection(state);
    } catch (err) {
      console.error(`[IP Worker] Unit ${state.unitId}: erro na detecção facial:`, err);
    }

    // Reagendar próxima rodada
    scheduleFaceDetection(state);
  }, FACE_DETECTION_INTERVAL_MS);
}

/**
 * Executa uma rodada de detecção facial no frame atual.
 * Salva capturas no banco para cada face detectada.
 */
async function runFaceDetection(state: WorkerState): Promise<void> {
  // Verificar se há frame disponível e se não é muito antigo (max 10s)
  const frameAge = state.lastFrameAt > 0 ? Date.now() - state.lastFrameAt : Infinity;
  if (!state.lastFrame || frameAge > 10_000) {
    return; // Sem frame fresco disponível
  }

  const frame = state.lastFrame; // captura referência local

  // Importar serviço de reconhecimento facial (lazy import para não bloquear startup)
  const { initFaceRecognition, detectFaces, matchFaceDescriptor } = await import("./faceRecognitionService");

  // Garantir que os modelos estão carregados
  await initFaceRecognition();

  // Detectar faces no frame
  const t0 = Date.now();
  const faces = await detectFaces(frame);
  const elapsed = Date.now() - t0;

  const detectedAt = Date.now();
  state.lastDetectionAt = detectedAt;
  state.lastDetectionCount = faces.length;

  // Armazenar boxes para overlay no frontend (mesmo que 0 faces — limpa o overlay)
  state.lastDetections = faces.map(f => ({
    x: f.box.x,
    y: f.box.y,
    width: f.box.width,
    height: f.box.height,
    satisfaction: f.satisfactionLevel,
    expression: f.expression,
    confidence: f.confidence,
    detectedAt,
  }));

  if (faces.length === 0) {
    return; // Nenhuma face detectada
  }

  console.log(`[IP Worker] Unit ${state.unitId}: ${faces.length} face(s) detectada(s) em ${elapsed}ms`);

  // Buscar clientes cadastrados para matching
  const { getDb } = await import("./db");
  const { sql: drizzleSql, and, eq } = await import("drizzle-orm");
  const { camClientes } = await import("../drizzle/schema");

  const db = await getDb();
  if (!db) return;

  const knownClientes = await db
    .select({
      id: camClientes.id,
      faceDescriptor: camClientes.faceDescriptor,
    })
    .from(camClientes)
    .where(
      and(
        eq(camClientes.unitId, state.unitId),
        drizzleSql`${camClientes.faceDescriptor} IS NOT NULL`
      )
    );

  // Processar cada face detectada
  for (const face of faces) {
    // Verificar cooldown por cliente
    const match = matchFaceDescriptor(face.descriptor, knownClientes as any);
    if (match) {
      const lastCapture = state.lastClientCooldown.get(match.clienteId) ?? 0;
      if (Date.now() - lastCapture < SAME_CLIENT_COOLDOWN_MS) {
        continue; // Cooldown ativo para este cliente
      }
    }

    // Salvar captura no banco via função interna (evita overhead do tRPC)
    try {
      await saveCaptureInternal({
        unitId: state.unitId,
        faceDescriptor: face.descriptor,
        satisfactionLevel: face.satisfactionLevel,
        expression: face.expression,
        confidence: face.confidence,
        existingClienteId: match?.clienteId,
      });

      state.totalCapturesSaved++;

      // Registrar cooldown para este cliente
      if (match) {
        state.lastClientCooldown.set(match.clienteId, Date.now());
      }

      console.log(
        `[IP Worker] Unit ${state.unitId}: captura salva — ` +
        `cliente=${match?.clienteId ?? "novo"}, ` +
        `expressão=${face.expression}, ` +
        `satisfação=${face.satisfactionLevel}, ` +
        `confiança=${(face.confidence * 100).toFixed(1)}%`
      );
    } catch (err) {
      console.error(`[IP Worker] Unit ${state.unitId}: erro ao salvar captura:`, err);
    }
  }
}

// ─── Save Capture (lógica interna, sem tRPC) ─────────────────────────────────

interface SaveCaptureInput {
  unitId: number;
  faceDescriptor: number[];
  satisfactionLevel: "satisfied" | "neutral" | "unsatisfied";
  expression: string;
  confidence: number;
  faceImageUrl?: string;
  existingClienteId?: number;
}

/**
 * Salva uma captura facial diretamente no banco, sem passar pelo tRPC.
 * Replica a lógica da procedure saveCapture do vipCam router.
 */
async function saveCaptureInternal(input: SaveCaptureInput): Promise<{ clienteId: number; isNewCliente: boolean }> {
  const { getDb } = await import("./db");
  const { sql: drizzleSql, and, eq } = await import("drizzle-orm");
  const {
    camClientes,
    camSentimentTimeline,
    camMetricasDiarias,
    camMetricasHorarias,
  } = await import("../drizzle/schema");

  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");

  const now = new Date();
  const todayStr = todayBRT();
  const currentHour = hourBRT();

  let clienteId: number;
  let isNewCliente = false;

  if (input.existingClienteId) {
    // ── Cliente existente: atualizar descriptor e satisfação ──
    clienteId = input.existingClienteId;

    const [cliente] = await db
      .select()
      .from(camClientes)
      .where(and(eq(camClientes.id, clienteId), eq(camClientes.unitId, input.unitId)))
      .limit(1);

    if (!cliente) throw new Error("Cliente não encontrado");

    // Atualizar descriptor: 70% velho + 30% novo (aprendizado incremental)
    const oldDescriptor = (cliente.faceDescriptor as number[]) ?? [];
    let newDescriptor = input.faceDescriptor;
    if (oldDescriptor.length === newDescriptor.length) {
      newDescriptor = oldDescriptor.map((v, i) => v * 0.7 + newDescriptor[i] * 0.3);
    }

    // Buscar histórico da timeline para calcular satisfação final
    const timeline = await db
      .select({ satisfactionLevel: camSentimentTimeline.satisfactionLevel })
      .from(camSentimentTimeline)
      .where(and(
        eq(camSentimentTimeline.clienteId, clienteId),
        eq(camSentimentTimeline.unitId, input.unitId)
      ))
      .limit(50);

    const allTimeline = [...timeline, { satisfactionLevel: input.satisfactionLevel }];
    const finalLevel = calcFinalSatisfactionLevel(allTimeline);

    // Verificar se é a primeira visita do dia
    const lastSeenDate = cliente.lastSeenAt
      ? (() => {
          const d = new Date(cliente.lastSeenAt);
          const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
          return brt.toISOString().slice(0, 10);
        })()
      : null;
    const isNewDay = lastSeenDate !== todayStr;

    await db.update(camClientes).set({
      faceDescriptor: newDescriptor,
      satisfactionLevel: finalLevel,
      expression: input.expression as any,
      confidenceScore: String(input.confidence),
      lastSeenAt: now,
      visitCount: isNewDay ? drizzleSql`${camClientes.visitCount} + 1` : undefined,
      expressao: finalLevel === "satisfied" ? "satisfeito" : finalLevel === "neutral" ? "neutro" : "insatisfeito",
      totalVisitas: isNewDay ? drizzleSql`${camClientes.totalVisitas} + 1` : undefined,
      ultimaVisita: now,
      updatedAt: now,
    }).where(eq(camClientes.id, clienteId));

  } else {
    // ── Novo cliente ──
    isNewCliente = true;
    const [result] = await db.insert(camClientes).values({
      unitId: input.unitId,
      faceDescriptor: input.faceDescriptor,
      faceImageUrl: input.faceImageUrl ?? null,
      satisfactionLevel: input.satisfactionLevel,
      expression: input.expression as any,
      confidenceScore: String(input.confidence),
      visitCount: 1,
      lastSeenAt: now,
      fotoUrl: input.faceImageUrl ?? null,
      expressao: input.satisfactionLevel === "satisfied" ? "satisfeito" : input.satisfactionLevel === "neutral" ? "neutro" : "insatisfeito",
      totalVisitas: 1,
      ultimaVisita: now,
    });
    clienteId = (result as any).insertId;
  }

  // ── Inserir na timeline ──
  await db.insert(camSentimentTimeline).values({
    unitId: input.unitId,
    clienteId,
    satisfactionLevel: input.satisfactionLevel,
    expression: input.expression,
    confidence: String(input.confidence),
    faceImageUrl: input.faceImageUrl ?? null,
    recordedAt: now,
  });

  // ── Atualizar métricas diárias ──
  const satisfiedInc = input.satisfactionLevel === "satisfied" ? 1 : 0;
  const neutralInc = input.satisfactionLevel === "neutral" ? 1 : 0;
  const unsatisfiedInc = input.satisfactionLevel === "unsatisfied" ? 1 : 0;

  const [existingMetric] = await db
    .select()
    .from(camMetricasDiarias)
    .where(and(
      eq(camMetricasDiarias.unitId, input.unitId),
      eq(camMetricasDiarias.data, todayStr as any)
    ))
    .limit(1);

  if (existingMetric) {
    await db.update(camMetricasDiarias).set({
      totalDeteccoes: drizzleSql`${camMetricasDiarias.totalDeteccoes} + 1`,
      satisfeitos: drizzleSql`${camMetricasDiarias.satisfeitos} + ${satisfiedInc}`,
      neutros: drizzleSql`${camMetricasDiarias.neutros} + ${neutralInc}`,
      insatisfeitos: drizzleSql`${camMetricasDiarias.insatisfeitos} + ${unsatisfiedInc}`,
    }).where(and(
      eq(camMetricasDiarias.unitId, input.unitId),
      eq(camMetricasDiarias.data, todayStr as any)
    ));
  } else {
    await db.insert(camMetricasDiarias).values({
      unitId: input.unitId,
      data: todayStr as any,
      totalDeteccoes: 1,
      satisfeitos: satisfiedInc,
      neutros: neutralInc,
      insatisfeitos: unsatisfiedInc,
    });
  }

  // ── Atualizar métricas horárias ──
  const [existingHourly] = await db
    .select()
    .from(camMetricasHorarias)
    .where(and(
      eq(camMetricasHorarias.unitId, input.unitId),
      eq(camMetricasHorarias.data, todayStr as any),
      eq(camMetricasHorarias.hora, currentHour)
    ))
    .limit(1);

  if (existingHourly) {
    await db.update(camMetricasHorarias).set({
      totalDeteccoes: drizzleSql`${camMetricasHorarias.totalDeteccoes} + 1`,
      satisfeitos: drizzleSql`${camMetricasHorarias.satisfeitos} + ${satisfiedInc}`,
      neutros: drizzleSql`${camMetricasHorarias.neutros} + ${neutralInc}`,
      insatisfeitos: drizzleSql`${camMetricasHorarias.insatisfeitos} + ${unsatisfiedInc}`,
    }).where(and(
      eq(camMetricasHorarias.unitId, input.unitId),
      eq(camMetricasHorarias.data, todayStr as any),
      eq(camMetricasHorarias.hora, currentHour)
    ));
  } else {
    await db.insert(camMetricasHorarias).values({
      unitId: input.unitId,
      data: todayStr as any,
      hora: currentHour,
      totalDeteccoes: 1,
      satisfeitos: satisfiedInc,
      neutros: neutralInc,
      insatisfeitos: unsatisfiedInc,
    });
  }

  return { clienteId, isNewCliente };
}

// ─── Helpers de data/hora (replicados do vipCam router) ──────────────────────

function todayBRT(): string {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 10);
}

function hourBRT(): number {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return brt.getUTCHours();
}

function calcFinalSatisfactionLevel(
  timeline: Array<{ satisfactionLevel: string }>
): "satisfied" | "neutral" | "unsatisfied" {
  const total = timeline.length;
  if (total === 0) return "neutral";

  const satisfied = timeline.filter(t => t.satisfactionLevel === "satisfied").length;
  const unsatisfied = timeline.filter(t => t.satisfactionLevel === "unsatisfied").length;

  const pctUnsatisfied = unsatisfied / total;

  if (satisfied >= 1) return "satisfied";
  if (pctUnsatisfied >= 0.25) return "unsatisfied";
  return "neutral";
}

// ─── Inicialização via banco ──────────────────────────────────────────────────

/**
 * Inicializa workers para todas as câmeras IP ativas no banco.
 * Chamado no startup do servidor.
 */
export async function initWorkersFromDb(): Promise<void> {
  try {
    const { getDb } = await import("./db");
    const { sql } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) {
      console.warn("[IP Worker] Banco indisponível no startup, workers não inicializados");
      return;
    }

    const [rows] = await db.execute(sql`
      SELECT unitId, rtspUrl, rtspLogin, rtspPassword
      FROM cam_camera_config
      WHERE cameraType = 'ip' AND active = 1 AND rtspUrl IS NOT NULL
    `) as any;

    const configs = rows as Array<{
      unitId: number;
      rtspUrl: string;
      rtspLogin: string | null;
      rtspPassword: string | null;
    }>;

    if (!configs.length) {
      console.log("[IP Worker] Nenhuma câmera IP ativa encontrada no banco");
      return;
    }

    for (const config of configs) {
      const rtspUrl = buildRtspUrl(config);
      if (rtspUrl) {
        startWorker(config.unitId, rtspUrl);
      }
    }

    console.log(`[IP Worker] ${configs.length} worker(s) iniciado(s) no startup`);

    // Pré-carregar modelos de reconhecimento facial em background
    // (não bloqueia o startup — modelos são carregados assincronamente)
    setTimeout(async () => {
      try {
        const { initFaceRecognition } = await import("./faceRecognitionService");
        await initFaceRecognition();
        console.log("[IP Worker] Modelos de reconhecimento facial pré-carregados");
      } catch (err) {
        console.warn("[IP Worker] Aviso: falha ao pré-carregar modelos faciais:", err);
      }
    }, 5_000); // aguarda 5s para o servidor estabilizar

  } catch (err) {
    console.error("[IP Worker] Erro ao inicializar workers do banco:", err);
  }
}

/**
 * Monta a URL RTSP completa a partir dos campos separados ou da URL direta.
 */
function buildRtspUrl(config: {
  rtspUrl: string | null;
  rtspLogin: string | null;
  rtspPassword: string | null;
}): string | null {
  if (!config.rtspUrl) return null;
  try {
    const parsed = new URL(config.rtspUrl);
    if (parsed.username || !config.rtspLogin) return config.rtspUrl;
    parsed.username = encodeURIComponent(config.rtspLogin);
    parsed.password = encodeURIComponent(config.rtspPassword ?? "");
    return parsed.toString();
  } catch {
    return config.rtspUrl;
  }
}
