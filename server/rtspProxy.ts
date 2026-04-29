/**
 * RTSP → WebSocket Proxy
 *
 * Converte streams RTSP de câmeras IP em frames JPEG enviados via WebSocket.
 * O WebSocket funciona corretamente através do Cloudflare (HTTP/2 bufferiza MJPEG).
 *
 * Fluxo:
 *   Browser → WS /api/vip-cam/ws/:unitId
 *   Server  → busca URL RTSP no banco → inicia ffmpeg → frames JPEG → WebSocket → browser
 *
 * O frontend recebe cada frame como ArrayBuffer (binary) e exibe via URL.createObjectURL.
 */

import { type Express, type Request } from "express";
import { spawn, type ChildProcess } from "child_process";
import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { getDb } from "./db";
import { sql } from "drizzle-orm";
import ffmpegStatic from "ffmpeg-static";
import type { Server } from "http";

// Usa o binário do ffmpeg-static (bundled) se disponível, caso contrário usa o do PATH
const FFMPEG_BIN = ffmpegStatic ?? "ffmpeg";

interface ActiveStream {
  ffmpeg: ChildProcess;
  clients: Set<WebSocket>;
  lastFrame: Buffer | null;
  startedAt: number;
}

// Mapa de streams ativos por unitId
const activeStreams = new Map<number, ActiveStream>();

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
 * Inicia o ffmpeg para o stream RTSP e registra o cliente WebSocket.
 */
function startStream(unitId: number, rtspUrl: string, ws: WebSocket): void {
  let stream = activeStreams.get(unitId);

  if (!stream) {
    // -rtsp_transport tcp: encapsula RTP sobre TCP (necessário quando UDP é bloqueado por firewall/NAT)
    // -f mjpeg: output MJPEG (frames JPEG individuais)
    // -q:v 5: qualidade JPEG (1=melhor, 31=pior)
    // -r 10: 10 fps
    // -vf scale=1280:-2: redimensiona para 1280px de largura
    // pipe:1: output para stdout
    const ffmpeg = spawn(FFMPEG_BIN, [
      "-loglevel", "error",
      "-rtsp_transport", "tcp",
      "-i", rtspUrl,
      "-an",
      "-f", "mjpeg",
      "-q:v", "5",
      "-r", "10",
      "-vf", "scale=1280:-2",
      "pipe:1",
    ]);

    stream = {
      ffmpeg,
      clients: new Set(),
      lastFrame: null,
      startedAt: Date.now(),
    };
    activeStreams.set(unitId, stream);

    // Acumula dados do ffmpeg em frames JPEG
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
        stream!.lastFrame = frame;
        processed = true;
        // Envia frame para todos os clientes WebSocket conectados
        for (const client of Array.from(stream!.clients)) {
          if (client.readyState === WebSocket.OPEN) {
            try {
              client.send(frame);
            } catch {
              stream!.clients.delete(client);
            }
          } else {
            stream!.clients.delete(client);
          }
        }
      }
    });

    ffmpeg.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString();
      if (!msg.includes("frame=") && !msg.includes("fps=")) {
        console.error(`[RTSP Proxy] Unit ${unitId}: ${msg.trim()}`);
      }
    });

    ffmpeg.on("close", (code) => {
      console.log(`[RTSP Proxy] Unit ${unitId}: ffmpeg encerrado (code=${code})`);
      const s = activeStreams.get(unitId);
      if (s) {
        for (const client of Array.from(s.clients)) {
          try { client.close(); } catch {}
        }
        activeStreams.delete(unitId);
      }
    });
  }

  // Registra o cliente WebSocket
  stream.clients.add(ws);

  // Envia o último frame imediatamente se disponível
  if (stream.lastFrame && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(stream.lastFrame);
    } catch {}
  }

  // Remove cliente quando desconectar
  ws.on("close", () => {
    const s = activeStreams.get(unitId);
    if (s) {
      s.clients.delete(ws);
      if (s.clients.size === 0) {
        setTimeout(() => {
          const current = activeStreams.get(unitId);
          if (current && current.clients.size === 0) {
            console.log(`[RTSP Proxy] Unit ${unitId}: sem clientes, encerrando ffmpeg`);
            current.ffmpeg.kill("SIGTERM");
            activeStreams.delete(unitId);
          }
        }, 30_000);
      }
    }
  });
}

