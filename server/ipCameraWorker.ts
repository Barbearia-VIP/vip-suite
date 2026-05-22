/**
 * IP Camera Worker — Captura contínua server-side
 *
 * Mantém um stream ffmpeg permanente por unidade, independente do browser.
 * - Reconecta automaticamente quando o stream cai
 * - Expõe o último frame JPEG via getLastFrame(unitId)
 * - Não para quando o browser fecha ou troca de página
 * - Gerenciado via startWorker/stopWorker por unitId
 */
import { spawn, ChildProcess } from "child_process";
import ffmpegStatic from "ffmpeg-static";

const FFMPEG_BIN = ffmpegStatic ?? "ffmpeg";

// Intervalo de reconexão em caso de falha (ms)
const RECONNECT_DELAY_MS = 5_000;
// Máximo de tentativas consecutivas antes de aumentar o delay
const MAX_FAST_RETRIES = 3;

interface WorkerState {
  unitId: number;
  rtspUrl: string;
  ffmpeg: ChildProcess | null;
  lastFrame: Buffer | null;
  lastFrameAt: number; // timestamp do último frame recebido
  running: boolean;    // true enquanto o worker deve continuar
  retryCount: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  startedAt: number;
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
  };
  workers.set(unitId, state);
  console.log(`[IP Worker] Unit ${unitId}: iniciando worker (${rtspUrl.replace(/:[^:@]*@/, ':***@')})`);
  spawnFfmpeg(state);
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
 * Retorna status de todos os workers ativos.
 */
export function getWorkersStatus(): Array<{
  unitId: number;
  running: boolean;
  hasFrame: boolean;
  lastFrameAge: number; // segundos desde o último frame
  uptime: number;       // segundos desde o início
  retryCount: number;
}> {
  const now = Date.now();
  return Array.from(workers.values()).map(s => ({
    unitId: s.unitId,
    running: s.running && s.ffmpeg !== null,
    hasFrame: s.lastFrame !== null,
    lastFrameAge: s.lastFrameAt > 0 ? Math.round((now - s.lastFrameAt) / 1000) : -1,
    uptime: Math.round((now - s.startedAt) / 1000),
    retryCount: s.retryCount,
  }));
}

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
