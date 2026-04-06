/**
 * Diagnóstico: comparar KPIs de Churn com o sistema de referência
 * Usa o tunnel SSH já ativo na porta 13307 (iniciado pelo servidor)
 */
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: '127.0.0.1', port: 13307,
  user: process.env.DB_EXT_USER, password: process.env.DB_EXT_PASS,
  database: process.env.DB_EXT_NAME,
  connectTimeout: 30000,
});

const UNIDADE = 29;
const DATA_FIM = '2026-03-31';

console.log(`\n=== DIAGNÓSTICO CHURN ===`);
console.log(`Unidade: ${UNIDADE} | dataFim: ${DATA_FIM}`);
console.log(`Sistema REF: Churn geral 62.1% (1474/2374) | Fidelizados 47.4% (719/1516) | One-shot 90.3% (580/642)\n`);

// Abordagem 1: Base = visitaram no período Jan-Mar/26
const DATA_INICIO = '2026-01-01';
console.log(`--- A1: Base = visitaram no período ${DATA_INICIO}→${DATA_FIM} ---`);
const [r1] = await conn.execute(`
  SELECT COUNT(DISTINCT bp.cliente) as total,
    SUM(CASE WHEN DATEDIFF('${DATA_FIM}', c.ultima_visita) > 90 THEN 1 ELSE 0 END) as perdidos,
    SUM(CASE WHEN COALESCE(tvh.tv,0)>=3 THEN 1 ELSE 0 END) as fid_base,
    SUM(CASE WHEN COALESCE(tvh.tv,0)>=3 AND DATEDIFF('${DATA_FIM}',c.ultima_visita)>90 THEN 1 ELSE 0 END) as fid_perd,
    SUM(CASE WHEN COALESCE(tvh.tv,0)=1 THEN 1 ELSE 0 END) as os_base,
    SUM(CASE WHEN COALESCE(tvh.tv,0)=1 AND DATEDIFF('${DATA_FIM}',c.ultima_visita)>90 THEN 1 ELSE 0 END) as os_perd
  FROM (SELECT DISTINCT v.cliente FROM vendas v JOIN usuarios uu ON v.usuario=uu.id
    WHERE uu.unidade=${UNIDADE} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
    AND v.cliente IS NOT NULL AND v.cliente!=2
    AND DATE(v.data_criacao)>='${DATA_INICIO}' AND DATE(v.data_criacao)<='${DATA_FIM}') bp
  JOIN clientes c ON c.id=bp.cliente
  LEFT JOIN (SELECT v2.cliente, COUNT(*) as tv FROM vendas v2 JOIN usuarios uu2 ON v2.usuario=uu2.id
    WHERE uu2.unidade=${UNIDADE} AND v2.comanda_temp=0 AND v2.cancelado_motivo IS NULL AND v2.status!=0
    AND v2.cliente IS NOT NULL AND v2.cliente!=2 GROUP BY v2.cliente) tvh ON tvh.cliente=c.id
  WHERE c.status=1
`);
const a1 = r1[0];
console.log(`Total: ${a1.total} | Perdidos: ${a1.perdidos} → ${(a1.perdidos/a1.total*100).toFixed(1)}% (REF 62.1%)`);
console.log(`Fid base: ${a1.fid_base} | Perd fid: ${a1.fid_perd} → ${(a1.fid_perd/a1.fid_base*100).toFixed(1)}% (REF 47.4%)`);
console.log(`OS base: ${a1.os_base} | Perd OS: ${a1.os_perd} → ${(a1.os_perd/a1.os_base*100).toFixed(1)}% (REF 90.3%)`);

