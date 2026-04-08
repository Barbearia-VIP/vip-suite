/**
 * db-external.ts
 * Conexão com o banco MySQL externo (franquia_producao) via túnel SSH.
 * O túnel é criado uma única vez na inicialização do servidor e reutilizado.
 * Inclui retry automático para queries que falham por conexão fechada.
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
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY_MS = 30 * 1000; // máximo 30s entre tentativas (era 5 min)

// ─── Semáforo de concorrência ─────────────────────────────────────────────────
// Limita queries simultâneas para não saturar o túnel SSH
const MAX_CONCURRENT = 6;
let activeQueries = 0;
const queryQueue: Array<() => void> = [];

function acquireSemaphore(): Promise<void> {
  return new Promise((resolve) => {
    if (activeQueries < MAX_CONCURRENT) {
      activeQueries++;
      resolve();
    } else {
      queryQueue.push(() => { activeQueries++; resolve(); });
    }
  });
}

function releaseSemaphore() {
  activeQueries--;
  const next = queryQueue.shift();
  if (next) next();
}

// ─── Criar túnel SSH ─────────────────────────────────────────────────────────

function destroyTunnel() {
  tunnelReady = false;
  tunnelPromise = null;
  if (pool) {
    pool.end().catch(() => {});
    pool = null;
  }
  if (tunnelServer) {
    tunnelServer.close();
    tunnelServer = null;
  }
  if (sshClient) {
    sshClient.destroy();
    sshClient = null;
  }
}

function scheduleReconnect(baseDelayMs = 3000) {
  if (reconnectTimer) return;
  // Backoff exponencial: 3s, 6s, 12s, 24s, 30s (máx)
  reconnectAttempts++;
  const delay = Math.min(baseDelayMs * Math.pow(2, reconnectAttempts - 1), MAX_RECONNECT_DELAY_MS);
  console.log(`[SSH Tunnel] Aguardando ${Math.round(delay / 1000)}s antes de reconectar (tentativa ${reconnectAttempts})...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    createTunnel().catch(console.error);
  }, delay);
}

function createTunnel(): Promise<void> {
  if (tunnelReady && pool) return Promise.resolve();
  if (tunnelPromise) return tunnelPromise;

  tunnelPromise = new Promise<void>((resolve, reject) => {
    const ssh = new SshClient();

    ssh.on("ready", () => {
      reconnectAttempts = 0; // reset backoff ao conectar com sucesso
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
          connectionLimit: 15,       // aumentado para 15
          queueLimit: 100,
          connectTimeout: 30000,     // 30s para conectar
          ssl: { rejectUnauthorized: false },
          enableKeepAlive: true,
          keepAliveInitialDelay: 10000,
        });
        // Detectar erros no pool e reconectarr
        pool.on("connection", (conn) => {
          conn.on("error", (err) => {
            console.warn("[SSH Tunnel] Erro na conexão do pool:", err.message);
          });
        });

        tunnelServer = server;
        sshClient = ssh;
        tunnelReady = true;
        resolve();
      });

      server.on("error", (err: NodeJS.ErrnoException) => {
        // Se a porta já está em uso, o túnel provavelmente já existe
        if (err.code === "EADDRINUSE") {
          console.warn("[SSH Tunnel] Porta já em uso — reutilizando pool existente");
          if (!pool) {
            pool = mysql.createPool({
              host: "127.0.0.1",
              port: LOCAL_TUNNEL_PORT,
              user: DB_USER,
              password: DB_PASS,
              database: DB_NAME,
              waitForConnections: true,
              connectionLimit: 15,
              queueLimit: 100,
              connectTimeout: 30000,
              ssl: { rejectUnauthorized: false },
              enableKeepAlive: true,
              keepAliveInitialDelay: 10000,
            });
          }
          tunnelServer = server;
          sshClient = ssh;
          tunnelReady = true;
          resolve();
        } else {
          console.error("[SSH Tunnel] Erro no servidor local:", err.message);
          reject(err);
        }
      });
    });

    ssh.on("error", (err) => {
      console.error("[SSH Tunnel] Erro SSH:", err.message);
      tunnelPromise = null;
      reject(err);
    });

    ssh.on("close", () => {
      console.warn("[SSH Tunnel] Conexão SSH fechada — reconectando...");
      destroyTunnel();
      scheduleReconnect(2000);
    });

    ssh.connect({
      host: SSH_HOST,
      port: SSH_PORT,
      username: SSH_USER,
      password: SSH_PASS,
      readyTimeout: 10000,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3,
      // Algoritmos compatíveis com OpenSSH moderno
      algorithms: {
        kex: [
          "curve25519-sha256",
          "curve25519-sha256@libssh.org",
          "ecdh-sha2-nistp256",
          "ecdh-sha2-nistp384",
          "ecdh-sha2-nistp521",
          "diffie-hellman-group-exchange-sha256",
          "diffie-hellman-group14-sha256",
        ],
        serverHostKey: [
          "rsa-sha2-512",
          "rsa-sha2-256",
          "ecdsa-sha2-nistp256",
          "ssh-ed25519",
        ],
        cipher: [
          "aes128-gcm@openssh.com",
          "aes256-gcm@openssh.com",
          "aes128-ctr",
          "aes192-ctr",
          "aes256-ctr",
        ],
        hmac: [
          "hmac-sha2-256-etm@openssh.com",
          "hmac-sha2-512-etm@openssh.com",
          "hmac-sha2-256",
          "hmac-sha2-512",
        ],
        compress: ["none"],
      },
    });
  });

  return tunnelPromise;
}

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Retorna o pool MySQL externo, criando o túnel SSH se necessário.
 */
