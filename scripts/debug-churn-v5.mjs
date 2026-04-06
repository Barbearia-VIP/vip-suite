/**
 * Diagnóstico v5: testar threshold de perda = janela configurada (60d)
 * Hipótese: perdido = sem visita nos últimos (janela * N) dias
 * Base = ultima_visita nos últimos 540d (≈ 2374)
 */
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: '127.0.0.1', port: 13307,
  user: process.env.DB_EXT_USER, password: process.env.DB_EXT_PASS,
  database: process.env.DB_EXT_NAME, connectTimeout: 30000,
});

const U = 29;
const DATA_FIM = '2026-03-31';
const JANELA = 60; // janela configurada

console.log('=== TESTANDO THRESHOLD BASEADO NA JANELA CONFIGURADA ===\n');
console.log('REF: 62.1% (1474/2374) | Fid 47.4% (719/1516) | OS 90.3% (580/642)\n');

// Testar diferentes multiplicadores da janela como threshold de perda
for (const mult of [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0]) {
  const threshold = Math.round(JANELA * mult);
  const [r] = await conn.execute(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN DATEDIFF('${DATA_FIM}', c.ultima_visita) > ${threshold} THEN 1 ELSE 0 END) as perdidos,
      SUM(CASE WHEN COALESCE(tvh.tv,0)>=3 THEN 1 ELSE 0 END) as fid_base,
      SUM(CASE WHEN COALESCE(tvh.tv,0)>=3 AND DATEDIFF('${DATA_FIM}',c.ultima_visita)>${threshold} THEN 1 ELSE 0 END) as fid_perd,
      SUM(CASE WHEN COALESCE(tvh.tv,0)=1 THEN 1 ELSE 0 END) as os_base,
      SUM(CASE WHEN COALESCE(tvh.tv,0)=1 AND DATEDIFF('${DATA_FIM}',c.ultima_visita)>${threshold} THEN 1 ELSE 0 END) as os_perd
    FROM clientes c
    JOIN (SELECT DISTINCT v.cliente FROM vendas v JOIN usuarios uu ON v.usuario=uu.id
      WHERE uu.unidade=${U} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
      AND v.cliente IS NOT NULL AND v.cliente!=2) bp ON bp.cliente=c.id
    LEFT JOIN (SELECT v2.cliente, COUNT(*) as tv FROM vendas v2 JOIN usuarios uu2 ON v2.usuario=uu2.id
      WHERE uu2.unidade=${U} AND v2.comanda_temp=0 AND v2.cancelado_motivo IS NULL AND v2.status!=0
      AND v2.cliente IS NOT NULL AND v2.cliente!=2 GROUP BY v2.cliente) tvh ON tvh.cliente=c.id
    WHERE c.status=1 AND c.ultima_visita >= DATE_SUB('${DATA_FIM}', INTERVAL 540 DAY)
  `);
  const a = r[0];
  console.log(`Threshold ${threshold}d (${mult}x janela): Perd ${a.perdidos}/${a.total}=${(a.perdidos/a.total*100).toFixed(1)}% | Fid ${a.fid_perd}/${a.fid_base}=${(a.fid_perd/a.fid_base*100).toFixed(1)}% | OS ${a.os_perd}/${a.os_base}=${(a.os_perd/a.os_base*100).toFixed(1)}%`);
}

// Testar com base = vendas 620d (2381 ≈ 2374)
console.log('\n=== BASE = vendas 620d (2381 ≈ 2374) ===');
for (const threshold of [30, 45, 60, 75, 90, 120]) {
  const [r] = await conn.execute(`
    SELECT COUNT(DISTINCT bp.cliente) as total,
      SUM(CASE WHEN DATEDIFF('${DATA_FIM}', c.ultima_visita) > ${threshold} THEN 1 ELSE 0 END) as perdidos,
      SUM(CASE WHEN COALESCE(tvh.tv,0)>=3 THEN 1 ELSE 0 END) as fid_base,
      SUM(CASE WHEN COALESCE(tvh.tv,0)>=3 AND DATEDIFF('${DATA_FIM}',c.ultima_visita)>${threshold} THEN 1 ELSE 0 END) as fid_perd,
      SUM(CASE WHEN COALESCE(tvh.tv,0)=1 THEN 1 ELSE 0 END) as os_base,
      SUM(CASE WHEN COALESCE(tvh.tv,0)=1 AND DATEDIFF('${DATA_FIM}',c.ultima_visita)>${threshold} THEN 1 ELSE 0 END) as os_perd
    FROM (SELECT DISTINCT v.cliente FROM vendas v JOIN usuarios uu ON v.usuario=uu.id
      WHERE uu.unidade=${U} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
      AND v.cliente IS NOT NULL AND v.cliente!=2
      AND DATE(v.data_criacao) >= DATE_SUB('${DATA_FIM}', INTERVAL 620 DAY)
      AND DATE(v.data_criacao) <= '${DATA_FIM}') bp
    JOIN clientes c ON c.id=bp.cliente
    LEFT JOIN (SELECT v2.cliente, COUNT(*) as tv FROM vendas v2 JOIN usuarios uu2 ON v2.usuario=uu2.id
      WHERE uu2.unidade=${U} AND v2.comanda_temp=0 AND v2.cancelado_motivo IS NULL AND v2.status!=0
      AND v2.cliente IS NOT NULL AND v2.cliente!=2 GROUP BY v2.cliente) tvh ON tvh.cliente=c.id
    WHERE c.status=1
  `);
  const a = r[0];
  console.log(`Threshold ${threshold}d: Perd ${a.perdidos}/${a.total}=${(a.perdidos/a.total*100).toFixed(1)}% | Fid ${a.fid_perd}/${a.fid_base}=${(a.fid_perd/a.fid_base*100).toFixed(1)}% | OS ${a.os_perd}/${a.os_base}=${(a.os_perd/a.os_base*100).toFixed(1)}%`);
}

// Hipótese final: o sistema ref conta como "perdido" = sem visita desde o início do período
// Ou seja: perdido = ultima_visita < dataInicio (01/01/2026)
console.log('\n=== HIPÓTESE: perdido = ultima_visita < dataInicio ===');
const DATA_INICIO = '2026-01-01';
for (const janelaMeses of [12, 15, 18, 20]) {
  const [r] = await conn.execute(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN c.ultima_visita < '${DATA_INICIO}' THEN 1 ELSE 0 END) as perdidos,
      SUM(CASE WHEN COALESCE(tvh.tv,0)>=3 THEN 1 ELSE 0 END) as fid_base,
      SUM(CASE WHEN COALESCE(tvh.tv,0)>=3 AND c.ultima_visita < '${DATA_INICIO}' THEN 1 ELSE 0 END) as fid_perd,
      SUM(CASE WHEN COALESCE(tvh.tv,0)=1 THEN 1 ELSE 0 END) as os_base,
      SUM(CASE WHEN COALESCE(tvh.tv,0)=1 AND c.ultima_visita < '${DATA_INICIO}' THEN 1 ELSE 0 END) as os_perd
    FROM clientes c
    JOIN (SELECT DISTINCT v.cliente FROM vendas v JOIN usuarios uu ON v.usuario=uu.id
      WHERE uu.unidade=${U} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
      AND v.cliente IS NOT NULL AND v.cliente!=2) bp ON bp.cliente=c.id
    LEFT JOIN (SELECT v2.cliente, COUNT(*) as tv FROM vendas v2 JOIN usuarios uu2 ON v2.usuario=uu2.id
      WHERE uu2.unidade=${U} AND v2.comanda_temp=0 AND v2.cancelado_motivo IS NULL AND v2.status!=0
      AND v2.cliente IS NOT NULL AND v2.cliente!=2 GROUP BY v2.cliente) tvh ON tvh.cliente=c.id
    WHERE c.status=1 AND c.ultima_visita >= DATE_SUB('${DATA_INICIO}', INTERVAL ${janelaMeses} MONTH)
  `);
  const a = r[0];
  console.log(`Base ${janelaMeses}m antes de ${DATA_INICIO}: ${a.total} | Perd(< ${DATA_INICIO}): ${a.perdidos}=${a.total>0?(a.perdidos/a.total*100).toFixed(1):'N/A'}% | Fid: ${a.fid_perd}/${a.fid_base}=${a.fid_base>0?(a.fid_perd/a.fid_base*100).toFixed(1):'N/A'}% | OS: ${a.os_perd}/${a.os_base}=${a.os_base>0?(a.os_perd/a.os_base*100).toFixed(1):'N/A'}%`);
}

