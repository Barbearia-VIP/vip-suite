/**
 * Diagnóstico v3: encontrar a base exata 2374 e KPIs 62.1% / 47.4% / 90.3%
 * ultima_visita 18m = 2389 (mais próximo de 2374)
 */
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: '127.0.0.1', port: 13307,
  user: process.env.DB_EXT_USER, password: process.env.DB_EXT_PASS,
  database: process.env.DB_EXT_NAME, connectTimeout: 30000,
});

const U = 29;
const DATA_FIM = '2026-03-31';

// Testar janelas finas em dias para ultima_visita
console.log('=== BUSCANDO BASE 2374 (janelas finas em dias) ===\n');
for (const dias of [540, 550, 560, 570, 580, 590, 600, 610, 620, 630, 640, 650]) {
  const [r] = await conn.execute(`
    SELECT COUNT(*) as total FROM clientes c
    JOIN (SELECT DISTINCT v.cliente FROM vendas v JOIN usuarios uu ON v.usuario=uu.id
      WHERE uu.unidade=${U} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
      AND v.cliente IS NOT NULL AND v.cliente!=2) bp ON bp.cliente=c.id
    WHERE c.status=1 AND c.ultima_visita >= DATE_SUB('${DATA_FIM}', INTERVAL ${dias} DAY)
  `);
  console.log(`ultima_visita ${dias}d: ${r[0].total} (REF: 2374)`);
}

// Testar janelas finas em dias para vendas
console.log('\n--- vendas (data_criacao) ---');
for (const dias of [540, 550, 560, 570, 580, 590, 600, 610, 620, 630]) {
  const [r] = await conn.execute(`
    SELECT COUNT(DISTINCT bp.cliente) as total
    FROM (SELECT DISTINCT v.cliente FROM vendas v JOIN usuarios uu ON v.usuario=uu.id
      WHERE uu.unidade=${U} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
      AND v.cliente IS NOT NULL AND v.cliente!=2
      AND DATE(v.data_criacao) >= DATE_SUB('${DATA_FIM}', INTERVAL ${dias} DAY)
      AND DATE(v.data_criacao) <= '${DATA_FIM}') bp
    JOIN clientes c ON c.id=bp.cliente WHERE c.status=1
  `);
  console.log(`vendas ${dias}d: ${r[0].total} (REF: 2374)`);
}

// Testar com ultima_visita 540d (mais próximo de 2374 = 2389 em 18m=540d)
console.log('\n=== TESTANDO KPIs COM JANELA 540d (ultima_visita) ===');
const [r540] = await conn.execute(`
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
  WHERE c.status=1 AND c.ultima_visita >= DATE_SUB('${DATA_FIM}', INTERVAL 540 DAY)
`);
const a540 = r540[0];
console.log(`Total: ${a540.total} | Perd: ${a540.perdidos} → ${(a540.perdidos/a540.total*100).toFixed(1)}% (REF 62.1%)`);
console.log(`Fid: ${a540.fid_base} | Perd fid: ${a540.fid_perd} → ${(a540.fid_perd/a540.fid_base*100).toFixed(1)}% (REF 47.4%)`);
console.log(`OS: ${a540.os_base} | Perd OS: ${a540.os_perd} → ${(a540.os_perd/a540.os_base*100).toFixed(1)}% (REF 90.3%)`);

