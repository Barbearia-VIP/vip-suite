/**
 * Diagnóstico v4: testar churn baseado em cadência individual (ratio)
 * O sistema ref usa ratio > threshold para classificar como "perdido"
 * Base 540d (ultima_visita) = 2377 ≈ 2374 REF
 * REF: 62.1% perdidos (1474/2374) | 47.4% fidelizados (719/1516) | 90.3% one-shot (580/642)
 */
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: '127.0.0.1', port: 13307,
  user: process.env.DB_EXT_USER, password: process.env.DB_EXT_PASS,
  database: process.env.DB_EXT_NAME, connectTimeout: 30000,
});

const U = 29;
const DATA_FIM = '2026-03-31';

// Calcular cadência individual: média de dias entre visitas
// Perdido = dias_desde_ultima > (cadencia_individual * ratio_threshold)
// Vamos testar diferentes thresholds de ratio

console.log('=== TESTANDO CHURN COM CADÊNCIA INDIVIDUAL ===\n');
console.log('REF: 62.1% (1474/2374) | Fid 47.4% (719/1516) | OS 90.3% (580/642)\n');

const [rows] = await conn.execute(`
  SELECT 
    c.id,
    c.ultima_visita,
    DATEDIFF('${DATA_FIM}', c.ultima_visita) as dias_sem_visita,
    COALESCE(tvh.tv, 0) as total_visitas,
    COALESCE(cad.cadencia_media, 0) as cadencia_media
  FROM clientes c
  JOIN (SELECT DISTINCT v.cliente FROM vendas v JOIN usuarios uu ON v.usuario=uu.id
    WHERE uu.unidade=${U} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
    AND v.cliente IS NOT NULL AND v.cliente!=2) bp ON bp.cliente=c.id
  LEFT JOIN (SELECT v2.cliente, COUNT(*) as tv FROM vendas v2 JOIN usuarios uu2 ON v2.usuario=uu2.id
    WHERE uu2.unidade=${U} AND v2.comanda_temp=0 AND v2.cancelado_motivo IS NULL AND v2.status!=0
    AND v2.cliente IS NOT NULL AND v2.cliente!=2 GROUP BY v2.cliente) tvh ON tvh.cliente=c.id
  LEFT JOIN (
    SELECT v3.cliente,
      CASE WHEN COUNT(*) > 1 
        THEN DATEDIFF(MAX(DATE(v3.data_criacao)), MIN(DATE(v3.data_criacao))) / (COUNT(*) - 1)
        ELSE NULL 
      END as cadencia_media
    FROM vendas v3 JOIN usuarios uu3 ON v3.usuario=uu3.id
    WHERE uu3.unidade=${U} AND v3.comanda_temp=0 AND v3.cancelado_motivo IS NULL AND v3.status!=0
    AND v3.cliente IS NOT NULL AND v3.cliente!=2
    GROUP BY v3.cliente
  ) cad ON cad.cliente=c.id
  WHERE c.status=1 AND c.ultima_visita >= DATE_SUB('${DATA_FIM}', INTERVAL 540 DAY)
`);

console.log(`Total clientes: ${rows.length}`);

// Testar diferentes thresholds de ratio
for (const ratio of [1.5, 2.0, 2.5, 3.0]) {
  let perdidos = 0, fid_base = 0, fid_perd = 0, os_base = 0, os_perd = 0;
  
  for (const r of rows) {
    const dias = Number(r.dias_sem_visita);
    const tv = Number(r.total_visitas);
    const cad = Number(r.cadencia_media);
    
    // Para one-shots (tv=1), sem cadência calculável → usar threshold fixo
    // O sistema ref usa 90d para one-shots (classificados como perdidos se >90d)
    let isPerdido;
    if (tv <= 1 || cad === 0) {
      isPerdido = dias > 90;
    } else {
      isPerdido = dias > (cad * ratio);
    }
    
    if (isPerdido) perdidos++;
    if (tv >= 3) {
      fid_base++;
      if (isPerdido) fid_perd++;
    }
    if (tv === 1) {
      os_base++;
      if (isPerdido) os_perd++;
    }
  }
  
  console.log(`\nRatio ${ratio}:`);
  console.log(`  Perdidos: ${perdidos}/${rows.length} → ${(perdidos/rows.length*100).toFixed(1)}% (REF 62.1%)`);
  console.log(`  Fid(≥3): ${fid_base} | Perd fid: ${fid_perd} → ${fid_base > 0 ? (fid_perd/fid_base*100).toFixed(1) : 'N/A'}% (REF 47.4%)`);
  console.log(`  OS(=1): ${os_base} | Perd OS: ${os_perd} → ${os_base > 0 ? (os_perd/os_base*100).toFixed(1) : 'N/A'}% (REF 90.3%)`);
}

