// Validação: Cadência Individual com base P 24m (todos que visitaram nos últimos 24m)
// Cadência habitual: calculada com TODOS os intervalos históricos do cliente

import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: '127.0.0.1',
  port: 13307,
  user: process.env.DB_EXT_USER,
  password: process.env.DB_EXT_PASS,
  database: process.env.DB_EXT_NAME,
  connectTimeout: 10000,
});

const unitId = 29;
const dataFim = '2026-04-30';
const dataInicio24m = '2024-04-30';
const unitCondV = `uu.unidade = ${unitId}`;

const sql = `
  SELECT
    COUNT(DISTINCT CASE WHEN ci.total_visitas_hist >= 3 AND ci.ratio IS NOT NULL AND ci.ratio <= 0.8 THEN ci.cliente END) as assiduo,
    COUNT(DISTINCT CASE WHEN ci.total_visitas_hist >= 3 AND ci.ratio IS NOT NULL AND ci.ratio > 0.8 AND ci.ratio <= 1.2 THEN ci.cliente END) as regular,
    COUNT(DISTINCT CASE WHEN ci.total_visitas_hist >= 3 AND ci.ratio IS NOT NULL AND ci.ratio > 1.2 AND ci.ratio <= 1.8 THEN ci.cliente END) as espacando,
    COUNT(DISTINCT CASE WHEN ci.total_visitas_hist = 1 THEN ci.cliente END) as primeira_vez,
    COUNT(DISTINCT CASE WHEN ci.total_visitas_hist >= 3 AND ci.ratio IS NOT NULL AND ci.ratio > 1.8 AND ci.ratio <= 2.5 THEN ci.cliente END) as em_risco,
    COUNT(DISTINCT CASE WHEN ci.total_visitas_hist >= 3 AND ci.ratio IS NOT NULL AND ci.ratio > 2.5 THEN ci.cliente END) as perdido,
    COUNT(DISTINCT ci.cliente) as total
  FROM (
    SELECT
      bs.cliente,
      COALESCE(vh_hist.total_visitas, 0) as total_visitas_hist,
      uvc.ultima_venda,
      DATEDIFF('${dataFim}', uvc.ultima_venda) as dias_sem_vir,
      iv.cadencia_habitual,
      CASE
        WHEN iv.cadencia_habitual IS NOT NULL AND iv.cadencia_habitual > 0
        THEN DATEDIFF('${dataFim}', uvc.ultima_venda) / iv.cadencia_habitual
        ELSE NULL
      END as ratio
    FROM (
      SELECT DISTINCT v.cliente
      FROM vendas v
      JOIN usuarios uu ON v.usuario = uu.id
      WHERE ${unitCondV}
        AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
        AND v.cliente IS NOT NULL AND v.cliente != 2
        AND DATE(v.data_criacao) >= '${dataInicio24m}' AND DATE(v.data_criacao) <= '${dataFim}'
    ) bs
    JOIN clientes c ON c.id = bs.cliente
    LEFT JOIN (
      SELECT v.cliente, COUNT(*) as total_visitas
      FROM vendas v
      JOIN usuarios uu ON v.usuario = uu.id
      WHERE ${unitCondV}
        AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
        AND v.cliente IS NOT NULL AND v.cliente != 2
      GROUP BY v.cliente
    ) vh_hist ON vh_hist.cliente = bs.cliente
    LEFT JOIN (
      SELECT sub.cliente, AVG(sub.diff) as cadencia_habitual
      FROM (
        SELECT
          v.cliente,
          DATEDIFF(DATE(v.data_criacao), LAG(DATE(v.data_criacao)) OVER (PARTITION BY v.cliente ORDER BY v.data_criacao)) as diff
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitCondV}
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
          AND v.cliente IS NOT NULL AND v.cliente != 2
      ) sub
      WHERE sub.diff IS NOT NULL AND sub.diff > 0
      GROUP BY sub.cliente
    ) iv ON iv.cliente = bs.cliente
    LEFT JOIN (
      SELECT v.cliente, MAX(DATE(v.data_criacao)) as ultima_venda
      FROM vendas v
      JOIN usuarios uu ON v.usuario = uu.id
      WHERE ${unitCondV}
        AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
        AND v.cliente IS NOT NULL AND v.cliente != 2
      GROUP BY v.cliente
    ) uvc ON uvc.cliente = bs.cliente
    WHERE c.status = 1
  ) ci
`;

const [rows] = await conn.execute(sql);
const r = rows[0];

console.log('\n=== Cadencia Individual (Ratio, base 24m) — Joinville, 24m ate 30/04/2026 ===');
console.log(`Total universo: ${r.total}`);
console.log(`Assiduo (ratio <=0.8):      ${r.assiduo}  (${Math.round(r.assiduo/r.total*100)}%)`);
console.log(`Regular (0.8-1.2):          ${r.regular}  (${Math.round(r.regular/r.total*100)}%)`);
console.log(`Espacando (1.2-1.8):        ${r.espacando}  (${Math.round(r.espacando/r.total*100)}%)`);
console.log(`1a Vez (1 visita hist):     ${r.primeira_vez}  (${Math.round(r.primeira_vez/r.total*100)}%)`);
console.log(`Em Risco (1.8-2.5):         ${r.em_risco}  (${Math.round(r.em_risco/r.total*100)}%)`);
console.log(`Perdido (>2.5):             ${r.perdido}  (${Math.round(r.perdido/r.total*100)}%)`);

console.log('\n=== Referencia (prints) ===');
console.log('Total universo: 2.576');
console.log('Assiduo:   179  (7%)');
console.log('Regular:   256  (10%)');
console.log('Espacando: 304  (12%)');
console.log('1a Vez:    43   (2%)');
console.log('Em Risco:  240  (9%)');
console.log('Perdido:   1.554 (60%)');

await conn.end();
