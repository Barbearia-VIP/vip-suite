/**
 * db-external.ts
 * Conexão com o banco MySQL externo (franquia_producao) via túnel SSH.
 * O túnel é criado uma única vez na inicialização do servidor e reutilizado.
 */

import { Client as SshClient } from "ssh2";
import mysql, { Pool } from "mysql2/promise";
import net from "net";

// ─── Configuração ────────────────────────────────────────────────────────────

const SSH_HOST = process.env.SSH_TUNNEL_HOST ?? "";
const SSH_PORT = parseInt(process.env.SSH_TUNNEL_PORT ?? "22");
const SSH_USER = process.env.SSH_TUNNEL_USER ?? "";
const SSH_PASS = process.env.SSH_TUNNEL_PASS ?? "";

const DB_HOST = "127.0.0.1"; // destino dentro do servidor SSH
const DB_PORT = 3306;
const DB_USER = process.env.DB_EXT_USER ?? "";
const DB_PASS = process.env.DB_EXT_PASS ?? "";
const DB_NAME = process.env.DB_EXT_NAME ?? "";

// Porta local do túnel (escolhida aleatoriamente para evitar conflitos)
const LOCAL_TUNNEL_PORT = 13307;

// ─── Estado do túnel ─────────────────────────────────────────────────────────

let sshClient: SshClient | null = null;
let tunnelServer: net.Server | null = null;
let pool: Pool | null = null;
let tunnelReady = false;
let tunnelPromise: Promise<void> | null = null;

// ─── Criar túnel SSH ─────────────────────────────────────────────────────────

function createTunnel(): Promise<void> {
  if (tunnelReady && pool) return Promise.resolve();
  if (tunnelPromise) return tunnelPromise;

  tunnelPromise = new Promise<void>((resolve, reject) => {
    const ssh = new SshClient();

    ssh.on("ready", () => {
      console.log("[SSH Tunnel] Conexão SSH estabelecida");

      // Criar servidor TCP local que encaminha para o MySQL remoto
      const server = net.createServer((sock) => {
        ssh.forwardOut(
          "127.0.0.1",
          sock.localPort ?? LOCAL_TUNNEL_PORT,
          DB_HOST,
          DB_PORT,
          (err, stream) => {
            if (err) {
              console.error("[SSH Tunnel] Erro no forwardOut:", err.message);
              sock.destroy();
              return;
            }
            sock.pipe(stream);
            stream.pipe(sock);
            stream.on("close", () => sock.destroy());
            sock.on("close", () => stream.destroy());
          }
        );
      });

      server.listen(LOCAL_TUNNEL_PORT, "127.0.0.1", () => {
        console.log(`[SSH Tunnel] Túnel local na porta ${LOCAL_TUNNEL_PORT}`);

        // Criar pool MySQL apontando para o túnel local
        pool = mysql.createPool({
          host: "127.0.0.1",
          port: LOCAL_TUNNEL_PORT,
          user: DB_USER,
          password: DB_PASS,
          database: DB_NAME,
          waitForConnections: true,
          connectionLimit: 5,
          queueLimit: 0,
          connectTimeout: 15000,
          ssl: { rejectUnauthorized: false },
        });

        tunnelServer = server;
        sshClient = ssh;
        tunnelReady = true;
        resolve();
      });

      server.on("error", (err) => {
        console.error("[SSH Tunnel] Erro no servidor local:", err.message);
        reject(err);
      });
    });

    ssh.on("error", (err) => {
      console.error("[SSH Tunnel] Erro SSH:", err.message);
      tunnelPromise = null;
      reject(err);
    });

    ssh.on("close", () => {
      console.warn("[SSH Tunnel] Conexão SSH fechada — reconectando...");
      tunnelReady = false;
      tunnelPromise = null;
      pool = null;
      if (tunnelServer) {
        tunnelServer.close();
        tunnelServer = null;
      }
      // Reconectar após 3 segundos
      setTimeout(() => {
        createTunnel().catch(console.error);
      }, 3000);
    });

    ssh.connect({
      host: SSH_HOST,
      port: SSH_PORT,
      username: SSH_USER,
      password: SSH_PASS,
      readyTimeout: 20000,
      keepaliveInterval: 30000,
      keepaliveCountMax: 3,
    });
  });

  return tunnelPromise;
}

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Retorna o pool MySQL externo, criando o túnel SSH se necessário.
 */
export async function getExternalPool(): Promise<Pool> {
  if (!tunnelReady || !pool) {
    await createTunnel();
  }
  return pool!;
}

/**
 * Executa uma query no banco externo e retorna as linhas.
 * Uso: const rows = await queryExternal<MyType>("SELECT ...", [params])
 */
export async function queryExternal<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const p = await getExternalPool();
  const [rows] = await p.execute(sql, params);
  return rows as T[];
}

/**
 * Inicializa o túnel SSH na startup do servidor.
 * Chamar em server/index.ts ou similar.
 */
export async function initExternalDb(): Promise<void> {
  if (!SSH_HOST || !SSH_USER || !SSH_PASS || !DB_USER || !DB_PASS || !DB_NAME) {
    console.warn(
      "[SSH Tunnel] Credenciais do banco externo não configuradas — Data VIP desativado"
    );
    return;
  }
  try {
    await createTunnel();
    // Testar conexão
    const rows = await queryExternal<{ ok: number }>("SELECT 1 as ok");
    if (rows[0]?.ok === 1) {
      console.log("[SSH Tunnel] Banco externo conectado com sucesso ✓");
    }
  } catch (err) {
    console.error("[SSH Tunnel] Falha ao conectar banco externo:", err);
  }
}
