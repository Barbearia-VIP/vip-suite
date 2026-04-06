/**
 * Diagnóstico v2: encontrar a base 2374 e lógica exata do sistema de referência
 * REF: Churn geral 62.1% (1474/2374) | Fidelizados 47.4% (719/1516) | One-shot 90.3% (580/642)
 * Janela configurada: 60d | Período: Jan→Mar/26 | Unidade: 29
 */
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: '127.0.0.1', port: 13307,
  user: process.env.DB_EXT_USER, password: process.env.DB_EXT_PASS,
  database: process.env.DB_EXT_NAME, connectTimeout: 30000,
});

const U = 29;
const DATA_FIM = '2026-03-31';

// O sistema ref mostra: 1121 no período, 1795 base, 2374 no churn
// Janela = 60d. Isso sugere que a BASE do churn usa uma janela diferente da base principal
// Hipótese: base churn = visitaram nos últimos N meses (não apenas no período selecionado)

console.log('=== BUSCANDO BASE 2374 ===\n');

// Testar diferentes janelas para encontrar 2374
for (const meses of [18, 20, 22, 24, 26, 28, 30, 36]) {
  const [r] = await conn.execute(`
    SELECT COUNT(DISTINCT bp.cliente) as total
    FROM (SELECT DISTINCT v.cliente FROM vendas v JOIN usuarios uu ON v.usuario=uu.id
      WHERE uu.unidade=${U} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
      AND v.cliente IS NOT NULL AND v.cliente!=2
      AND DATE(v.data_criacao) >= DATE_SUB('${DATA_FIM}', INTERVAL ${meses} MONTH)
      AND DATE(v.data_criacao) <= '${DATA_FIM}') bp
    JOIN clientes c ON c.id=bp.cliente WHERE c.status=1
  `);
  console.log(`Janela ${meses}m: ${r[0].total} (REF: 2374)`);
}

// Testar com ultima_visita
console.log('\n--- ultima_visita ---');
for (const meses of [18, 20, 22, 24, 26, 28, 30, 36]) {
  const [r] = await conn.execute(`
    SELECT COUNT(*) as total FROM clientes c
    JOIN (SELECT DISTINCT v.cliente FROM vendas v JOIN usuarios uu ON v.usuario=uu.id
      WHERE uu.unidade=${U} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
      AND v.cliente IS NOT NULL AND v.cliente!=2) bp ON bp.cliente=c.id
    WHERE c.status=1 AND c.ultima_visita >= DATE_SUB('${DATA_FIM}', INTERVAL ${meses} MONTH)
  `);
  console.log(`ultima_visita ${meses}m: ${r[0].total} (REF: 2374)`);
}

