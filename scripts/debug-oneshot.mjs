// Script de diagnóstico — encontrar unidade Joinville e testar query oneShot
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const DB_USER = process.env.DB_EXT_USER ?? "";
const DB_PASS = process.env.DB_EXT_PASS ?? "";
const DB_NAME = process.env.DB_EXT_NAME ?? "";

async function main() {
  const conn = await mysql.createConnection({
    host: "127.0.0.1", port: 13307,
    user: DB_USER, password: DB_PASS, database: DB_NAME,
    ssl: { rejectUnauthorized: false }, connectTimeout: 30000,
  });
  console.log("Conectado!\n");

  // 1. Listar tabela unidades
  const [cols] = await conn.execute(`DESCRIBE unidades`);
  console.log("=== COLUNAS DA TABELA unidades ===");
  cols.forEach(r => console.log(`  ${r.Field} (${r.Type})`));

  const [unidades] = await conn.execute(`SELECT * FROM unidades ORDER BY id LIMIT 50`);
  console.log("\n=== UNIDADES ===");
  unidades.forEach(r => console.log(`  ID=${r.id} | ${JSON.stringify(r)}`));

  await conn.end();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
