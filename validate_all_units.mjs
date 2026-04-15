/**
 * validate_all_units.mjs
 * Auditoria completa: todas as unidades × 12 meses.
 * Verifica que SUM(vp.valor_total) bate com SUM(v.valor_total) (fonte de verdade).
 * Tolerância: 2% de divergência (itens sem cadastro em sync_produtos).
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

const pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 5, timezone: "Z" });
const q = async (sql, params = []) => { const [r] = await pool.query(sql, params); return r; };
const fmt = v => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

// Últimos 12 meses
const meses = [];
const hoje = new Date();
for (let i = 11; i >= 0; i--) {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
  const ano = d.getFullYear();
  const mes = d.getMonth() + 1;
  const inicio = `${ano}-${String(mes).padStart(2,"0")}-01`;
  const proxMes = mes === 12 ? 1 : mes + 1;
  const proxAno = mes === 12 ? ano + 1 : ano;
  const fim = `${proxAno}-${String(proxMes).padStart(2,"0")}-01`;
  meses.push({ label: `${ano}-${String(mes).padStart(2,"0")}`, inicio, fim });
}

// Buscar todas as unidades ativas
const unidades = await q(`
  SELECT DISTINCT unidade_id
  FROM sync_vendas
  WHERE data_criacao >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
    AND comanda_temp = 0 AND status = 1
  ORDER BY unidade_id
`);

console.log(`\n=== AUDITORIA COMPLETA — ${unidades.length} UNIDADES × 12 MESES ===\n`);
console.log(`Tolerância de divergência: 2% (itens sem cadastro em sync_produtos)\n`);

// Executar auditoria em lote — uma query por mês para todas as unidades
const resultados = {}; // { unidade_id: { mes: { real, corr, ok } } }
const erros = [];

for (const { label, inicio, fim } of meses) {
  // Fonte de verdade: SUM(v.valor_total) sem JOIN em produtos
  const realRows = await q(`
    SELECT unidade_id, COALESCE(SUM(valor_total), 0) as fat_real, COUNT(DISTINCT id) as atend
    FROM sync_vendas
    WHERE data_criacao >= ? AND data_criacao < ?
      AND comanda_temp = 0 AND status = 1
    GROUP BY unidade_id
  `, [inicio, fim]);

  // Método corrigido: SUM(vp.valor_total)
  const corrRows = await q(`
    SELECT vp.unidade_id, COALESCE(SUM(vp.valor_total), 0) as fat_corr
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON v.id = vp.venda
    JOIN sync_produtos p ON p.id = vp.produto
    WHERE v.data_criacao >= ? AND v.data_criacao < ?
      AND v.comanda_temp = 0 AND v.status = 1
    GROUP BY vp.unidade_id
  `, [inicio, fim]);

  const mapReal = Object.fromEntries(realRows.map(r => [r.unidade_id, { fat: Number(r.fat_real), atend: Number(r.atend) }]));
  const mapCorr = Object.fromEntries(corrRows.map(r => [r.unidade_id, Number(r.fat_corr)]));

  for (const { unidade_id } of unidades) {
    const uid = unidade_id;
    const fatReal = mapReal[uid]?.fat ?? 0;
    const fatCorr = mapCorr[uid] ?? 0;
    const diff = Math.abs(fatCorr - fatReal);
    const pctDiff = fatReal > 0 ? diff / fatReal : 0;
    const ok = pctDiff < 0.02;

    if (!resultados[uid]) resultados[uid] = { totalReal: 0, totalCorr: 0, mesesOk: 0, mesesFail: 0 };
    resultados[uid].totalReal += fatReal;
    resultados[uid].totalCorr += fatCorr;
    if (ok) resultados[uid].mesesOk++;
    else {
      resultados[uid].mesesFail++;
      erros.push({ uid, mes: label, fatReal, fatCorr, diff, pctDiff: (pctDiff * 100).toFixed(1) });
    }
  }
}

// Relatório consolidado por unidade
console.log(`${"Unid.".padEnd(8)} ${"Fat. Real 12m".padEnd(24)} ${"Fat. Corrigido 12m".padEnd(24)} ${"Diff".padEnd(16)} ${"Meses OK".padEnd(12)} Status`);
console.log("-".repeat(100));

let totalUnidOk = 0;
let totalUnidFail = 0;
let grandTotalReal = 0;
let grandTotalCorr = 0;

for (const { unidade_id } of unidades) {
  const uid = unidade_id;
  const r = resultados[uid];
  const diff = r.totalCorr - r.totalReal;
  const pctDiff = r.totalReal > 0 ? ((diff / r.totalReal) * 100).toFixed(2) + "%" : "N/A";
  const allOk = r.mesesFail === 0;
  const status = allOk ? "✅" : `❌ (${r.mesesFail} mês(es) com divergência)`;
  if (allOk) totalUnidOk++; else totalUnidFail++;
  grandTotalReal += r.totalReal;
  grandTotalCorr += r.totalCorr;

  console.log(
    `${String(uid).padEnd(8)} ${fmt(r.totalReal).padEnd(24)} ${fmt(r.totalCorr).padEnd(24)} ${(fmt(diff) + " (" + pctDiff + ")").padEnd(16)} ${(r.mesesOk + "/12").padEnd(12)} ${status}`
  );
}

console.log("-".repeat(100));
const grandDiff = grandTotalCorr - grandTotalReal;
const grandPct = grandTotalReal > 0 ? ((grandDiff / grandTotalReal) * 100).toFixed(3) + "%" : "N/A";
console.log(`${"TOTAL".padEnd(8)} ${fmt(grandTotalReal).padEnd(24)} ${fmt(grandTotalCorr).padEnd(24)} ${(fmt(grandDiff) + " (" + grandPct + ")").padEnd(16)}`);

console.log(`\n📊 Resultado: ${totalUnidOk}/${unidades.length} unidades com 100% de meses aprovados`);

if (erros.length > 0) {
  console.log(`\n⚠️  Divergências encontradas (acima de 2%):`);
  console.log(`${"Unid.".padEnd(8)} ${"Mês".padEnd(10)} ${"Fat. Real".padEnd(22)} ${"Fat. Corrigido".padEnd(22)} ${"Diff".padEnd(16)} Pct`);
  console.log("-".repeat(85));
  for (const e of erros) {
    console.log(`${String(e.uid).padEnd(8)} ${e.mes.padEnd(10)} ${fmt(e.fatReal).padEnd(22)} ${fmt(e.fatCorr).padEnd(22)} ${fmt(e.diff).padEnd(16)} ${e.pctDiff}%`);
  }
} else {
  console.log(`\n✅ Nenhuma divergência acima de 2% encontrada em nenhuma unidade/mês.`);
}

console.log(`\n=== Auditoria concluída ===\n`);
await pool.end();
