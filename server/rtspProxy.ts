/**
 * RTSP Proxy — Rotas HTTP/WebSocket para câmeras IP
 *
 * O stream RTSP é gerenciado pelo ipCameraWorker.ts (worker permanente, independente do browser).
 * Este arquivo expõe as rotas:
 *   - GET  /api/vip-cam/stream/:unitId/snapshot  → último frame JPEG do worker
 *   - WS   /api/vip-cam/ws/:unitId               → stream de frames em tempo real via WebSocket
 *   - POST /api/vip-cam/worker/:unitId/start      → inicia/reinicia o worker
 *   - POST /api/vip-cam/worker/:unitId/stop       → para o worker
 *   - GET  /api/vip-cam/streams/status            → status de todos os workers
 */
import { type Express } from "express";
import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { getDb } from "./db";
import { sql } from "drizzle-orm";
import type { Server } from "http";
import {
  startWorker,
  stopWorker,
  getLastFrame,
  getLastFrameAt,
  getWorkersStatus,
  getLastDetections,
  initWorkersFromDb,
} from "./ipCameraWorker";

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

/**
 * Busca a configuração da câmera IP no banco para uma unidade.
 */
async function getCameraConfig(unitId: number) {
  const db = await getDb();
  if (!db) return null;
  const [rows] = await db.execute(sql`
    SELECT rtspUrl, rtspLogin, rtspPassword, cameraType
    FROM cam_camera_config
    WHERE unitId = ${unitId}
    LIMIT 1
  `) as any;
  return (rows as any[])[0] ?? null;
}

/**
 * Registra as rotas do proxy RTSP no servidor HTTP (WebSocket + HTTP).
 */
