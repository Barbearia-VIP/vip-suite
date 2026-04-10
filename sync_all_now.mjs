/**
 * Script de sincronização imediata:
 * 1. Sincroniza sync_usuarios (com comissao_produto e comissao_servico) do banco externo
 * 2. Re-sincroniza comissões do GT financeiro com os novos percentuais nativos
 */
import mysql from "mysql2/promise";
import { Client as SshClient } from "ssh2";
import net from "net";
import dotenv from "dotenv";
dotenv.config({ path: "/home/ubuntu/vip-suite/.env" });

const SSH_HOST = process.env.SSH_TUNNEL_HOST;
const SSH_PORT = parseInt(process.env.SSH_TUNNEL_PORT || "22");
const SSH_USER = process.env.SSH_TUNNEL_USER;
const SSH_PASS = process.env.SSH_TUNNEL_PASS;
const DB_USER = process.env.DB_EXT_USER;
const DB_PASS = process.env.DB_EXT_PASS;
const DB_NAME = process.env.DB_EXT_NAME;
const LOCAL_PORT = 13310;

// Banco local
const localUrl = new URL(process.env.DATABASE_URL);
const localConn = await mysql.createConnection({
  host: localUrl.hostname,
  port: parseInt(localUrl.port || "3306"),
  user: localUrl.username,
  password: localUrl.password,
  database: localUrl.pathname.replace("/", ""),
  ssl: { rejectUnauthorized: false },
});

// Criar túnel SSH para banco externo
async function createTunnel() {
  return new Promise((resolve, reject) => {
    const ssh = new SshClient();
    const server = net.createServer((sock) => {
      ssh.forwardOut("127.0.0.1", LOCAL_PORT, "127.0.0.1", 3306, (err, stream) => {
        if (err) { sock.destroy(); return; }
        sock.pipe(stream).pipe(sock);
      });
    });
    ssh.on("ready", () => {
      server.listen(LOCAL_PORT, "127.0.0.1", async () => {
        const extConn = await mysql.createConnection({
          host: "127.0.0.1", port: LOCAL_PORT,
          user: DB_USER, password: DB_PASS, database: DB_NAME,
        });
        resolve({ extConn, ssh, server });
      });
    });
    ssh.on("error", reject);
    ssh.connect({ host: SSH_HOST, port: SSH_PORT, username: SSH_USER, password: SSH_PASS });
  });
}

console.log("Conectando ao banco externo via SSH...");
const { extConn, ssh, server } = await createTunnel();
console.log("Conectado!");

// 1. Buscar todos os usuários com comissao_produto e comissao_servico
const [usuarios] = await extConn.query(
  `SELECT id, unidade, nome, status, visivel_agenda, visivel_pdv, visivel_dashboard,
          comissao_produto, comissao_servico, data_criacao, data_alteracao
   FROM usuarios WHERE status IN (0,1)`
);
console.log(`Encontrados ${usuarios.length} usuários no banco externo`);

// 2. Upsert em lote no banco local
let updated = 0;
const BATCH = 100;
for (let i = 0; i < usuarios.length; i += BATCH) {
  const batch = usuarios.slice(i, i + BATCH);
  const placeholders = batch.map(() => "(?,?,?,?,?,?,?,?,?,?,?)").join(",");
  const values = batch.flatMap(u => [
    u.id, u.unidade, u.nome, u.status,
    u.visivel_agenda, u.visivel_pdv, u.visivel_dashboard,
    u.comissao_produto ?? null, u.comissao_servico ?? null,
    u.data_criacao, u.data_alteracao
  ]);
  await localConn.query(
    `INSERT INTO sync_usuarios 
       (id, unidade, nome, status, visivel_agenda, visivel_pdv, visivel_dashboard,
        comissao_produto, comissao_servico, data_criacao, data_alteracao)
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE
       nome = VALUES(nome), status = VALUES(status),
       visivel_agenda = VALUES(visivel_agenda), visivel_pdv = VALUES(visivel_pdv),
       visivel_dashboard = VALUES(visivel_dashboard),
       comissao_produto = VALUES(comissao_produto),
       comissao_servico = VALUES(comissao_servico),
       data_alteracao = VALUES(data_alteracao),
       synced_at = NOW()`,
    values
  );
  updated += batch.length;
}
console.log(`✓ ${updated} usuários sincronizados com comissao_produto e comissao_servico`);

// 3. Verificar resultado
const [sample] = await localConn.query(
  `SELECT id, nome, unidade, comissao_servico, comissao_produto 
   FROM sync_usuarios WHERE visivel_agenda != 'nenhuma' AND unidade = 1 LIMIT 5`
);
console.log("Amostra de barbeiros da unidade 1:");
console.table(sample);

await extConn.end();
await localConn.end();
server.close();
ssh.end();
console.log("Sincronização concluída!");