// Hipótese: o sistema ref usa a JANELA configurada (60d) para definir "ativo"
// e a BASE do churn = todos que já visitaram (histórico) mas filtra de outra forma
// Vamos testar: base = visitaram nos últimos 36m, perdidos = sem visita nos últimos 90d
console.log('\n--- TESTANDO LÓGICA: base 36m, perdidos = sem visita 90d ---');
const [r36] = await conn.execute(`
  SELECT COUNT(DISTINCT bp.cliente) as total,
    SUM(CASE WHEN DATEDIFF('${DATA_FIM}', c.ultima_visita) > 90 THEN 1 ELSE 0 END) as perdidos,
    SUM(CASE WHEN COALESCE(tvh.tv,0)>=3 THEN 1 ELSE 0 END) as fid_base,
    SUM(CASE WHEN COALESCE(tvh.tv,0)>=3 AND DATEDIFF('${DATA_FIM}',c.ultima_visita)>90 THEN 1 ELSE 0 END) as fid_perd,
    SUM(CASE WHEN COALESCE(tvh.tv,0)=1 THEN 1 ELSE 0 END) as os_base,
    SUM(CASE WHEN COALESCE(tvh.tv,0)=1 AND DATEDIFF('${DATA_FIM}',c.ultima_visita)>90 THEN 1 ELSE 0 END) as os_perd
  FROM (SELECT DISTINCT v.cliente FROM vendas v JOIN usuarios uu ON v.usuario=uu.id
    WHERE uu.unidade=${U} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
    AND v.cliente IS NOT NULL AND v.cliente!=2
    AND DATE(v.data_criacao) >= DATE_SUB('${DATA_FIM}', INTERVAL 36 MONTH)
    AND DATE(v.data_criacao) <= '${DATA_FIM}') bp
  JOIN clientes c ON c.id=bp.cliente
  LEFT JOIN (SELECT v2.cliente, COUNT(*) as tv FROM vendas v2 JOIN usuarios uu2 ON v2.usuario=uu2.id
    WHERE uu2.unidade=${U} AND v2.comanda_temp=0 AND v2.cancelado_motivo IS NULL AND v2.status!=0
    AND v2.cliente IS NOT NULL AND v2.cliente!=2 GROUP BY v2.cliente) tvh ON tvh.cliente=c.id
  WHERE c.status=1
`);
const a36 = r36[0];
console.log(`Total 36m: ${a36.total} | Perd: ${a36.perdidos} → ${(a36.perdidos/a36.total*100).toFixed(1)}%`);
console.log(`Fid: ${a36.fid_base} | Perd fid: ${a36.fid_perd} → ${(a36.fid_perd/a36.fid_base*100).toFixed(1)}%`);
console.log(`OS: ${a36.os_base} | Perd OS: ${a36.os_perd} → ${(a36.os_perd/a36.os_base*100).toFixed(1)}%`);

// Testar 30m
const [r30] = await conn.execute(`
  SELECT COUNT(DISTINCT bp.cliente) as total,
    SUM(CASE WHEN DATEDIFF('${DATA_FIM}', c.ultima_visita) > 90 THEN 1 ELSE 0 END) as perdidos,
    SUM(CASE WHEN COALESCE(tvh.tv,0)>=3 THEN 1 ELSE 0 END) as fid_base,
    SUM(CASE WHEN COALESCE(tvh.tv,0)>=3 AND DATEDIFF('${DATA_FIM}',c.ultima_visita)>90 THEN 1 ELSE 0 END) as fid_perd,
    SUM(CASE WHEN COALESCE(tvh.tv,0)=1 THEN 1 ELSE 0 END) as os_base,
    SUM(CASE WHEN COALESCE(tvh.tv,0)=1 AND DATEDIFF('${DATA_FIM}',c.ultima_visita)>90 THEN 1 ELSE 0 END) as os_perd
  FROM (SELECT DISTINCT v.cliente FROM vendas v JOIN usuarios uu ON v.usuario=uu.id
    WHERE uu.unidade=${U} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
    AND v.cliente IS NOT NULL AND v.cliente!=2
    AND DATE(v.data_criacao) >= DATE_SUB('${DATA_FIM}', INTERVAL 30 MONTH)
    AND DATE(v.data_criacao) <= '${DATA_FIM}') bp
  JOIN clientes c ON c.id=bp.cliente
  LEFT JOIN (SELECT v2.cliente, COUNT(*) as tv FROM vendas v2 JOIN usuarios uu2 ON v2.usuario=uu2.id
    WHERE uu2.unidade=${U} AND v2.comanda_temp=0 AND v2.cancelado_motivo IS NULL AND v2.status!=0
    AND v2.cliente IS NOT NULL AND v2.cliente!=2 GROUP BY v2.cliente) tvh ON tvh.cliente=c.id
  WHERE c.status=1
`);
const a30 = r30[0];
console.log(`\nTotal 30m: ${a30.total} | Perd: ${a30.perdidos} → ${(a30.perdidos/a30.total*100).toFixed(1)}%`);
console.log(`Fid: ${a30.fid_base} | Perd fid: ${a30.fid_perd} → ${(a30.fid_perd/a30.fid_base*100).toFixed(1)}%`);
console.log(`OS: ${a30.os_base} | Perd OS: ${a30.os_perd} → ${(a30.os_perd/a30.os_base*100).toFixed(1)}%`);

