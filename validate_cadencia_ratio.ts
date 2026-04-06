import { queryExternal } from './server/_core/db';

const unitId = 29;
const dataFim = '2026-04-30';
const dataInicio12m = '2025-04-30';

// Resolve external IDs for unit 29
const externalRows = await queryExternal<{ external_id: string }>(`
  SELECT external_id FROM unit_mappings WHERE internal_id = ${unitId}
`).catch(() => []);

let unitCondV = '';
if (externalRows.length > 0) {
  const ids = externalRows.map(r => `'${r.external_id}'`).join(',');
  unitCondV = `uu.unidade IN (${ids})`;
} else {
  unitCondV = `uu.unidade = ${unitId}`;
}

console.log('Unit condition:', unitCondV);

const result = await queryExternal<{
  assiduo: number; regular: number; espacando: number;
  primeira_vez: number; em_risco: number; perdido: number; total: number
}>(`
  WITH base_s AS (
    SELECT DISTINCT v.cliente
    FROM vendas v
    JOIN usuarios uu ON v.usuario = uu.id
    WHERE ${unitCondV}
      AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
      AND v.cliente IS NOT NULL AND v.cliente != 2
      AND DATE(v.data_criacao) >= '${dataInicio12m}' AND DATE(v.data_criacao) <= '${dataFim}'
  ),
  visitas_hist AS (
    SELECT
      v.cliente,
      COUNT(*) as total_visitas
    FROM vendas v
    JOIN usuarios uu ON v.usuario = uu.id
    WHERE ${unitCondV}
      AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
      AND v.cliente IS NOT NULL AND v.cliente != 2
    GROUP BY v.cliente
  ),
  intervalos AS (
    SELECT
      sub.cliente,
      AVG(sub.diff) as cadencia_habitual
    FROM (
      SELECT
        v.cliente,
        DATEDIFF(DATE(v.data_criacao), LAG(DATE(v.data_criacao)) OVER (PARTITION BY v.cliente ORDER BY v.data_criacao)) as diff
      FROM vendas v
      JOIN usuarios uu ON v.usuario = uu.id
      WHERE ${unitCondV}
        AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
        AND v.cliente IS NOT NULL AND v.cliente != 2
    ) sub
    WHERE sub.diff IS NOT NULL AND sub.diff > 0
    GROUP BY sub.cliente
  ),
  ultima_venda_ci AS (
    SELECT v.cliente, MAX(DATE(v.data_criacao)) as ultima_venda
    FROM vendas v
    JOIN usuarios uu ON v.usuario = uu.id
    WHERE ${unitCondV}
      AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
      AND v.cliente IS NOT NULL AND v.cliente != 2
    GROUP BY v.cliente
  ),
  ci AS (
    SELECT
      bs.cliente,
      COALESCE(vh.total_visitas, 0) as total_visitas,
      uvc.ultima_venda,
      DATEDIFF('${dataFim}', uvc.ultima_venda) as dias_sem_vir,
      iv.cadencia_habitual,
      CASE
        WHEN iv.cadencia_habitual IS NOT NULL AND iv.cadencia_habitual > 0
        THEN DATEDIFF('${dataFim}', uvc.ultima_venda) / iv.cadencia_habitual
        ELSE NULL
      END as ratio
    FROM base_s bs
    JOIN clientes c ON c.id = bs.cliente
    LEFT JOIN visitas_hist vh ON vh.cliente = bs.cliente
    LEFT JOIN intervalos iv ON iv.cliente = bs.cliente
    LEFT JOIN ultima_venda_ci uvc ON uvc.cliente = bs.cliente
    WHERE c.status = 1
  )
  SELECT
    COUNT(DISTINCT CASE WHEN ci.total_visitas >= 3 AND ci.ratio IS NOT NULL AND ci.ratio <= 0.8 THEN ci.cliente END) as assiduo,
    COUNT(DISTINCT CASE WHEN ci.total_visitas >= 3 AND ci.ratio IS NOT NULL AND ci.ratio > 0.8 AND ci.ratio <= 1.2 THEN ci.cliente END) as regular,
    COUNT(DISTINCT CASE WHEN ci.total_visitas >= 3 AND ci.ratio IS NOT NULL AND ci.ratio > 1.2 AND ci.ratio <= 1.8 THEN ci.cliente END) as espacando,
    COUNT(DISTINCT CASE WHEN ci.total_visitas = 1 THEN ci.cliente END) as primeira_vez,
    COUNT(DISTINCT CASE WHEN ci.total_visitas >= 3 AND ci.ratio IS NOT NULL AND ci.ratio > 1.8 AND ci.ratio <= 2.5 THEN ci.cliente END) as em_risco,
    COUNT(DISTINCT CASE WHEN ci.total_visitas >= 3 AND ci.ratio IS NOT NULL AND ci.ratio > 2.5 THEN ci.cliente END) as perdido,
    COUNT(DISTINCT ci.cliente) as total
  FROM ci
`);

const r = result[0];
console.log('\n=== Cadência Individual (Ratio) — Joinville, 12m até 30/04/2026 ===');
console.log(`Total universo: ${r.total}`);
console.log(`Assíduo (ratio ≤0.8):      ${r.assiduo}  (${Math.round(r.assiduo/r.total*100)}%)`);
console.log(`Regular (0.8-1.2):          ${r.regular}  (${Math.round(r.regular/r.total*100)}%)`);
console.log(`Espaçando (1.2-1.8):        ${r.espacando}  (${Math.round(r.espacando/r.total*100)}%)`);
console.log(`1ª Vez (1 visita):          ${r.primeira_vez}  (${Math.round(r.primeira_vez/r.total*100)}%)`);
console.log(`Em Risco (1.8-2.5):         ${r.em_risco}  (${Math.round(r.em_risco/r.total*100)}%)`);
console.log(`Perdido (>2.5):             ${r.perdido}  (${Math.round(r.perdido/r.total*100)}%)`);

console.log('\n=== Referência (prints) ===');
console.log('Total universo: 2.576');
console.log('Assíduo:   179  (7%)');
console.log('Regular:   256  (10%)');
console.log('Espaçando: 304  (12%)');
console.log('1ª Vez:    43   (2%)');
console.log('Em Risco:  240  (9%)');
console.log('Perdido:   1.554 (60%)');
