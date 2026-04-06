import { queryExternal } from './server/_core/db';

const unitId = 29;
const dataInicio = '2026-01-01';
const dataFim = '2026-04-30';
const dataInicio12m = '2025-04-30';
const hoje = '2026-04-06';
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
  // Com dataFim = 30/04/2026
  const [s] = await queryExternal<any>(`
    SELECT
      COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) <= 45 THEN bs.cliente END) as ativos,
      COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) BETWEEN 46 AND 90 THEN bs.cliente END) as em_risco,
      COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) > 90 THEN bs.cliente END) as perdidos,
      COUNT(DISTINCT CASE WHEN vh.total_visitas = 1 AND DATEDIFF('${dataFim}', bs.ultima_venda) BETWEEN 46 AND 90 THEN bs.cliente END) as os_risco,
      COUNT(DISTINCT CASE WHEN vh.total_visitas = 1 AND DATEDIFF('${dataFim}', bs.ultima_venda) > 90 THEN bs.cliente END) as os_perdido,
      COUNT(DISTINCT bs.cliente) as total
    FROM (${baseS12mSQL}) bs
    JOIN clientes c ON c.id = bs.cliente AND c.status = 1
    LEFT JOIN (
      SELECT v.cliente, COUNT(*) as total_visitas
      FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
      WHERE ${unitCondV} AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
        AND v.cliente IS NOT NULL AND v.cliente != 2
      GROUP BY v.cliente
    ) vh ON vh.cliente = bs.cliente
  `);

  console.log('\n=== REF = dataFim (30/04/2026) ===');
  console.log('Ativos (≤45d):', s.ativos, '| Ref: 767');
  console.log('Em Risco (46-90d):', s.em_risco, '| Ref: 425');
  console.log('Perdidos (>90d):', s.perdidos, '| Ref: 481');
  console.log('OS risco:', s.os_risco, '| Ref: 44');
  console.log('OS perdido:', s.os_perdido, '| Ref: 232');
  console.log('Total base S:', s.total, '| Ref: 1.738');

  // Com dataFim = hoje (06/04/2026)
  const [h] = await queryExternal<any>(`
    SELECT
      COUNT(DISTINCT CASE WHEN DATEDIFF('${hoje}', bs.ultima_venda) <= 45 THEN bs.cliente END) as ativos,
      COUNT(DISTINCT CASE WHEN DATEDIFF('${hoje}', bs.ultima_venda) BETWEEN 46 AND 90 THEN bs.cliente END) as em_risco,
      COUNT(DISTINCT CASE WHEN DATEDIFF('${hoje}', bs.ultima_venda) > 90 THEN bs.cliente END) as perdidos,
      COUNT(DISTINCT bs.cliente) as total
    FROM (${baseS12mSQL}) bs
    JOIN clientes c ON c.id = bs.cliente AND c.status = 1
  `);

  console.log('\n=== REF = hoje (06/04/2026) ===');
  console.log('Ativos (≤45d):', h.ativos, '| Ref: 767');
  console.log('Em Risco (46-90d):', h.em_risco, '| Ref: 425');
  console.log('Perdidos (>90d):', h.perdidos, '| Ref: 481');
  console.log('Total base S:', h.total, '| Ref: 1.738');

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
