import mysql from "mysql2/promise";
import { readFileSync } from "fs";

try {
  const env = readFileSync("/home/ubuntu/vip-suite/.env", "utf8");
  env.split("\n").forEach(line => {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  });
} catch {}

const pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 3, timezone: "Z" });

// Status de sync_controle
const [rows] = await pool.query(
  "SELECT unidade_id, ultima_sync, status, erro_msg, total_vendas, total_vp FROM sync_controle ORDER BY unidade_id"
);

const agora = new Date();
console.log(`\n=== STATUS DE SINCRONIZAÇÃO — ${agora.toLocaleString("pt-BR")} ===\n`);
console.log(`${"Unid".padEnd(6)} ${"Última Sync".padEnd(22)} ${"Há quanto tempo".padEnd(20)} ${"Status".padEnd(10)} ${"Vendas".padEnd(10)} Erro`);
console.log("-".repeat(100));

let semSync = 0;
let comErro = 0;
let atrasadas = 0;

for (const r of rows) {
  const ultima = r.ultima_sync ? new Date(r.ultima_sync) : null;
  let tempoStr = "NUNCA";
  let atrasado = false;
  if (ultima) {
    const diffMs = agora - ultima;
    const diffH = diffMs / (1000 * 60 * 60);
    const diffMin = diffMs / (1000 * 60);
    if (diffMin < 60) tempoStr = `${Math.round(diffMin)}min atrás`;
    else if (diffH < 24) tempoStr = `${diffH.toFixed(1)}h atrás`;
    else tempoStr = `${(diffH/24).toFixed(1)} dias atrás`;
    if (diffH > 5) atrasado = true; // mais de 5h sem sync
  } else {
    semSync++;
  }
  if (r.status === "error") comErro++;
  if (atrasado) atrasadas++;

  const flag = r.status === "error" ? "❌" : (atrasado ? "⚠️ " : "✅");
  console.log(
    `${flag} ${String(r.unidade_id).padEnd(4)} ${String(r.ultima_sync || "NUNCA").padEnd(22)} ${tempoStr.padEnd(20)} ${String(r.status).padEnd(10)} ${String(r.total_vendas || 0).padEnd(10)} ${r.erro_msg || "-"}`
  );
}

console.log(`\n📊 Resumo:`);
console.log(`   Total de unidades monitoradas: ${rows.length}`);
console.log(`   Sem sync registrada:           ${semSync}`);
console.log(`   Com erro:                      ${comErro}`);
console.log(`   Atrasadas (>5h):               ${atrasadas}`);

// Verificar scheduler info via banco
const [schedRows] = await pool.query(
  "SELECT * FROM sync_controle ORDER BY ultima_sync DESC LIMIT 1"
);
if (schedRows[0]?.ultima_sync) {
  const ultima = new Date(schedRows[0].ultima_sync);
  const diffH = (agora - ultima) / (1000 * 60 * 60);
  console.log(`\n🕐 Sync mais recente em qualquer unidade: ${ultima.toLocaleString("pt-BR")} (${diffH.toFixed(1)}h atrás)`);
}

await pool.end();
