import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection({
  host: '127.0.0.1', port: 13307,
  user: process.env.DB_EXT_USER, password: process.env.DB_EXT_PASS, database: process.env.DB_EXT_NAME,
  ssl: { rejectUnauthorized: false }, connectTimeout: 30000
});

const dataFim = '2026-03-31';
const dataInicio12m = '2025-03-31';
const U = 29; // unidade Joinville

// Grupos por ratio (cadência individual)
const sql1 = `
  SELECT
    SUM(CASE WHEN ratio <= 0.8 THEN 1 ELSE 0 END) as assiduo,
    SUM(CASE WHEN ratio > 0.8 AND ratio <= 1.2 THEN 1 ELSE 0 END) as regular,
    SUM(CASE WHEN ratio > 1.2 AND ratio <= 1.8 THEN 1 ELSE 0 END) as espacando,
    SUM(CASE WHEN ratio > 1.8 AND ratio <= 2.5 THEN 1 ELSE 0 END) as em_risco,
    SUM(CASE WHEN ratio > 2.5 THEN 1 ELSE 0 END) as perdido,
    ROUND(AVG(cadencia_habitual)) as media_cadencia,
    COUNT(*) as total
  FROM (
    SELECT
      iv.cliente,
      iv.cadencia_habitual,
      DATEDIFF(?, uvc.ultima_venda) / iv.cadencia_habitual as ratio
    FROM (
      SELECT v.cliente,
        DATEDIFF(MAX(DATE(v.data_criacao)), MIN(DATE(v.data_criacao))) / NULLIF(COUNT(*) - 1, 0) as cadencia_habitual
      FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
      WHERE uu.unidade = ? AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
        AND v.cliente IS NOT NULL AND v.cliente!=2
      GROUP BY v.cliente HAVING COUNT(*) >= 2
    ) iv
    JOIN (
      SELECT v.cliente, MAX(DATE(v.data_criacao)) as ultima_venda
      FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
      WHERE uu.unidade = ? AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
        AND v.cliente IS NOT NULL AND v.cliente!=2
      GROUP BY v.cliente
    ) uvc ON uvc.cliente = iv.cliente
    JOIN (
      SELECT DISTINCT v.cliente
      FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
      WHERE uu.unidade = ? AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
        AND v.cliente IS NOT NULL AND v.cliente!=2
        AND DATE(v.data_criacao) >= ? AND DATE(v.data_criacao) <= ?
    ) bs ON bs.cliente = iv.cliente
    JOIN clientes c ON c.id = iv.cliente
    WHERE c.status=1 AND iv.cadencia_habitual IS NOT NULL AND iv.cadencia_habitual > 0
  ) ratios
`;

const [grupos] = await conn.execute(sql1, [dataFim, U, U, U, dataInicio12m, dataFim]);
console.log('=== GRUPOS CADÊNCIA (ratio, base 12m até 2026-03-31) ===');
console.log('Assíduo (≤0.8):', grupos[0].assiduo);
console.log('Regular (0.8-1.2):', grupos[0].regular);
console.log('Espaçando (1.2-1.8):', grupos[0].espacando);
console.log('Em Risco (1.8-2.5):', grupos[0].em_risco);
console.log('Perdido (>2.5):', grupos[0].perdido);
console.log('Total com cadência:', grupos[0].total);
console.log('Média cadência (dias):', grupos[0].media_cadencia);

// 1ª Vez (one-shots na base 12m)
const [pv] = await conn.execute(`
  SELECT COUNT(*) as total
  FROM (
    SELECT v.cliente, COUNT(*) as tv
    FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
    WHERE uu.unidade = ? AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
      AND v.cliente IS NOT NULL AND v.cliente!=2
    GROUP BY v.cliente HAVING tv = 1
  ) vh
  JOIN (
    SELECT DISTINCT v.cliente
    FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
    WHERE uu.unidade = ? AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
      AND v.cliente IS NOT NULL AND v.cliente!=2
      AND DATE(v.data_criacao) >= ? AND DATE(v.data_criacao) <= ?
  ) bs ON bs.cliente = vh.cliente
  JOIN clientes c ON c.id = vh.cliente WHERE c.status=1
`, [U, U, dataInicio12m, dataFim]);
console.log('\n1ª Vez (one-shots, base 12m):', pv[0].total);

// Evolução mensal dos últimos 6 meses (mais rápido)
console.log('\n=== EVOLUÇÃO MENSAL (últimos 6 meses) ===');
for (let i = 5; i >= 0; i--) {
  const d = new Date('2026-03-31');
  d.setMonth(d.getMonth() - i);
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(ano, d.getMonth() + 1, 0).getDate();
  const refDate = `${ano}-${mes}-${String(lastDay).padStart(2,'0')}`;
  const ref12m = new Date(refDate);
  ref12m.setFullYear(ref12m.getFullYear() - 1);
  const ref12mStr = ref12m.toISOString().split('T')[0];

  const [g] = await conn.execute(sql1, [refDate, U, U, U, ref12mStr, refDate]);
  const t = Number(g[0].total) || 1;
  console.log(`${ano}-${mes}: assiduo=${g[0].assiduo}(${Math.round(g[0].assiduo/t*100)}%) regular=${g[0].regular}(${Math.round(g[0].regular/t*100)}%) espacando=${g[0].espacando}(${Math.round(g[0].espacando/t*100)}%) em_risco=${g[0].em_risco}(${Math.round(g[0].em_risco/t*100)}%) perdido=${g[0].perdido}(${Math.round(g[0].perdido/t*100)}%) total=${t}`);
}

await conn.end();
console.log('\nDone.');
