import { Client as SshClient } from "ssh2";
import mysql from "mysql2/promise";
import net from "net";
import dotenv from "dotenv";
dotenv.config();

const SSH_HOST = process.env.SSH_TUNNEL_HOST;
const SSH_PORT = parseInt(process.env.SSH_TUNNEL_PORT ?? "22");
const SSH_USER = process.env.SSH_TUNNEL_USER;
const SSH_PASS = process.env.SSH_TUNNEL_PASS;
const DB_HOST = process.env.DB_EXT_HOST ?? "127.0.0.1";
const DB_PORT = parseInt(process.env.DB_EXT_PORT ?? "3306");
const DB_USER = process.env.DB_EXT_USER;
const DB_PASS = process.env.DB_EXT_PASS;
const DB_NAME = process.env.DB_EXT_NAME;
const LOCAL_PORT = 13308; // porta diferente para não conflitar com o servidor

// Criar tunnel SSH
const sshClient = new SshClient();
const tunnelServer = net.createServer((sock) => {
  sshClient.forwardOut("127.0.0.1", LOCAL_PORT, DB_HOST, DB_PORT, (err, stream) => {
    if (err) { sock.destroy(); return; }
    sock.pipe(stream).pipe(sock);
  });
});

await new Promise((resolve, reject) => {
  sshClient.on("ready", () => {
    tunnelServer.listen(LOCAL_PORT, "127.0.0.1", () => {
      console.log(`SSH tunnel ready on port ${LOCAL_PORT}`);
      resolve();
    });
  });
  sshClient.on("error", reject);
  sshClient.connect({ host: SSH_HOST, port: SSH_PORT, username: SSH_USER, password: SSH_PASS });
});

const conn = await mysql.createConnection({
  host: "127.0.0.1",
  port: LOCAL_PORT,
  user: DB_USER,
  password: DB_PASS,
  database: DB_NAME,
});

// 1. Verificar duplicatas em module_configs
const [dupsConfigs] = await conn.query(`
  SELECT unitId, module, COUNT(*) as cnt
  FROM module_configs
  GROUP BY unitId, module
  HAVING cnt > 1
`);
console.log("Duplicatas em module_configs:", dupsConfigs.length);

// 2. Para cada duplicata, manter apenas o mais recente (maior id)
if (dupsConfigs.length > 0) {
  console.log("Removendo duplicatas antigas em module_configs...");
  await conn.query(`
    DELETE mc1 FROM module_configs mc1
    INNER JOIN module_configs mc2
      ON mc1.unitId = mc2.unitId AND mc1.module = mc2.module AND mc1.id < mc2.id
  `);
  const [[{ cnt }]] = await conn.query(`SELECT COUNT(*) as cnt FROM module_configs`);
  console.log(`Duplicatas removidas. Total restante: ${cnt}`);
}

// 3. Verificar duplicatas em module_access
const [dupsAccess] = await conn.query(`
  SELECT unitId, module, COUNT(*) as cnt
  FROM module_access
  GROUP BY unitId, module
  HAVING cnt > 1
`);
console.log("Duplicatas em module_access:", dupsAccess.length);

if (dupsAccess.length > 0) {
  console.log("Removendo duplicatas antigas em module_access...");
  await conn.query(`
    DELETE ma1 FROM module_access ma1
    INNER JOIN module_access ma2
      ON ma1.unitId = ma2.unitId AND ma1.module = ma2.module AND ma1.id < ma2.id
  `);
  console.log("Duplicatas module_access removidas.");
}

// 4. Adicionar UNIQUE constraint em module_configs
try {
  await conn.query(`ALTER TABLE module_configs DROP INDEX idx_module_configs_unit_module`);
  console.log("Index antigo removido de module_configs.");
} catch (e) { console.log("Drop index module_configs:", e.message); }
try {
  await conn.query(`ALTER TABLE module_configs ADD UNIQUE KEY uq_unit_module (unitId, module)`);
  console.log("UNIQUE constraint adicionada em module_configs.");
} catch (e) { console.log("module_configs unique:", e.message); }

// 5. Adicionar UNIQUE constraint em module_access
try {
  await conn.query(`ALTER TABLE module_access ADD UNIQUE KEY uq_unit_module (unitId, module)`);
  console.log("UNIQUE constraint adicionada em module_access.");
} catch (e) { console.log("module_access unique:", e.message); }

// 6. Verificar resultado final
const [configs] = await conn.query(`SELECT unitId, module, updatedAt FROM module_configs ORDER BY unitId, module`);
console.log("\nConfigs finais:");
for (const c of configs) {
  console.log(`  unitId=${c.unitId} module=${c.module} updatedAt=${c.updatedAt}`);
}

await conn.end();
tunnelServer.close();
sshClient.destroy();
console.log("\nDone!");
