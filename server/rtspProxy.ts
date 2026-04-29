/**
 * RTSP → MJPEG Proxy
 *
 * Converte streams RTSP de câmeras IP em MJPEG over HTTP,
 * formato suportado nativamente por todos os navegadores via <img src="...">.
 *
 * Fluxo:
 *   Browser → GET /api/vip-cam/stream/:unitId
 *   Server  → busca URL RTSP no banco → inicia ffmpeg → pipe MJPEG → browser
 */

import { type Express, type Request, type Response } from "express";
import { spawn, type ChildProcess } from "child_process";
import { getDb } from "./db";
import { sql } from "drizzle-orm";
import ffmpegStatic from "ffmpeg-static";

// Usa o binário do ffmpeg-static (bundled) se disponível, caso contrário usa o do PATH
// Isso garante funcionamento em produção onde o ffmpeg pode não estar instalado
const FFMPEG_BIN = ffmpegStatic ?? "ffmpeg";

interface ActiveStream {
  ffmpeg: ChildProcess;
  clients: Set<Response>;
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
    // Se a URL já tem credenciais, usa como está
    if (parsed.username || !config.rtspLogin) return config.rtspUrl;
    // Injeta credenciais
    parsed.username = encodeURIComponent(config.rtspLogin);
    parsed.password = encodeURIComponent(config.rtspPassword ?? "");
    return parsed.toString();
  } catch {
    return config.rtspUrl;
  }
}

/**
 * Inicia o ffmpeg para o stream RTSP e registra o cliente.
 */
