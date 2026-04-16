/**
 * Valida o faturamento diário corrigido vs fonte de verdade (sync_vendas)
 * para a unidade 1 (Santa Monica) em março/2026
 */
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

const unidadeId = 1;
const dataInicio = "2026-03-01";
const dataFim = "2026-04-01"; // exclusivo

// Fonte de verdade: SUM(v.valor_total) por dia sem JOIN com produtos
const [real] = await pool.query(`
  SELECT
    DATE_FORMAT(v.data_criacao, '%Y-%m-%d') as dia,
    COALESCE(SUM(v.valor_total), 0) as fat_real,
    COUNT(DISTINCT v.id) as atend
  FROM sync_vendas v
  WHERE v.unidade_id = ?
    AND v.data_criacao >= ? AND v.data_criacao < ?
    AND v.comanda_temp = 0 AND v.status = 1
  GROUP BY dia ORDER BY dia
`, [unidadeId, dataInicio, dataFim]);

// Método corrigido: SUM(vp.valor_total) com JOIN em produtos
const [corrigido] = await pool.query(`
  SELECT
    DATE_FORMAT(v.data_criacao, '%Y-%m-%d') as dia,
    COALESCE(SUM(vp.valor_total), 0) as fat_corrigido
  FROM sync_vendas_produtos vp
  JOIN sync_vendas v ON v.id = vp.venda
  WHERE vp.unidade_id = ?
    AND v.data_criacao >= ? AND v.data_criacao < ?
    AND v.comanda_temp = 0 AND v.status = 1
  GROUP BY dia ORDER BY dia
`, [unidadeId, dataInicio, dataFim]);

// Método antigo (bugado): SUM(DISTINCT v.valor_total) com JOIN
const [bugado] = await pool.query(`
  SELECT
    DATE_FORMAT(v.data_criacao, '%Y-%m-%d') as dia,
    COALESCE(SUM(DISTINCT v.valor_total), 0) as fat_bugado
  FROM sync_vendas_produtos vp
  JOIN sync_vendas v ON v.id = vp.venda
  WHERE vp.unidade_id = ?
    AND v.data_criacao >= ? AND v.data_criacao < ?
    AND v.comanda_temp = 0 AND v.status = 1
  GROUP BY dia ORDER BY dia
`, [unidadeId, dataInicio, dataFim]);

// Mapear por dia
const corrigidoMap = Object.fromEntries(corrigido.map(r => [r.dia, Number(r.fat_corrigido)]));
const bugadoMap = Object.fromEntries(bugado.map(r => [r.dia, Number(r.fat_bugado)]));

console.log(`\n=== VALIDAÇÃO EVOLUÇÃO DIÁRIA — Unidade ${unidadeId} — Março/2026 ===\n`);
console.log(`${"Dia".padEnd(12)} ${"Real (v)".padEnd(14)} ${"Corrigido (vp)".padEnd(16)} ${"Bugado (DIST)".padEnd(16)} ${"Diff Real-Corr".padEnd(16)} Status`);
console.log("-".repeat(90));

let totalReal = 0, totalCorr = 0, totalBug = 0;
let diasOk = 0, diasFail = 0;

for (const r of real) {
  const fatReal = Number(r.fat_real);
  const fatCorr = corrigidoMap[r.dia] ?? 0;
  const fatBug = bugadoMap[r.dia] ?? 0;
  const diff = Math.abs(fatReal - fatCorr);
  const pct = fatReal > 0 ? (diff / fatReal) * 100 : 0;
  const ok = pct < 2;
  if (ok) diasOk++; else diasFail++;
  totalReal += fatReal;
  totalCorr += fatCorr;
  totalBug += fatBug;
  const status = ok ? "✅" : "❌";
  console.log(
    `${status} ${r.dia.padEnd(10)} R$${fatReal.toFixed(2).padStart(11)} R$${fatCorr.toFixed(2).padStart(13)} R$${fatBug.toFixed(2).padStart(13)} ${diff > 0 ? "-R$" + diff.toFixed(2) : "=".padStart(8)} (${pct.toFixed(1)}%)`
  );
}

console.log("-".repeat(90));
console.log(`${"TOTAL".padEnd(12)} R$${totalReal.toFixed(2).padStart(11)} R$${totalCorr.toFixed(2).padStart(13)} R$${totalBug.toFixed(2).padStart(13)}`);
console.log(`\n✅ ${diasOk} dias OK | ❌ ${diasFail} dias com divergência > 2%`);
console.log(`\nRedução de erro: R$${(totalBug - totalReal).toFixed(2)} (bugado inflava ${((totalBug/totalReal - 1)*100).toFixed(1)}%)`);
console.log(`Precisão corrigida: ${((1 - Math.abs(totalReal - totalCorr)/totalReal)*100).toFixed(2)}%`);

await pool.end();
