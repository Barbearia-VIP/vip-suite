// Validação: Cadência Individual excluindo one-shots (visitas_hist = 1)
// Universo: Base P 24m com >=2 visitas históricas
// Cadência habitual: calculada com TODOS os intervalos históricos

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

// Teste 1: >=2 visitas históricas, limiares originais
const sql1 = `
  SELECT
    COUNT(DISTINCT CASE WHEN ci.ratio IS NOT NULL AND ci.ratio <= 0.8 THEN ci.cliente END) as assiduo,
    COUNT(DISTINCT CASE WHEN ci.ratio IS NOT NULL AND ci.ratio > 0.8 AND ci.ratio <= 1.2 THEN ci.cliente END) as regular,
    COUNT(DISTINCT CASE WHEN ci.ratio IS NOT NULL AND ci.ratio > 1.2 AND ci.ratio <= 1.8 THEN ci.cliente END) as espacando,
    COUNT(DISTINCT CASE WHEN ci.ratio IS NOT NULL AND ci.ratio > 1.8 AND ci.ratio <= 2.5 THEN ci.cliente END) as em_risco,
    COUNT(DISTINCT CASE WHEN ci.ratio IS NOT NULL AND ci.ratio > 2.5 THEN ci.cliente END) as perdido,
    COUNT(DISTINCT ci.cliente) as total,
    AVG(ci.cadencia_habitual) as avg_cadencia,
    AVG(ci.dias_sem_vir) as avg_dias
  FROM (
    SELECT
      bs.cliente,
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
    JOIN (
      SELECT v.cliente, COUNT(*) as total_visitas
      FROM vendas v
      JOIN usuarios uu ON v.usuario = uu.id
      WHERE ${unitCondV}
        AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
        AND v.cliente IS NOT NULL AND v.cliente != 2
      GROUP BY v.cliente
      HAVING COUNT(*) >= 2
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

const [rows1] = await conn.execute(sql1);
const r1 = rows1[0];

console.log('\n=== Teste 1: >=2 visitas hist, limiares originais (0.8/1.2/1.8/2.5) ===');
console.log(`Total universo: ${r1.total}`);
console.log(`Avg cadencia: ${parseFloat(r1.avg_cadencia||0).toFixed(1)}d, Avg dias sem vir: ${parseFloat(r1.avg_dias||0).toFixed(1)}d`);
console.log(`Assiduo (<=0.8):   ${r1.assiduo}  (${Math.round(r1.assiduo/r1.total*100)}%)`);
console.log(`Regular (0.8-1.2): ${r1.regular}  (${Math.round(r1.regular/r1.total*100)}%)`);
console.log(`Espacando (1.2-1.8): ${r1.espacando}  (${Math.round(r1.espacando/r1.total*100)}%)`);
console.log(`Em Risco (1.8-2.5): ${r1.em_risco}  (${Math.round(r1.em_risco/r1.total*100)}%)`);
console.log(`Perdido (>2.5):    ${r1.perdido}  (${Math.round(r1.perdido/r1.total*100)}%)`);

// Teste 2: >=3 visitas históricas
const sql2 = sql1.replace('HAVING COUNT(*) >= 2', 'HAVING COUNT(*) >= 3');
const [rows2] = await conn.execute(sql2);
const r2 = rows2[0];

console.log('\n=== Teste 2: >=3 visitas hist, limiares originais ===');
console.log(`Total universo: ${r2.total}`);
console.log(`Assiduo (<=0.8):   ${r2.assiduo}  (${Math.round(r2.assiduo/r2.total*100)}%)`);
console.log(`Regular (0.8-1.2): ${r2.regular}  (${Math.round(r2.regular/r2.total*100)}%)`);
console.log(`Espacando (1.2-1.8): ${r2.espacando}  (${Math.round(r2.espacando/r2.total*100)}%)`);
console.log(`Em Risco (1.8-2.5): ${r2.em_risco}  (${Math.round(r2.em_risco/r2.total*100)}%)`);
console.log(`Perdido (>2.5):    ${r2.perdido}  (${Math.round(r2.perdido/r2.total*100)}%)`);

console.log('\n=== Referencia (prints) ===');
console.log('Total universo: 2.576 (com 1a vez=43, sem oneshots seria ~2.533)');
console.log('Assiduo:   179  (7%)');
console.log('Regular:   256  (10%)');
console.log('Espacando: 304  (12%)');
console.log('1a Vez:    43   (2%)');
console.log('Em Risco:  240  (9%)');
console.log('Perdido:   1.554 (60%)');

await conn.end();
