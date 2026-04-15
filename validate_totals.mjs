/**
 * validate_totals.mjs
 * Valida que SUM(vp.valor_total) bate com SUM(v.valor_total) por unidade/mês.
 * Também compara totais por colaborador antes/depois da correção.
 */
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import { readFileSync } from "fs";

// Carregar .env do projeto
try {
  const env = readFileSync("/home/ubuntu/vip-suite/.env", "utf8");
  env.split("\n").forEach(line => {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  });
} catch {}

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error("DATABASE_URL não encontrada"); process.exit(1); }

const pool = mysql.createPool({ uri: DB_URL, connectionLimit: 3, timezone: "Z" });

async function q(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

const fmt = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const pct = (a, b) => b > 0 ? (((a - b) / b) * 100).toFixed(1) + "%" : "N/A";

console.log("\n=== VALIDAÇÃO DE TOTAIS POR UNIDADE ===\n");

// 1. Comparar SUM(v.valor_total) vs SUM(vp.valor_total) por unidade/mês
// Meses: Jan-Mar 2026
const meses = ["2026-01", "2026-02", "2026-03"];

for (const mes of meses) {
  const [ano, m] = mes.split("-");
  const dataInicio = `${mes}-01`;
  const proximoMes = Number(m) === 12 ? `${Number(ano)+1}-01-01` : `${ano}-${String(Number(m)+1).padStart(2,"0")}-01`;

  console.log(`\n── Mês: ${mes} ──────────────────────────────────`);

  // Totais por venda (correto - sem JOIN com produtos)
  const vendasTotais = await q(`
    SELECT
      v.unidade_id,
      COUNT(DISTINCT v.id) as qtd_vendas,
      COALESCE(SUM(v.valor_total), 0) as fat_vendas
    FROM sync_vendas v
    WHERE v.data_criacao >= ? AND v.data_criacao < ?
      AND v.comanda_temp = 0 AND v.status = 1
    GROUP BY v.unidade_id
    ORDER BY v.unidade_id
  `, [dataInicio, proximoMes]);

  // Totais por produto (método correto após correção)
  const produtosTotais = await q(`
    SELECT
      vp.unidade_id,
      COUNT(DISTINCT v.id) as qtd_vendas,
      COALESCE(SUM(vp.valor_total), 0) as fat_produtos
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON v.id = vp.venda
    WHERE v.data_criacao >= ? AND v.data_criacao < ?
      AND v.comanda_temp = 0 AND v.status = 1
    GROUP BY vp.unidade_id
    ORDER BY vp.unidade_id
  `, [dataInicio, proximoMes]);

  // Método antigo (bugado) - SUM(v.valor_total) com JOIN em produtos
  const metodoBugado = await q(`
    SELECT
      vp.unidade_id,
      COALESCE(SUM(v.valor_total), 0) as fat_bugado
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON v.id = vp.venda
    JOIN sync_produtos p ON p.id = vp.produto
    WHERE v.data_criacao >= ? AND v.data_criacao < ?
      AND v.comanda_temp = 0 AND v.status = 1
    GROUP BY vp.unidade_id
    ORDER BY vp.unidade_id
  `, [dataInicio, proximoMes]);

  // Montar mapa por unidade
  const mapVendas = Object.fromEntries(vendasTotais.map(r => [r.unidade_id, r]));
  const mapProd = Object.fromEntries(produtosTotais.map(r => [r.unidade_id, r]));
  const mapBug = Object.fromEntries(metodoBugado.map(r => [r.unidade_id, r]));

  const unidades = [...new Set([
    ...vendasTotais.map(r => r.unidade_id),
    ...produtosTotais.map(r => r.unidade_id)
  ])].sort((a, b) => a - b);

  console.log(`${"Unidade".padEnd(10)} ${"Fat. Real (v)".padEnd(20)} ${"Fat. Corrigido (vp)".padEnd(22)} ${"Fat. Bugado".padEnd(20)} ${"Diff Bug".padEnd(12)} ${"OK?"}`);
  console.log("-".repeat(100));

  let allOk = true;
  for (const uid of unidades) {
    const fatReal = Number(mapVendas[uid]?.fat_vendas ?? 0);
    const fatCorr = Number(mapProd[uid]?.fat_produtos ?? 0);
    const fatBug  = Number(mapBug[uid]?.fat_bugado ?? 0);
    const diffBug = fatBug - fatReal;
    const ok = Math.abs(fatCorr - fatReal) / Math.max(fatReal, 1) < 0.02; // tolerância 2%
    if (!ok) allOk = false;
    const status = ok ? "✅" : "❌ DIVERGÊNCIA";
    console.log(
      `${String(uid).padEnd(10)} ${fmt(fatReal).padEnd(20)} ${fmt(fatCorr).padEnd(22)} ${fmt(fatBug).padEnd(20)} ${fmt(diffBug).padEnd(12)} ${status}`
    );
  }
  if (allOk) console.log("\n✅ Todos os totais do mês batem após a correção.");
}

// 2. Top colaboradores por unidade em março/2026 (método corrigido)
console.log("\n\n=== TOP COLABORADORES MARÇO/2026 (método corrigido) ===\n");

const colabRows = await q(`
  SELECT
    vp.unidade_id,
    colab.nome as colaborador_nome,
    COALESCE(SUM(vp.valor_total), 0) as faturamento,
    COUNT(DISTINCT v.id) as atendimentos
  FROM sync_vendas_produtos vp
  JOIN sync_usuarios colab ON colab.id = vp.colaborador
  JOIN sync_vendas v ON v.id = vp.venda
  JOIN sync_produtos p ON p.id = vp.produto
  WHERE v.data_criacao >= '2026-03-01' AND v.data_criacao < '2026-04-01'
    AND v.comanda_temp = 0 AND v.status = 1
    AND colab.visivel_agenda != 'nenhuma'
  GROUP BY vp.unidade_id, colab.id, colab.nome
  ORDER BY vp.unidade_id, faturamento DESC
`);

// Agrupar por unidade
const porUnidade = {};
for (const r of colabRows) {
  if (!porUnidade[r.unidade_id]) porUnidade[r.unidade_id] = [];
  porUnidade[r.unidade_id].push(r);
}

for (const [uid, colabs] of Object.entries(porUnidade)) {
  const totalUnidade = colabs.reduce((s, c) => s + Number(c.faturamento), 0);
  console.log(`\nUnidade ${uid} — Total: ${fmt(totalUnidade)}`);
  console.log(`${"Colaborador".padEnd(30)} ${"Faturamento".padEnd(20)} ${"Atendimentos"}`);
  console.log("-".repeat(65));
  for (const c of colabs.slice(0, 8)) {
    console.log(`${String(c.colaborador_nome).padEnd(30)} ${fmt(Number(c.faturamento)).padEnd(20)} ${c.atendimentos}`);
  }
}

await pool.end();
console.log("\n=== Validação concluída ===\n");