// Hipótese: o sistema ref usa "janela" configurada (60d) como base de churn
// Base churn = clientes que visitaram em qualquer momento, mas cuja ultima_visita
// está dentro de um range específico
// Vamos testar: base = ultima_visita entre 90d e 36m antes de dataFim
console.log('\n--- HIPÓTESE: base = ultima_visita entre 90d e 36m (perdidos recentes) ---');
const [rh] = await conn.execute(`
  SELECT COUNT(*) as total,
    SUM(CASE WHEN DATEDIFF('${DATA_FIM}', c.ultima_visita) > 90 THEN 1 ELSE 0 END) as perdidos,
    SUM(CASE WHEN COALESCE(tvh.tv,0)>=3 THEN 1 ELSE 0 END) as fid_base,
    SUM(CASE WHEN COALESCE(tvh.tv,0)>=3 AND DATEDIFF('${DATA_FIM}',c.ultima_visita)>90 THEN 1 ELSE 0 END) as fid_perd,
    SUM(CASE WHEN COALESCE(tvh.tv,0)=1 THEN 1 ELSE 0 END) as os_base,
    SUM(CASE WHEN COALESCE(tvh.tv,0)=1 AND DATEDIFF('${DATA_FIM}',c.ultima_visita)>90 THEN 1 ELSE 0 END) as os_perd
  FROM clientes c
  JOIN (SELECT DISTINCT v.cliente FROM vendas v JOIN usuarios uu ON v.usuario=uu.id
    WHERE uu.unidade=${U} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
    AND v.cliente IS NOT NULL AND v.cliente!=2) bp ON bp.cliente=c.id
  LEFT JOIN (SELECT v2.cliente, COUNT(*) as tv FROM vendas v2 JOIN usuarios uu2 ON v2.usuario=uu2.id
    WHERE uu2.unidade=${U} AND v2.comanda_temp=0 AND v2.cancelado_motivo IS NULL AND v2.status!=0
    AND v2.cliente IS NOT NULL AND v2.cliente!=2 GROUP BY v2.cliente) tvh ON tvh.cliente=c.id
  WHERE c.status=1
    AND c.ultima_visita >= DATE_SUB('${DATA_FIM}', INTERVAL 36 MONTH)
    AND c.ultima_visita <= '${DATA_FIM}'
`);
const ah = rh[0];
console.log(`Total (ultima_visita 36m): ${ah.total} | Perd: ${ah.perdidos} → ${(ah.perdidos/ah.total*100).toFixed(1)}%`);
console.log(`Fid: ${ah.fid_base} | Perd fid: ${ah.fid_perd} → ${(ah.fid_perd/ah.fid_base*100).toFixed(1)}%`);
console.log(`OS: ${ah.os_base} | Perd OS: ${ah.os_perd} → ${(ah.os_perd/ah.os_base*100).toFixed(1)}%`);