function startStream(unitId: number, rtspUrl: string, res: Response): void {
  let stream = activeStreams.get(unitId);

  if (!stream) {
    // Inicia novo processo ffmpeg
    // -rtsp_transport tcp: usa TCP para evitar perda de pacotes UDP
    // -i <url>: input RTSP
    // -f mjpeg: output MJPEG
    // -q:v 5: qualidade JPEG (1=melhor, 31=pior)
    // -r 10: 10 fps (balanço entre fluidez e CPU)
    // -vf scale=1280:-2: redimensiona para 1280px de largura
    // pipe:1: output para stdout
    // -rtsp_transport tcp: encapsula RTP sobre TCP (necessário quando UDP é bloqueado por firewall/NAT)
    // -an: ignorar áudio (não necessário para MJPEG)
    // -vcodec copy não funciona para MJPEG — precisa decodificar e re-encodar
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
      // Um frame JPEG começa com FF D8 (SOI) e termina com FF D9 (EOI)
      let processed = true;
      while (processed) {
        processed = false;
        const soiIdx = buffer.indexOf(Buffer.from([0xff, 0xd8]));
        if (soiIdx === -1) break;
        // Descarta dados antes do SOI
        if (soiIdx > 0) buffer = buffer.slice(soiIdx);
        // Procura o EOI a partir do byte 2 (após o SOI)
        let eoiIdx = -1;
        for (let i = 2; i < buffer.length - 1; i++) {
          if (buffer[i] === 0xff && buffer[i + 1] === 0xd9) {
            eoiIdx = i + 2;
            break;
          }
        }
        if (eoiIdx === -1) break; // Frame incompleto — aguarda mais dados
        const frame = buffer.slice(0, eoiIdx);
        buffer = buffer.slice(eoiIdx);
        stream!.lastFrame = frame;
        processed = true;
        // Envia frame para todos os clientes conectados
        const header = `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`;
        for (const client of Array.from(stream!.clients)) {
          try {
            client.write(header);
            client.write(frame);
            client.write("\r\n");
          } catch {
            stream!.clients.delete(client);
          }
        }
      }
    });

    ffmpeg.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString();
      // Só loga erros relevantes
      if (!msg.includes("frame=") && !msg.includes("fps=")) {
        console.error(`[RTSP Proxy] Unit ${unitId}: ${msg.trim()}`);
      }
    });

    ffmpeg.on("close", (code) => {
      console.log(`[RTSP Proxy] Unit ${unitId}: ffmpeg encerrado (code=${code})`);
      // Fecha todos os clientes
      const s = activeStreams.get(unitId);
      if (s) {
        for (const client of Array.from(s.clients)) {
          try { client.end(); } catch {}
        }
        activeStreams.delete(unitId);
      }
    });
  }

  // Registra o cliente
  stream.clients.add(res);

  // Configura headers MJPEG
  res.writeHead(200, {
    "Content-Type": "multipart/x-mixed-replace; boundary=frame",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Connection": "keep-alive",
    "Transfer-Encoding": "chunked",
  });

  // Envia o último frame imediatamente se disponível
  if (stream.lastFrame) {
    const header = `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${stream.lastFrame.length}\r\n\r\n`;
    res.write(header);
    res.write(stream.lastFrame);
    res.write("\r\n");
  }

  // Remove cliente quando desconectar
  res.on("close", () => {
    const s = activeStreams.get(unitId);
    if (s) {
      s.clients.delete(res);
      // Se não há mais clientes, encerra o ffmpeg após 30s
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
 * Registra as rotas do proxy RTSP no Express.
 */
export async function registerRtspProxyRoutes(app: Express): Promise<void> {
  // GET /api/vip-cam/stream/:unitId — stream MJPEG ao vivo
  app.get("/api/vip-cam/stream/:unitId", async (req: Request, res: Response) => {
    const unitId = parseInt(req.params.unitId, 10);
    if (isNaN(unitId) || unitId <= 0) {
      res.status(400).json({ error: "unitId inválido" });
      return;
    }

    try {
      // Busca configuração da câmera no banco local
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

      startStream(unitId, rtspUrl, res);
    } catch (err) {
      console.error("[RTSP Proxy] Erro:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Erro interno ao iniciar stream" });
      }
    }
  });

  // GET /api/vip-cam/stream/:unitId/snapshot — captura um frame JPEG único
  app.get("/api/vip-cam/stream/:unitId/snapshot", async (req: Request, res: Response) => {
    const unitId = parseInt(req.params.unitId, 10);
    if (isNaN(unitId) || unitId <= 0) {
      res.status(400).json({ error: "unitId inválido" });
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
      if (!config || config.cameraType !== "ip") {
        res.status(404).json({ error: "Câmera IP não configurada" });
        return;
      }

      const rtspUrl = buildRtspUrl(config);
      if (!rtspUrl) {
        res.status(400).json({ error: "URL RTSP não configurada" });
        return;
      }

      // Captura um único frame via ffmpeg
      // -rtsp_transport tcp: necessário quando UDP é bloqueado por firewall/NAT
      const ffmpeg = spawn(FFMPEG_BIN, [
        "-loglevel", "error",
        "-rtsp_transport", "tcp",
        "-i", rtspUrl,
        "-an",
        "-frames:v", "1",
        "-f", "image2",
        "-vcodec", "mjpeg",
        "-q:v", "3",
        "pipe:1",
      ]);

      const chunks: Buffer[] = [];
      ffmpeg.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
      ffmpeg.on("close", (code) => {
        if (code === 0 && chunks.length > 0) {
          const frame = Buffer.concat(chunks);
          res.writeHead(200, {
            "Content-Type": "image/jpeg",
            "Content-Length": frame.length,
            "Cache-Control": "no-cache",
          });
          res.end(frame);
        } else {
          if (!res.headersSent) {
            res.status(502).json({ error: "Falha ao capturar frame da câmera" });
          }
        }
      });

      // Timeout de 10s para o snapshot
      setTimeout(() => {
        ffmpeg.kill("SIGTERM");
        if (!res.headersSent) {
          res.status(504).json({ error: "Timeout ao capturar frame" });
        }
      }, 10_000);
    } catch (err) {
      console.error("[RTSP Proxy] Snapshot error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Erro interno" });
      }
    }
  });

  // GET /api/vip-cam/stream/status — lista streams ativos
  app.get("/api/vip-cam/streams/status", (_req: Request, res: Response) => {
    const status = Array.from(activeStreams.entries()).map(([unitId, s]) => ({
      unitId,
      clients: s.clients.size,
      uptimeSeconds: Math.floor((Date.now() - s.startedAt) / 1000),
    }));
    res.json({ streams: status });
  });
}
