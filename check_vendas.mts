import { getDb } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('no db'); return; }
  
  // Total por unidade com período
  const [rows] = await db.execute(sql.raw(`
    SELECT 
      v.unitId,
      u.name as unitName,
      COUNT(*) as total,
      MIN(DATE(v.vendaData)) as min_data,
      MAX(DATE(v.vendaData)) as max_data,
      SUM(CASE WHEN DATE(v.vendaData) >= '2026-04-01' THEN 1 ELSE 0 END) as abril,
      SUM(CASE WHEN DATE(v.vendaData) >= '2026-03-01' AND DATE(v.vendaData) < '2026-04-01' THEN 1 ELSE 0 END) as marco
    FROM vendas_api_raw v
    LEFT JOIN units u ON u.id = v.unitId
    GROUP BY v.unitId, u.name
    ORDER BY v.unitId
  `)) as any;
  
  console.log('=== Dados por unidade ===');
  console.log('unitId | unitName | total | min_data | max_data | abril | marco');
  for (const r of rows as any[]) {
    console.log(`${r.unitId} | ${r.unitName} | ${r.total} | ${r.min_data} | ${r.max_data} | ${r.abril} | ${r.marco}`);
  }
  
  // Verificar logs de sync mais recentes
  const [logs] = await db.execute(sql.raw(`
    SELECT l.unitId, u.name, l.status, l.registrosInseridos, l.periodoInicio, l.periodoFim, l.modo, l.erro
    FROM vip_sync_logs l
    LEFT JOIN units u ON u.id = l.unitId
    ORDER BY l.iniciadoEm DESC
    LIMIT 40
  `)) as any;
  
  console.log('\n=== Logs de sincronização recentes ===');
  for (const l of logs as any[]) {
    console.log(`unitId=${l.unitId} (${l.name}) | ${l.status} | ${l.registrosInseridos} ins | ${l.periodoInicio} a ${l.periodoFim} | modo=${l.modo} | ${l.erro || 'ok'}`);
  }
}

main().catch(console.error);