// Testar: fidelizados = ≥2 visitas (não ≥3)
console.log('\n=== TESTANDO: fidelizados = ≥2 visitas ===');
const [rf2] = await conn.execute(`
  SELECT COUNT(*) as total,
    SUM(CASE WHEN DATEDIFF('${DATA_FIM}', c.ultima_visita) > 90 THEN 1 ELSE 0 END) as perdidos,
    SUM(CASE WHEN COALESCE(tvh.tv,0)>=2 THEN 1 ELSE 0 END) as fid_base,
    SUM(CASE WHEN COALESCE(tvh.tv,0)>=2 AND DATEDIFF('${DATA_FIM}',c.ultima_visita)>90 THEN 1 ELSE 0 END) as fid_perd,
    SUM(CASE WHEN COALESCE(tvh.tv,0)=1 THEN 1 ELSE 0 END) as os_base,
    SUM(CASE WHEN COALESCE(tvh.tv,0)=1 AND DATEDIFF('${DATA_FIM}',c.ultima_visita)>90 THEN 1 ELSE 0 END) as os_perd
  FROM clientes c
  JOIN (SELECT DISTINCT v.cliente FROM vendas v JOIN usuarios uu ON v.usuario=uu.id
    WHERE uu.unidade=${U} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
    AND v.cliente IS NOT NULL AND v.cliente!=2) bp ON bp.cliente=c.id
  LEFT JOIN (SELECT v2.cliente, COUNT(*) as tv FROM vendas v2 JOIN usuarios uu2 ON v2.usuario=uu2.id
    WHERE uu2.unidade=${U} AND v2.comanda_temp=0 AND v2.cancelado_motivo IS NULL AND v2.status!=0
    AND v2.cliente IS NOT NULL AND v2.cliente!=2 GROUP BY v2.cliente) tvh ON tvh.cliente=c.id
  WHERE c.status=1 AND c.ultima_visita >= DATE_SUB('${DATA_FIM}', INTERVAL 540 DAY)
`);
const af2 = rf2[0];
console.log(`Total: ${af2.total} | Perd: ${af2.perdidos} → ${(af2.perdidos/af2.total*100).toFixed(1)}%`);
console.log(`Fid(≥2): ${af2.fid_base} | Perd fid: ${af2.fid_perd} → ${(af2.fid_perd/af2.fid_base*100).toFixed(1)}% (REF 47.4%)`);
console.log(`OS: ${af2.os_base} | Perd OS: ${af2.os_perd} → ${(af2.os_perd/af2.os_base*100).toFixed(1)}% (REF 90.3%)`);

// Testar: perdidos = sem visita nos últimos 60d (janela configurada)
console.log('\n=== TESTANDO: perdidos = sem visita nos últimos 60d ===');
const [rp60] = await conn.execute(`
  SELECT COUNT(*) as total,
    SUM(CASE WHEN DATEDIFF('${DATA_FIM}', c.ultima_visita) > 60 THEN 1 ELSE 0 END) as perdidos,
    SUM(CASE WHEN COALESCE(tvh.tv,0)>=3 THEN 1 ELSE 0 END) as fid_base,
    SUM(CASE WHEN COALESCE(tvh.tv,0)>=3 AND DATEDIFF('${DATA_FIM}',c.ultima_visita)>60 THEN 1 ELSE 0 END) as fid_perd,
    SUM(CASE WHEN COALESCE(tvh.tv,0)=1 THEN 1 ELSE 0 END) as os_base,
    SUM(CASE WHEN COALESCE(tvh.tv,0)=1 AND DATEDIFF('${DATA_FIM}',c.ultima_visita)>60 THEN 1 ELSE 0 END) as os_perd
  FROM clientes c
  JOIN (SELECT DISTINCT v.cliente FROM vendas v JOIN usuarios uu ON v.usuario=uu.id
    WHERE uu.unidade=${U} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
    AND v.cliente IS NOT NULL AND v.cliente!=2) bp ON bp.cliente=c.id
  LEFT JOIN (SELECT v2.cliente, COUNT(*) as tv FROM vendas v2 JOIN usuarios uu2 ON v2.usuario=uu2.id
    WHERE uu2.unidade=${U} AND v2.comanda_temp=0 AND v2.cancelado_motivo IS NULL AND v2.status!=0
    AND v2.cliente IS NOT NULL AND v2.cliente!=2 GROUP BY v2.cliente) tvh ON tvh.cliente=c.id
  WHERE c.status=1 AND c.ultima_visita >= DATE_SUB('${DATA_FIM}', INTERVAL 540 DAY)
`);
const ap60 = rp60[0];
console.log(`Total: ${ap60.total} | Perd(>60d): ${ap60.perdidos} → ${(ap60.perdidos/ap60.total*100).toFixed(1)}%`);
console.log(`Fid: ${ap60.fid_base} | Perd fid: ${ap60.fid_perd} → ${(ap60.fid_perd/ap60.fid_base*100).toFixed(1)}%`);
console.log(`OS: ${ap60.os_base} | Perd OS: ${ap60.os_perd} → ${(ap60.os_perd/ap60.os_base*100).toFixed(1)}%`);