// Abordagem 2: Base = toda a base histórica
console.log(`\n--- A2: Base = toda a base histórica ---`);
const [r2] = await conn.execute(`
  SELECT COUNT(DISTINCT bp.cliente) as total,
    SUM(CASE WHEN DATEDIFF('${DATA_FIM}', c.ultima_visita) > 90 THEN 1 ELSE 0 END) as perdidos,
    SUM(CASE WHEN COALESCE(tvh.tv,0)>=3 THEN 1 ELSE 0 END) as fid_base,
    SUM(CASE WHEN COALESCE(tvh.tv,0)>=3 AND DATEDIFF('${DATA_FIM}',c.ultima_visita)>90 THEN 1 ELSE 0 END) as fid_perd,
    SUM(CASE WHEN COALESCE(tvh.tv,0)=1 THEN 1 ELSE 0 END) as os_base,
    SUM(CASE WHEN COALESCE(tvh.tv,0)=1 AND DATEDIFF('${DATA_FIM}',c.ultima_visita)>90 THEN 1 ELSE 0 END) as os_perd
  FROM (SELECT DISTINCT v.cliente FROM vendas v JOIN usuarios uu ON v.usuario=uu.id
    WHERE uu.unidade=${UNIDADE} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
    AND v.cliente IS NOT NULL AND v.cliente!=2) bp
  JOIN clientes c ON c.id=bp.cliente
  LEFT JOIN (SELECT v2.cliente, COUNT(*) as tv FROM vendas v2 JOIN usuarios uu2 ON v2.usuario=uu2.id
    WHERE uu2.unidade=${UNIDADE} AND v2.comanda_temp=0 AND v2.cancelado_motivo IS NULL AND v2.status!=0
    AND v2.cliente IS NOT NULL AND v2.cliente!=2 GROUP BY v2.cliente) tvh ON tvh.cliente=c.id
  WHERE c.status=1
`);
const a2 = r2[0];
console.log(`Total: ${a2.total} | Perdidos: ${a2.perdidos} → ${(a2.perdidos/a2.total*100).toFixed(1)}% (REF 62.1%)`);
console.log(`Fid base: ${a2.fid_base} | Perd fid: ${a2.fid_perd} → ${(a2.fid_perd/a2.fid_base*100).toFixed(1)}% (REF 47.4%)`);
console.log(`OS base: ${a2.os_base} | Perd OS: ${a2.os_perd} → ${(a2.os_perd/a2.os_base*100).toFixed(1)}% (REF 90.3%)`);

// Abordagem 3: Base = visitaram nos 12m antes de dataFim (janela 12m)
const DATA_12M = '2025-04-01';
console.log(`\n--- A3: Base = visitaram nos 12m (${DATA_12M}→${DATA_FIM}) ---`);
const [r3] = await conn.execute(`
  SELECT COUNT(DISTINCT bp.cliente) as total,
    SUM(CASE WHEN DATEDIFF('${DATA_FIM}', c.ultima_visita) > 90 THEN 1 ELSE 0 END) as perdidos,
    SUM(CASE WHEN COALESCE(tvh.tv,0)>=3 THEN 1 ELSE 0 END) as fid_base,
    SUM(CASE WHEN COALESCE(tvh.tv,0)>=3 AND DATEDIFF('${DATA_FIM}',c.ultima_visita)>90 THEN 1 ELSE 0 END) as fid_perd,
    SUM(CASE WHEN COALESCE(tvh.tv,0)=1 THEN 1 ELSE 0 END) as os_base,
    SUM(CASE WHEN COALESCE(tvh.tv,0)=1 AND DATEDIFF('${DATA_FIM}',c.ultima_visita)>90 THEN 1 ELSE 0 END) as os_perd
  FROM (SELECT DISTINCT v.cliente FROM vendas v JOIN usuarios uu ON v.usuario=uu.id
    WHERE uu.unidade=${UNIDADE} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
    AND v.cliente IS NOT NULL AND v.cliente!=2
    AND DATE(v.data_criacao)>='${DATA_12M}' AND DATE(v.data_criacao)<='${DATA_FIM}') bp
  JOIN clientes c ON c.id=bp.cliente
  LEFT JOIN (SELECT v2.cliente, COUNT(*) as tv FROM vendas v2 JOIN usuarios uu2 ON v2.usuario=uu2.id
    WHERE uu2.unidade=${UNIDADE} AND v2.comanda_temp=0 AND v2.cancelado_motivo IS NULL AND v2.status!=0
    AND v2.cliente IS NOT NULL AND v2.cliente!=2 GROUP BY v2.cliente) tvh ON tvh.cliente=c.id
  WHERE c.status=1
`);
const a3 = r3[0];
console.log(`Total: ${a3.total} | Perdidos: ${a3.perdidos} → ${(a3.perdidos/a3.total*100).toFixed(1)}% (REF 62.1%)`);
console.log(`Fid base: ${a3.fid_base} | Perd fid: ${a3.fid_perd} → ${(a3.fid_perd/a3.fid_base*100).toFixed(1)}% (REF 47.4%)`);
console.log(`OS base: ${a3.os_base} | Perd OS: ${a3.os_perd} → ${(a3.os_perd/a3.os_base*100).toFixed(1)}% (REF 90.3%)`);