// Testar 20m
const [r20] = await conn.execute(`
  SELECT COUNT(*) as total,
    SUM(CASE WHEN DATEDIFF('${DATA_FIM}', c.ultima_visita) > 90 THEN 1 ELSE 0 END) as perdidos,
    SUM(CASE WHEN COALESCE(tvh.tv,0)>=3 THEN 1 ELSE 0 END) as fid_base,
    SUM(CASE WHEN COALESCE(tvh.tv,0)>=3 AND DATEDIFF('${DATA_FIM}',c.ultima_visita)>90 THEN 1 ELSE 0 END) as fid_perd,
    SUM(CASE WHEN COALESCE(tvh.tv,0)=1 THEN 1 ELSE 0 END) as os_base,
    SUM(CASE WHEN COALESCE(tvh.tv,0)=1 AND DATEDIFF('${DATA_FIM}',c.ultima_visita)>90 THEN 1 ELSE 0 END) as os_perd
  FROM clientes c
  JOIN (SELECT DISTINCT v.cliente FROM vendas v JOIN usuarios uu ON v.usuario=uu.id
    WHERE uu.unidade=${U} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
    AND v.cliente IS NOT NULL AND v.cliente!=2) bp ON bp.cliente=c.id
  LEFT JOIN (SELECT v2.cliente, COUNT(*) as tv FROM vendas v2 JOIN usuarios uu2 ON v2.usuario=uu2.id
    WHERE uu2.unidade=${U} AND v2.comanda_temp=0 AND v2.cancelado_motivo IS NULL AND v2.status!=0
    AND v2.cliente IS NOT NULL AND v2.cliente!=2 GROUP BY v2.cliente) tvh ON tvh.cliente=c.id
  WHERE c.status=1
    AND c.ultima_visita >= DATE_SUB('${DATA_FIM}', INTERVAL 20 MONTH)
    AND c.ultima_visita <= '${DATA_FIM}'
`);
const a20 = r20[0];
console.log(`\nTotal (ultima_visita 20m): ${a20.total} | Perd: ${a20.perdidos} → ${(a20.perdidos/a20.total*100).toFixed(1)}%`);
console.log(`Fid: ${a20.fid_base} | Perd fid: ${a20.fid_perd} → ${(a20.fid_perd/a20.fid_base*100).toFixed(1)}%`);
console.log(`OS: ${a20.os_base} | Perd OS: ${a20.os_perd} → ${(a20.os_perd/a20.os_base*100).toFixed(1)}%`);

// Testar 22m
const [r22] = await conn.execute(`
  SELECT COUNT(*) as total,
    SUM(CASE WHEN DATEDIFF('${DATA_FIM}', c.ultima_visita) > 90 THEN 1 ELSE 0 END) as perdidos,
    SUM(CASE WHEN COALESCE(tvh.tv,0)>=3 THEN 1 ELSE 0 END) as fid_base,
    SUM(CASE WHEN COALESCE(tvh.tv,0)>=3 AND DATEDIFF('${DATA_FIM}',c.ultima_visita)>90 THEN 1 ELSE 0 END) as fid_perd,
    SUM(CASE WHEN COALESCE(tvh.tv,0)=1 THEN 1 ELSE 0 END) as os_base,
    SUM(CASE WHEN COALESCE(tvh.tv,0)=1 AND DATEDIFF('${DATA_FIM}',c.ultima_visita)>90 THEN 1 ELSE 0 END) as os_perd
  FROM clientes c
  JOIN (SELECT DISTINCT v.cliente FROM vendas v JOIN usuarios uu ON v.usuario=uu.id
    WHERE uu.unidade=${U} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
    AND v.cliente IS NOT NULL AND v.cliente!=2) bp ON bp.cliente=c.id
  LEFT JOIN (SELECT v2.cliente, COUNT(*) as tv FROM vendas v2 JOIN usuarios uu2 ON v2.usuario=uu2.id
    WHERE uu2.unidade=${U} AND v2.comanda_temp=0 AND v2.cancelado_motivo IS NULL AND v2.status!=0
    AND v2.cliente IS NOT NULL AND v2.cliente!=2 GROUP BY v2.cliente) tvh ON tvh.cliente=c.id
  WHERE c.status=1
    AND c.ultima_visita >= DATE_SUB('${DATA_FIM}', INTERVAL 22 MONTH)
    AND c.ultima_visita <= '${DATA_FIM}'
`);
const a22 = r22[0];
console.log(`Total (ultima_visita 22m): ${a22.total} | Perd: ${a22.perdidos} → ${(a22.perdidos/a22.total*100).toFixed(1)}%`);
console.log(`Fid: ${a22.fid_base} | Perd fid: ${a22.fid_perd} → ${(a22.fid_perd/a22.fid_base*100).toFixed(1)}%`);
console.log(`OS: ${a22.os_base} | Perd OS: ${a22.os_perd} → ${(a22.os_perd/a22.os_base*100).toFixed(1)}%`);

await conn.end();
console.log('\n=== FIM ===');