// Hipótese: base = visitaram nos 12m antes de dataFim, perdidos = sem visita no período
console.log('\n=== HIPÓTESE: base 12m, perdidos = não visitaram no período ===');
const [r12] = await conn.execute(`
  SELECT COUNT(*) as total,
    SUM(CASE WHEN c.ultima_visita < '${DATA_INICIO}' THEN 1 ELSE 0 END) as perdidos,
    SUM(CASE WHEN COALESCE(tvh.tv,0)>=3 THEN 1 ELSE 0 END) as fid_base,
    SUM(CASE WHEN COALESCE(tvh.tv,0)>=3 AND c.ultima_visita < '${DATA_INICIO}' THEN 1 ELSE 0 END) as fid_perd,
    SUM(CASE WHEN COALESCE(tvh.tv,0)=1 THEN 1 ELSE 0 END) as os_base,
    SUM(CASE WHEN COALESCE(tvh.tv,0)=1 AND c.ultima_visita < '${DATA_INICIO}' THEN 1 ELSE 0 END) as os_perd
  FROM clientes c
  JOIN (SELECT DISTINCT v.cliente FROM vendas v JOIN usuarios uu ON v.usuario=uu.id
    WHERE uu.unidade=${U} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
    AND v.cliente IS NOT NULL AND v.cliente!=2) bp ON bp.cliente=c.id
  LEFT JOIN (SELECT v2.cliente, COUNT(*) as tv FROM vendas v2 JOIN usuarios uu2 ON v2.usuario=uu2.id
    WHERE uu2.unidade=${U} AND v2.comanda_temp=0 AND v2.cancelado_motivo IS NULL AND v2.status!=0
    AND v2.cliente IS NOT NULL AND v2.cliente!=2 GROUP BY v2.cliente) tvh ON tvh.cliente=c.id
  WHERE c.status=1 AND c.ultima_visita >= DATE_SUB('${DATA_FIM}', INTERVAL 12 MONTH)
`);
const a12 = r12[0];
console.log(`Base 12m (ultima_visita): ${a12.total} | Perd(< ${DATA_INICIO}): ${a12.perdidos}=${(a12.perdidos/a12.total*100).toFixed(1)}% | Fid: ${a12.fid_perd}/${a12.fid_base}=${(a12.fid_perd/a12.fid_base*100).toFixed(1)}% | OS: ${a12.os_perd}/${a12.os_base}=${(a12.os_perd/a12.os_base*100).toFixed(1)}%`);

await conn.end();
console.log('\n=== FIM ===');
