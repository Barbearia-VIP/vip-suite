/**
 * Script de reclassificação histórica do VIP CAM
 * Aplica a nova regra: 1 captura satisfeita = Satisfeito definitivo
 * 
 * Etapa 1: Reclassifica cam_sentiment_timeline com novos thresholds (happy >= 0.12)
 * Etapa 2: Recalcula satisfactionLevel de cada cliente com a nova regra proporcional
 */
import { createConnection } from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL não definida');
  process.exit(1);
}

const UNIT_ID = 1;

async function main() {
  const conn = await createConnection(DATABASE_URL);
  console.log('Conectado ao banco interno.');

  // ── Etapa 1: Reclassificar timeline com novos thresholds ──
  console.log('\n[Etapa 1] Reclassificando cam_sentiment_timeline...');
  const [tlResult] = await conn.execute(`
    UPDATE cam_sentiment_timeline
    SET satisfactionLevel = CASE
      WHEN expression = 'happy'     AND CAST(confidence AS DECIMAL(10,4)) >= 0.12 THEN 'satisfied'
      WHEN expression = 'angry'     AND CAST(confidence AS DECIMAL(10,4)) >= 0.30 THEN 'unsatisfied'
      WHEN expression = 'disgusted' AND CAST(confidence AS DECIMAL(10,4)) >= 0.30 THEN 'unsatisfied'
      WHEN expression = 'sad'       AND CAST(confidence AS DECIMAL(10,4)) >= 0.40 THEN 'unsatisfied'
      ELSE 'neutral'
    END
    WHERE unitId = ?
  `, [UNIT_ID]);
  console.log(`  → ${tlResult.affectedRows} registros de timeline atualizados`);

  // ── Etapa 2: Buscar todos os clientes da unidade ──
  console.log('\n[Etapa 2] Recalculando status final de cada cliente...');
  const [clientes] = await conn.execute(
    'SELECT id FROM cam_clientes WHERE unitId = ?',
    [UNIT_ID]
  );
  console.log(`  → ${clientes.length} clientes encontrados`);

  // Buscar toda a timeline de uma vez
  const [timelines] = await conn.execute(
    'SELECT clienteId, satisfactionLevel FROM cam_sentiment_timeline WHERE unitId = ?',
    [UNIT_ID]
  );

  // Agrupar por cliente
  const byCliente = new Map();
  for (const t of timelines) {
    if (!byCliente.has(t.clienteId)) byCliente.set(t.clienteId, []);
    byCliente.get(t.clienteId).push(t.satisfactionLevel);
  }

  // Calcular status final com nova regra
  function calcFinal(levels) {
    if (!levels || levels.length === 0) return 'neutral';
    const satisfied = levels.filter(l => l === 'satisfied').length;
    const unsatisfied = levels.filter(l => l === 'unsatisfied').length;
    const total = levels.length;

    // Nova regra: 1 captura satisfeita = Satisfeito definitivo
    if (satisfied >= 1) return 'satisfied';

    // Sem nenhuma satisfeita: insatisfeito se >= 25% negativas
    if (unsatisfied / total >= 0.25) return 'unsatisfied';

    return 'neutral';
  }

  // Atualizar em chunks de 100
  let updated = 0;
  const stats = { satisfied: 0, neutral: 0, unsatisfied: 0 };
  const CHUNK = 100;

  for (let i = 0; i < clientes.length; i += CHUNK) {
    const chunk = clientes.slice(i, i + CHUNK);
    for (const { id } of chunk) {
      const levels = byCliente.get(id) || [];
      const newStatus = calcFinal(levels);
      stats[newStatus]++;
      await conn.execute(
        'UPDATE cam_clientes SET satisfactionLevel = ? WHERE id = ?',
        [newStatus, id]
      );
      updated++;
    }
    process.stdout.write(`\r  → ${updated}/${clientes.length} clientes processados...`);
  }

  console.log(`\n\n[Resultado]`);
  console.log(`  Satisfeitos:   ${stats.satisfied} (${Math.round(stats.satisfied/clientes.length*100)}%)`);
  console.log(`  Neutros:       ${stats.neutral} (${Math.round(stats.neutral/clientes.length*100)}%)`);
  console.log(`  Insatisfeitos: ${stats.unsatisfied} (${Math.round(stats.unsatisfied/clientes.length*100)}%)`);
  console.log(`  Total:         ${clientes.length}`);

  await conn.end();
  console.log('\nReclassificação concluída com sucesso!');
}

main().catch(e => {
  console.error('Erro:', e.message);
  process.exit(1);
});
