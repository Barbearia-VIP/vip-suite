import { queryExternal } from './server/db-external';

const unitId = 29;
const dataFim = '2026-04-30';
const dataInicio12m = '2025-04-30';
const unitCondV = `uu.unidade = ${unitId}`;

const baseS12mSQL = `
  SELECT DISTINCT v.cliente, MAX(DATE(v.data_criacao)) as ultima_venda
  FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
  WHERE ${unitCondV}
    AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
    AND v.cliente IS NOT NULL AND v.cliente != 2
    AND DATE(v.data_criacao) >= '${dataInicio12m}' AND DATE(v.data_criacao) <= '${dataFim}'
  GROUP BY v.cliente
`;

async function main() {
  const [s] = await queryExternal<any>(`
    SELECT
      COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) <= 60 THEN bs.cliente END) as ativos_60d,
      COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) BETWEEN 61 AND 90 THEN bs.cliente END) as em_risco_61_90,
      COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) > 90 THEN bs.cliente END) as perdidos_90,
      COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) <= 45 THEN bs.cliente END) as ativos_45d,
      COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) BETWEEN 46 AND 90 THEN bs.cliente END) as em_risco_46_90,
      COUNT(DISTINCT bs.cliente) as total
    FROM (${baseS12mSQL}) bs
    JOIN clientes c ON c.id = bs.cliente AND c.status = 1
  `);

  console.log('\n=== Comparação de Limiares (REF = 30/04/2026) ===');
  console.log('\nCom limiar <=60d:');
  console.log('  Ativos (<=60d):', s.ativos_60d, '| Ref: 767');
  console.log('  Em Risco (61-90d):', s.em_risco_61_90, '| Ref: 425');
  console.log('  Perdidos (>90d):', s.perdidos_90, '| Ref: 481');
  console.log('\nCom limiar <=45d (atual):');
  console.log('  Ativos (<=45d):', s.ativos_45d, '| Ref: 767');
  console.log('  Em Risco (46-90d):', s.em_risco_46_90, '| Ref: 425');
  console.log('  Perdidos (>90d):', s.perdidos_90, '| Ref: 481');
  console.log('\nTotal base S:', s.total, '| Ref: 1.738');

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
