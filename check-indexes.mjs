import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

// Lê as variáveis de ambiente do SSH tunnel (mesmo que o servidor usa)
const SSH_HOST = process.env.SSH_TUNNEL_HOST;
const SSH_USER = process.env.SSH_TUNNEL_USER;
const SSH_PASS = process.env.SSH_TUNNEL_PASS;
const SSH_PORT = parseInt(process.env.SSH_TUNNEL_PORT || "22");

if (!SSH_HOST) {
  console.error("SSH_TUNNEL_HOST não configurado");
  process.exit(1);
}

// Usa o túnel SSH já aberto pelo servidor (porta 13307)
// O servidor já mantém o túnel ativo, então conectamos direto
const conn = await mysql.createConnection({
  host: "127.0.0.1",
  port: 13307,
  user: process.env.DB_EXT_USER || "root",
  password: process.env.DB_EXT_PASS || "",
  database: process.env.DB_EXT_NAME || "",
  connectTimeout: 15000,
});

const tables = [
  "vendas",
  "vendas_produtos",
  "vendas_pagamentos",
  "usuarios",
  "clientes",
  "produtos",
  "formas_pagamentos",
  "dashboard_faturamento",
  "unidades",
];

for (const table of tables) {
  try {
    const [rows] = await conn.execute(`SHOW INDEX FROM \`${table}\``);
    console.log(`\n=== ${table} ===`);
    if (rows.length === 0) {
      console.log("  (sem índices)");
    } else {
      const grouped = {};
      for (const r of rows) {
        const key = r.Key_name;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push({ col: r.Column_name, seq: r.Seq_in_index, unique: r.Non_unique === 0 });
      }
      for (const [name, cols] of Object.entries(grouped)) {
        const sorted = cols.sort((a, b) => a.seq - b.seq);
        const colList = sorted.map(c => c.col).join(", ");
        const type = name === "PRIMARY" ? "PRIMARY KEY" : (cols[0].unique ? "UNIQUE" : "INDEX");
        console.log(`  ${type.padEnd(12)} ${name.padEnd(35)} (${colList})`);
      }
    }
  } catch (e) {
    console.log(`\n=== ${table} === ERRO: ${e.message}`);
  }
}

await conn.end();