// Verificar: o sistema ref usa "janela" do config (60d) para definir "perdido"?
// Perdido = sem visita nos últimos (janela * 1.5) = 90d
// Mas talvez use a cadência individual como threshold
// Vamos verificar os números absolutos: 1474 perdidos de 2374
// Isso significa que 900 não são perdidos (visitaram nos últimos 90d)
// Vamos verificar quantos visitaram nos últimos 90d na base 18m
console.log('\n=== VERIFICAÇÃO: quantos visitaram nos últimos 90d na base 18m ===');
const [rv90] = await conn.execute(`
  SELECT 
    COUNT(*) as total_18m,
    SUM(CASE WHEN DATEDIFF('${DATA_FIM}', c.ultima_visita) <= 90 THEN 1 ELSE 0 END) as ativos_90d,
    SUM(CASE WHEN DATEDIFF('${DATA_FIM}', c.ultima_visita) > 90 THEN 1 ELSE 0 END) as perdidos_90d
  FROM clientes c
  JOIN (SELECT DISTINCT v.cliente FROM vendas v JOIN usuarios uu ON v.usuario=uu.id
    WHERE uu.unidade=${U} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
    AND v.cliente IS NOT NULL AND v.cliente!=2) bp ON bp.cliente=c.id
  WHERE c.status=1 AND c.ultima_visita >= DATE_SUB('${DATA_FIM}', INTERVAL 540 DAY)
`);
const rv = rv90[0];
console.log(`Base 18m: ${rv.total_18m} | Ativos (≤90d): ${rv.ativos_90d} | Perdidos (>90d): ${rv.perdidos_90d}`);
console.log(`REF: 2374 total | 900 ativos | 1474 perdidos`);

// Verificar: o sistema ref conta one-shots como parte dos fidelizados?
// REF: Fidelizados 47.4% (719/1516) → 1516 fidelizados de 2374
// 2374 - 1516 = 858 não-fidelizados (one-shots + ?)
// REF: One-shot 90.3% (580/642) → 642 one-shots
// 858 - 642 = 216 com 2 visitas?
console.log('\n=== VERIFICAÇÃO: distribuição por nº de visitas ===');
const [rdist] = await conn.execute(`
  SELECT 
    COALESCE(tvh.tv, 0) as visitas,
    COUNT(*) as clientes
  FROM clientes c
  JOIN (SELECT DISTINCT v.cliente FROM vendas v JOIN usuarios uu ON v.usuario=uu.id
    WHERE uu.unidade=${U} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
    AND v.cliente IS NOT NULL AND v.cliente!=2) bp ON bp.cliente=c.id
  LEFT JOIN (SELECT v2.cliente, COUNT(*) as tv FROM vendas v2 JOIN usuarios uu2 ON v2.usuario=uu2.id
    WHERE uu2.unidade=${U} AND v2.comanda_temp=0 AND v2.cancelado_motivo IS NULL AND v2.status!=0
    AND v2.cliente IS NOT NULL AND v2.cliente!=2 GROUP BY v2.cliente) tvh ON tvh.cliente=c.id
  WHERE c.status=1 AND c.ultima_visita >= DATE_SUB('${DATA_FIM}', INTERVAL 540 DAY)
  GROUP BY COALESCE(tvh.tv, 0) ORDER BY visitas
  LIMIT 10
`);
rdist.forEach(row => console.log(`  ${row.visitas} visitas: ${row.clientes} clientes`));

await conn.end();
console.log('\n=== FIM ===');