/**
 * Registra as rotas do proxy RTSP no servidor HTTP (WebSocket + HTTP).
 */
export async function registerRtspProxyRoutes(app: Express, server: Server): Promise<void> {
  // WebSocket server para streams de câmera
  const wss = new WebSocketServer({ noServer: true });

  // Upgrade HTTP → WebSocket para /api/vip-cam/ws/:unitId
  server.on("upgrade", async (req: IncomingMessage, socket, head) => {
    const url = req.url ?? "";
    const match = url.match(/^\/api\/vip-cam\/ws\/(\d+)$/);
    if (!match) return; // Não é nosso WebSocket, ignora

    const unitId = parseInt(match[1], 10);
    if (isNaN(unitId) || unitId <= 0) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, async (ws) => {
      try {
        const db = await getDb();
        if (!db) {
          ws.close(1011, "Banco de dados indisponível");
          return;
        }

        const [rows] = await db.execute(sql`
          SELECT rtspUrl, rtspLogin, rtspPassword, cameraType
          FROM cam_camera_config
          WHERE unitId = ${unitId}
          LIMIT 1
        `) as any;

        const config = (rows as any[])[0];
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

        startStream(unitId, rtspUrl, ws);
      } catch (err) {
        console.error("[RTSP Proxy] Erro no WebSocket:", err);
        try { ws.close(1011, "Erro interno"); } catch {}
      }
    });
  });

  // GET /api/vip-cam/streams/status — status dos streams ativos (diagnóstico)
  app.get("/api/vip-cam/streams/status", (_req, res) => {
    const streams = Array.from(activeStreams.entries()).map(([unitId, s]) => ({
      unitId,
      clients: s.clients.size,
      uptime: Math.round((Date.now() - s.startedAt) / 1000),
      hasLastFrame: s.lastFrame !== null,
    }));
    res.json({ streams });
  });

  // GET /api/vip-cam/stream/:unitId/snapshot — captura um frame JPEG único (HTTP)
  app.get("/api/vip-cam/stream/:unitId/snapshot", async (req, res) => {
    const unitId = parseInt(req.params.unitId, 10);
    if (isNaN(unitId) || unitId <= 0) {
      res.status(400).json({ error: "unitId inválido" });
      return;
    }

    // Se há stream ativo com último frame, retorna imediatamente
    const active = activeStreams.get(unitId);
    if (active?.lastFrame) {
      res.set("Content-Type", "image/jpeg");
      res.set("Cache-Control", "no-cache");
      res.send(active.lastFrame);
      return;
    }

    try {
      const db = await getDb();
      if (!db) {
        res.status(503).json({ error: "Banco de dados indisponível" });
        return;
      }

      const [rows] = await db.execute(sql`
        SELECT rtspUrl, rtspLogin, rtspPassword, cameraType
        FROM cam_camera_config
        WHERE unitId = ${unitId}
        LIMIT 1
      `) as any;

      const config = (rows as any[])[0];
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

      // Captura um único frame com ffmpeg
      const ffmpeg = spawn(FFMPEG_BIN, [
        "-loglevel", "error",
        "-rtsp_transport", "tcp",
        "-i", rtspUrl,
        "-frames:v", "1",
        "-f", "image2",
        "-vcodec", "mjpeg",
        "pipe:1",
      ]);

      const chunks: Buffer[] = [];
      ffmpeg.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));

      ffmpeg.on("close", (code) => {
        if (code === 0 && chunks.length > 0) {
          const frame = Buffer.concat(chunks);
          res.set("Content-Type", "image/jpeg");
          res.set("Cache-Control", "no-cache");
          res.send(frame);
        } else {
          if (!res.headersSent) {
            res.status(500).json({ error: "Falha ao capturar frame" });
          }
        }
      });

      ffmpeg.on("error", (err) => {
        console.error("[RTSP Proxy] Snapshot error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Erro ao iniciar ffmpeg" });
        }
      });

      // Timeout de 15 segundos
      setTimeout(() => {
        ffmpeg.kill("SIGTERM");
        if (!res.headersSent) {
          res.status(504).json({ error: "Timeout ao capturar frame" });
        }
      }, 15_000);

    } catch (err) {
      console.error("[RTSP Proxy] Snapshot error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Erro interno" });
      }
    }
  });
}