/** Retorna true se o túnel SSH está ativo e o pool MySQL disponível */
export function isTunnelReady(): boolean {
  return tunnelReady && pool !== null;
}

export async function getExternalPool(): Promise<Pool> {
  if (!tunnelReady || !pool) {
    await createTunnel();
  }
  return pool!;
}

/**
 * Executa uma query no banco externo com retry automático em caso de
 * erro de conexão (ECONNRESET, PROTOCOL_CONNECTION_LOST, etc.).
 */
// Timeout por query individual (ms) — evita que queries lentas travem indefinidamente
const QUERY_TIMEOUT_MS = 25000;

export async function queryExternal<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
  retries = 3
): Promise<T[]> {
  await acquireSemaphore();
  try {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const p = await getExternalPool();
      const queryPromise = p.execute(sql, params);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error('Query execution was interrupted by timeout'), { code: 'ER_QUERY_INTERRUPTED', errno: 3024 })), QUERY_TIMEOUT_MS)
      );
      const [rows] = await Promise.race([queryPromise, timeoutPromise]) as [T[], unknown];
      return rows as T[];
    } catch (err: any) {
      const isConnectionError =
        err?.code === "PROTOCOL_CONNECTION_LOST" ||
        err?.code === "ECONNRESET" ||
        err?.code === "ECONNREFUSED" ||
        err?.fatal === true ||
        err?.message?.includes("closed state") ||
        err?.message?.includes("Connection lost");

      // Timeout de execução de query — retenta com delay crescente
      const isTimeoutError =
        err?.code === "ER_QUERY_INTERRUPTED" ||
        err?.errno === 3024 ||
        err?.message?.includes("maximum statement execution time exceeded") ||
        err?.message?.includes("Query execution was interrupted");

      if (isConnectionError && attempt < retries) {
        console.warn(
          `[SSH Tunnel] Erro de conexão na tentativa ${attempt + 1}/${retries + 1}: ${err.message}. Reconectando...`
        );
        destroyTunnel();
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        await createTunnel();
        continue;
      }

      if (isTimeoutError && attempt < retries) {
        const delay = 2000 * (attempt + 1);
        console.warn(
          `[SSH Tunnel] Timeout de query na tentativa ${attempt + 1}/${retries + 1}. Retentando em ${delay}ms...`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw err;
    }
  }
  throw new Error("queryExternal: número máximo de tentativas atingido");
  } finally {
    releaseSemaphore();
  }
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
