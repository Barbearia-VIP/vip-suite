/**
 * Executa a migration do enum tipoColaborador no banco externo de produção
 * via SSH tunnel (porta 13307 já aberta pelo servidor)
 */
import mysql from "mysql2/promise";

const DB_EXT_HOST = process.env.DB_EXT_HOST;
const DB_EXT_PORT = parseInt(process.env.DB_EXT_PORT ?? "3307");
const DB_EXT_USER = process.env.DB_EXT_USER;
const DB_EXT_PASS = process.env.DB_EXT_PASS;
const DB_EXT_NAME = process.env.DB_EXT_NAME;

// O servidor já abre o túnel SSH na porta 13307 (localhost)
// Conectar diretamente via túnel local
const conn = await mysql.createConnection({
  host: "127.0.0.1",
  port: 13307,
  user: DB_EXT_USER,
  password: DB_EXT_PASS,
  database: DB_EXT_NAME,
  ssl: { rejectUnauthorized: false },
});

console.log(`✅ Conectado ao banco externo: ${DB_EXT_NAME}`);

// Verificar estrutura atual
const [rows] = await conn.execute("DESCRIBE dimensao_colaboradores");
const tipoField = rows.find(r => r.Field === "tipoColaborador");
console.log("Campo tipoColaborador atual:", tipoField?.Type);

if (tipoField?.Type?.includes("estetica")) {
  console.log("✅ 'estetica' já está no enum do banco de produção");
} else {
  console.log("⚠️ Aplicando migration...");
  await conn.execute(`
    ALTER TABLE dimensao_colaboradores 
    MODIFY COLUMN tipoColaborador ENUM('barbeiro','recepcao','estetica','nenhum') NOT NULL DEFAULT 'nenhum'
  `);
  const [rows2] = await conn.execute("DESCRIBE dimensao_colaboradores");
  const tipoField2 = rows2.find(r => r.Field === "tipoColaborador");
  console.log("✅ Migration aplicada! Novo tipo:", tipoField2?.Type);
}

await conn.end();