export async function registerRtspProxyRoutes(app: Express, server: Server): Promise<void> {
  // Inicializa workers para todas as câmeras IP ativas no banco (com delay para aguardar o banco)
  setTimeout(() => {
    initWorkersFromDb().catch(err =>
      console.error("[RTSP Proxy] Erro ao inicializar workers:", err)
    );
  }, 3_000);

  // ── WebSocket: stream de frames em tempo real ─────────────────────────────
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req: IncomingMessage, socket, head) => {
    const url = req.url ?? "";
    const match = url.match(/^\/api\/vip-cam\/ws\/(\d+)$/);
    if (!match) return;

    const unitId = parseInt(match[1], 10);
    if (isNaN(unitId) || unitId <= 0) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, async (ws) => {
      try {
        const config = await getCameraConfig(unitId);
        if (!config) {
          ws.close(1008, "Câmera não configurada para esta unidade");
          return;
        }
        if (config.cameraType !== "ip") {
          ws.close(1008, "Esta unidade usa câmera USB, não IP");
          return;
        }
        const rtspUrl = buildRtspUrl(config);
        if (!rtspUrl) {
          ws.close(1008, "URL RTSP não configurada");
          return;
        }

        // Garante que o worker está rodando
        startWorker(unitId, rtspUrl);

        // Envia o último frame imediatamente se disponível
        const lastFrame = getLastFrame(unitId);
        if (lastFrame && ws.readyState === WebSocket.OPEN) {
          try { ws.send(lastFrame); } catch {}
        }

        // Polling: envia frames do worker para o cliente WebSocket a cada 100ms (máx 10fps)
        let lastSentAt = getLastFrameAt(unitId);
        const interval = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            clearInterval(interval);
            return;
          }
          const frameAt = getLastFrameAt(unitId);
          if (frameAt > lastSentAt) {
            const frame = getLastFrame(unitId);
            if (frame) {
              try {
                ws.send(frame);
                lastSentAt = frameAt;
              } catch {
                clearInterval(interval);
              }
            }
          }
        }, 100);

        ws.on("close", () => clearInterval(interval));
        ws.on("error", () => clearInterval(interval));

      } catch (err) {
        console.error("[RTSP Proxy] Erro no WebSocket:", err);
        try { ws.close(1011, "Erro interno"); } catch {}
      }
    });
  });

  // ── GET /api/vip-cam/streams/status ───────────────────────────────────────
  app.get("/api/vip-cam/streams/status", (_req, res) => {
    res.json({ streams: getWorkersStatus() });
  });

  // ── GET /api/vip-cam/stream/:unitId/detections ───────────────────────────
  // Retorna as últimas detecções (face boxes) para overlay no frontend
  app.get("/api/vip-cam/stream/:unitId/detections", (req, res) => {
    const unitId = parseInt(req.params.unitId, 10);
    if (isNaN(unitId) || unitId <= 0) {
      res.status(400).json({ error: "unitId inválido" });
      return;
    }
    res.set("Cache-Control", "no-cache, no-store");
    res.json({ detections: getLastDetections(unitId) });
  });
  // ── GET /api/vip-cam/stream/:unitId/snapshot ──────────────────────────────
  app.get("/api/vip-cam/stream/:unitId/snapshot", async (req, res) => {
    // Envia headers imediatamente para evitar timeout do Cloud Run/Cloudflare
    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", "no-cache, no-store");
    res.set("X-Accel-Buffering", "no");

    const unitId = parseInt(req.params.unitId, 10);
    if (isNaN(unitId) || unitId <= 0) {
      res.status(400).json({ error: "unitId inválido" });
      return;
    }

    // Se o worker tem um frame recente (< 5s), retorna imediatamente
    const lastFrame = getLastFrame(unitId);
    const lastFrameAge = Date.now() - getLastFrameAt(unitId);
    if (lastFrame && lastFrameAge < 5_000) {
      res.send(lastFrame);
      return;
    }

    // Tenta iniciar o worker se não estiver rodando
    const config = await getCameraConfig(unitId);
    if (!config || config.cameraType !== "ip") {
      res.status(404).json({ error: "Câmera IP não configurada para esta unidade" });
      return;
    }
    const rtspUrl = buildRtspUrl(config);
    if (!rtspUrl) {
      res.status(400).json({ error: "URL RTSP não configurada" });
      return;
    }

    startWorker(unitId, rtspUrl);

    // Se há frame (mesmo antigo), retorna enquanto o worker reconecta
    if (lastFrame) {
      res.send(lastFrame);
      return;
    }

    // Aguarda o worker capturar o primeiro frame (até 20s)
    const timeout = 20_000;
    const start = Date.now();
    const waitForFrame = () => {
      const frame = getLastFrame(unitId);
      if (frame) {
        if (!res.headersSent) res.send(frame);
        return;
      }
      if (Date.now() - start > timeout) {
        if (!res.headersSent) res.status(504).json({ error: "Timeout aguardando frame da câmera" });
        return;
      }
      setTimeout(waitForFrame, 200);
    };
    waitForFrame();
  });

  // ── POST /api/vip-cam/worker/:unitId/start ────────────────────────────────
  app.post("/api/vip-cam/worker/:unitId/start", async (req, res) => {
    const unitId = parseInt(req.params.unitId, 10);
    if (isNaN(unitId) || unitId <= 0) {
      res.status(400).json({ error: "unitId inválido" });
      return;
    }
    try {
      const config = await getCameraConfig(unitId);
      if (!config) {
        res.status(404).json({ error: "Câmera não configurada para esta unidade" });
        return;
      }
      if (config.cameraType !== "ip") {
        res.status(400).json({ error: "Esta unidade usa câmera USB, não IP" });
        return;
      }
      const rtspUrl = buildRtspUrl(config);
      if (!rtspUrl) {
        res.status(400).json({ error: "URL RTSP não configurada" });
        return;
      }
      startWorker(unitId, rtspUrl);
      res.json({ ok: true, message: `Worker iniciado para unidade ${unitId}` });
    } catch (err) {
      console.error("[RTSP Proxy] Erro ao iniciar worker:", err);
      res.status(500).json({ error: "Erro interno ao iniciar worker" });
    }
  });

  // ── POST /api/vip-cam/worker/:unitId/stop ─────────────────────────────────
  app.post("/api/vip-cam/worker/:unitId/stop", (req, res) => {
    const unitId = parseInt(req.params.unitId, 10);
    if (isNaN(unitId) || unitId <= 0) {
      res.status(400).json({ error: "unitId inválido" });
      return;
    }
    stopWorker(unitId);
    res.json({ ok: true, message: `Worker parado para unidade ${unitId}` });
  });
}