// Testar: fidelizados = ≥2 visitas com ratio 2.5
console.log('\n=== TESTANDO: fidelizados = ≥2 vis, ratio 2.5 ===');
{
  let perdidos = 0, fid_base = 0, fid_perd = 0, os_base = 0, os_perd = 0;
  for (const r of rows) {
    const dias = Number(r.dias_sem_visita);
    const tv = Number(r.total_visitas);
    const cad = Number(r.cadencia_media);
    const isPerdido = tv <= 1 || cad === 0 ? dias > 90 : dias > (cad * 2.5);
    if (isPerdido) perdidos++;
    if (tv >= 2) { fid_base++; if (isPerdido) fid_perd++; }
    if (tv === 1) { os_base++; if (isPerdido) os_perd++; }
  }
  console.log(`Perdidos: ${perdidos}/${rows.length} → ${(perdidos/rows.length*100).toFixed(1)}%`);
  console.log(`Fid(≥2): ${fid_base} | Perd: ${fid_perd} → ${(fid_perd/fid_base*100).toFixed(1)}%`);
  console.log(`OS: ${os_base} | Perd: ${os_perd} → ${(os_perd/os_base*100).toFixed(1)}%`);
}

// Testar: one-shots com threshold 45d (janela configurada = 60d → 45d = 75% da janela)
console.log('\n=== TESTANDO: OS threshold 45d, fid ratio 2.5 ===');
for (const osThresh of [30, 45, 60, 75, 90]) {
  let perdidos = 0, fid_base = 0, fid_perd = 0, os_base = 0, os_perd = 0;
  for (const r of rows) {
    const dias = Number(r.dias_sem_visita);
    const tv = Number(r.total_visitas);
    const cad = Number(r.cadencia_media);
    const isPerdido = tv <= 1 || cad === 0 ? dias > osThresh : dias > (cad * 2.5);
    if (isPerdido) perdidos++;
    if (tv >= 3) { fid_base++; if (isPerdido) fid_perd++; }
    if (tv === 1) { os_base++; if (isPerdido) os_perd++; }
  }
  console.log(`OS>${osThresh}d: Perd ${perdidos}/${rows.length}=${( perdidos/rows.length*100).toFixed(1)}% | Fid ${fid_perd}/${fid_base}=${fid_base>0?(fid_perd/fid_base*100).toFixed(1):'N/A'}% | OS ${os_perd}/${os_base}=${os_base>0?(os_perd/os_base*100).toFixed(1):'N/A'}%`);
}

// Verificar: o sistema ref usa "janela" configurada (60d) como base do churn?
// Se a base é 2374 e a janela é 60d → base = visitaram nos últimos 60d * N
// 60d * 9 = 540d → 2377 ≈ 2374 ✓
// Isso sugere que a base do churn = visitaram nos últimos (janela * 9) dias
// Mas isso parece arbitrário... vamos verificar outra hipótese:
// Base = visitaram nos últimos 18 meses (janela padrão do sistema)

console.log('\n=== VERIFICAÇÃO FINAL: distribuição de cadência ===');
let semCad = 0, comCad = 0, cadMedia = 0;
for (const r of rows) {
  if (Number(r.cadencia_media) > 0) { comCad++; cadMedia += Number(r.cadencia_media); }
  else semCad++;
}
console.log(`Com cadência: ${comCad} | Sem cadência (one-shot): ${semCad}`);
console.log(`Cadência média geral: ${(cadMedia/comCad).toFixed(0)}d`);

await conn.end();
console.log('\n=== FIM ===');