// Abordagem 4: Churn = perdidos da BASE (visitaram 12m), não do período
// Fidelizados = ≥3 visitas NO PERÍODO (não histórico)
console.log(`\n--- A4: Fidelizados = ≥3 vis NO PERÍODO (não histórico) ---`);
const [r4] = await conn.execute(`
  SELECT COUNT(DISTINCT bp.cliente) as total,
    SUM(CASE WHEN DATEDIFF('${DATA_FIM}', c.ultima_visita) > 90 THEN 1 ELSE 0 END) as perdidos,
    SUM(CASE WHEN COALESCE(tvp.tv,0)>=3 THEN 1 ELSE 0 END) as fid_base,
    SUM(CASE WHEN COALESCE(tvp.tv,0)>=3 AND DATEDIFF('${DATA_FIM}',c.ultima_visita)>90 THEN 1 ELSE 0 END) as fid_perd,
    SUM(CASE WHEN COALESCE(tvp.tv,0)=1 THEN 1 ELSE 0 END) as os_base,
    SUM(CASE WHEN COALESCE(tvp.tv,0)=1 AND DATEDIFF('${DATA_FIM}',c.ultima_visita)>90 THEN 1 ELSE 0 END) as os_perd
  FROM (SELECT DISTINCT v.cliente FROM vendas v JOIN usuarios uu ON v.usuario=uu.id
    WHERE uu.unidade=${UNIDADE} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
    AND v.cliente IS NOT NULL AND v.cliente!=2
    AND DATE(v.data_criacao)>='${DATA_12M}' AND DATE(v.data_criacao)<='${DATA_FIM}') bp
  JOIN clientes c ON c.id=bp.cliente
  LEFT JOIN (SELECT v2.cliente, COUNT(*) as tv FROM vendas v2 JOIN usuarios uu2 ON v2.usuario=uu2.id
    WHERE uu2.unidade=${UNIDADE} AND v2.comanda_temp=0 AND v2.cancelado_motivo IS NULL AND v2.status!=0
    AND v2.cliente IS NOT NULL AND v2.cliente!=2
    AND DATE(v2.data_criacao)>='${DATA_12M}' AND DATE(v2.data_criacao)<='${DATA_FIM}'
    GROUP BY v2.cliente) tvp ON tvp.cliente=c.id
  WHERE c.status=1
`);
const a4 = r4[0];
console.log(`Total: ${a4.total} | Perdidos: ${a4.perdidos} → ${(a4.perdidos/a4.total*100).toFixed(1)}% (REF 62.1%)`);
console.log(`Fid base (≥3 no período): ${a4.fid_base} | Perd fid: ${a4.fid_perd} → ${a4.fid_base > 0 ? (a4.fid_perd/a4.fid_base*100).toFixed(1) : 'N/A'}% (REF 47.4%)`);
console.log(`OS base (1 no período): ${a4.os_base} | Perd OS: ${a4.os_perd} → ${a4.os_base > 0 ? (a4.os_perd/a4.os_base*100).toFixed(1) : 'N/A'}% (REF 90.3%)`);

// Verificar: base 1795 e 2374 do print
console.log(`\n--- VERIFICAÇÃO: bases do print (1795 base, 2374 churn) ---`);
const [rb1] = await conn.execute(`
  SELECT COUNT(*) as total FROM clientes c
  JOIN (SELECT DISTINCT v.cliente FROM vendas v JOIN usuarios uu ON v.usuario=uu.id
    WHERE uu.unidade=${UNIDADE} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
    AND v.cliente IS NOT NULL AND v.cliente!=2) bp ON bp.cliente=c.id
  WHERE c.status=1 AND c.ultima_visita >= DATE_SUB('${DATA_FIM}', INTERVAL 12 MONTH)
`);
console.log(`Base 12m (ultima_visita): ${rb1[0].total} (REF: 1795)`);

const [rb2] = await conn.execute(`
  SELECT COUNT(*) as total FROM clientes c
  JOIN (SELECT DISTINCT v.cliente FROM vendas v JOIN usuarios uu ON v.usuario=uu.id
    WHERE uu.unidade=${UNIDADE} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
    AND v.cliente IS NOT NULL AND v.cliente!=2) bp ON bp.cliente=c.id
  WHERE c.status=1
`);
console.log(`Base histórica total: ${rb2[0].total} (REF churn: 2374)`);

const [rb3] = await conn.execute(`
  SELECT COUNT(*) as total FROM clientes c
  JOIN (SELECT DISTINCT v.cliente FROM vendas v JOIN usuarios uu ON v.usuario=uu.id
    WHERE uu.unidade=${UNIDADE} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
    AND v.cliente IS NOT NULL AND v.cliente!=2) bp ON bp.cliente=c.id
  WHERE c.status=1 AND c.ultima_visita >= DATE_SUB('${DATA_FIM}', INTERVAL 24 MONTH)
`);
console.log(`Base 24m (ultima_visita): ${rb3[0].total}`);

await conn.end();
console.log('\n=== FIM ===');
