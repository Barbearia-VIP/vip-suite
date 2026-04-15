/**
 * validate_mensal.mjs
 * Verifica os dados da aba Mensal do Data VIP para as unidades com maior inflação.
 * Compara método corrigido (SUM vp.valor_total) vs método bugado (SUM v.valor_total com JOIN)
 * para as unidades 1, 20, 39 e 48 nos últimos 12 meses.
 */
import mysql from "mysql2/promise";
import { readFileSync } from "fs";

// Carregar .env
try {
  const env = readFileSync("/home/ubuntu/vip-suite/.env", "utf8");
  env.split("\n").forEach(line => {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  });
} catch {}

const pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 3, timezone: "Z" });
const q = async (sql, params = []) => { const [r] = await pool.query(sql, params); return r; };
const fmt = v => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const pct = (a, b) => b > 0 ? ((a / b - 1) * 100).toFixed(1) + "%" : "N/A";

// Unidades com maior inflação detectada
const UNIDADES = [
  { id: 1,  nome: "Santa Monica" },
  { id: 20, nome: "Unidade 20" },
  { id: 39, nome: "Unidade 39" },
  { id: 48, nome: "Unidade 48" },
];

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

console.log("\n=== VALIDAÇÃO ABA MENSAL — UNIDADES COM MAIOR INFLAÇÃO ===\n");
console.log("Método corrigido: SUM(vp.valor_total) — soma por item");
console.log("Método bugado:    SUM(v.valor_total) com JOIN em produtos — soma por cabeçalho × itens\n");

for (const unidade of UNIDADES) {
  console.log(`\n${"═".repeat(90)}`);
  console.log(`UNIDADE ${unidade.id} — ${unidade.nome}`);
  console.log(`${"═".repeat(90)}`);
  console.log(`${"Mês".padEnd(10)} ${"Fat. Real (v)".padEnd(22)} ${"Corrigido (vp)".padEnd(22)} ${"Bugado".padEnd(22)} ${"Inflação Bug".padEnd(14)} ${"Ticket Médio Corr."}`);
  console.log("-".repeat(100));

  let totalReal = 0, totalCorr = 0, totalBug = 0;

  for (const { label, inicio, fim } of meses) {
    // Método 1: fonte de verdade — SUM(v.valor_total) sem JOIN em produtos
    const [realRow] = await q(`
      SELECT
        COALESCE(SUM(v.valor_total), 0) as fat_real,
        COUNT(DISTINCT v.id) as atendimentos
      FROM sync_vendas v
      WHERE v.unidade_id = ?
        AND v.data_criacao >= ? AND v.data_criacao < ?
        AND v.comanda_temp = 0 AND v.status = 1
    `, [unidade.id, inicio, fim]);

    // Método 2: corrigido — SUM(vp.valor_total)
    const [corrRow] = await q(`
      SELECT
        COALESCE(SUM(vp.valor_total), 0) as fat_corr,
        COUNT(DISTINCT v.id) as atendimentos
      FROM sync_vendas_produtos vp
      JOIN sync_vendas v ON v.id = vp.venda
      JOIN sync_produtos p ON p.id = vp.produto
      WHERE vp.unidade_id = ?
        AND v.data_criacao >= ? AND v.data_criacao < ?
        AND v.comanda_temp = 0 AND v.status = 1
    `, [unidade.id, inicio, fim]);

    // Método 3: bugado — SUM(v.valor_total) com JOIN em produtos
    const [bugRow] = await q(`
      SELECT
        COALESCE(SUM(v.valor_total), 0) as fat_bug
      FROM sync_vendas_produtos vp
      JOIN sync_vendas v ON v.id = vp.venda
      JOIN sync_produtos p ON p.id = vp.produto
      WHERE vp.unidade_id = ?
        AND v.data_criacao >= ? AND v.data_criacao < ?
        AND v.comanda_temp = 0 AND v.status = 1
    `, [unidade.id, inicio, fim]);

    const fatReal = Number(realRow?.fat_real ?? 0);
    const fatCorr = Number(corrRow?.fat_corr ?? 0);
    const fatBug  = Number(bugRow?.fat_bug ?? 0);
    const atend   = Number(corrRow?.atendimentos ?? 0);
    const ticketMedio = atend > 0 ? fatCorr / atend : 0;
    const inflacao = pct(fatBug, fatReal);

    totalReal += fatReal;
    totalCorr += fatCorr;
    totalBug  += fatBug;

    const ok = Math.abs(fatCorr - fatReal) / Math.max(fatReal, 1) < 0.02 ? "✅" : "⚠️";
    console.log(
      `${label.padEnd(10)} ${(fmt(fatReal) + " " + ok).padEnd(22)} ${fmt(fatCorr).padEnd(22)} ${fmt(fatBug).padEnd(22)} ${inflacao.padEnd(14)} ${fmt(ticketMedio)}`
    );
  }

  console.log("-".repeat(100));
  console.log(
    `${"TOTAL".padEnd(10)} ${fmt(totalReal).padEnd(22)} ${fmt(totalCorr).padEnd(22)} ${fmt(totalBug).padEnd(22)} ${pct(totalBug, totalReal).padEnd(14)}`
  );

  // Resumo do impacto
  const economiaAnual = totalBug - totalReal;
  console.log(`\n  → Inflação total acumulada (12m): ${fmt(economiaAnual)} (${pct(totalBug, totalReal)} acima do real)`);
}

await pool.end();
console.log("\n\n=== Validação da aba Mensal concluída ===\n");
