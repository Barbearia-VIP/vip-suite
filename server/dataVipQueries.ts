/**
 * dataVipQueries.ts
 * Queries do módulo Data VIP usando o banco externo (franquia_producao).
 * Todas as funções recebem externalUnitIds[] (IDs no banco externo).
 */

import { queryExternal } from "./db-external";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ExtUnit {
  internalId: number;
  externalId: number;
}

// ─── Helper: monta cláusula WHERE de unidades ─────────────────────────────────

function unitWhereClause(extIds: number[]): string {
  if (extIds.length === 0) return "1=1"; // sem filtro = todas as unidades
  if (extIds.length === 1) return `u.unidade = ${extIds[0]}`;
  return `u.unidade IN (${extIds.join(",")})`;
}

function unitWhereVendas(extIds: number[]): string {
  if (extIds.length === 0) return "1=1";
  if (extIds.length === 1) return `uu.unidade = ${extIds[0]}`;
  return `uu.unidade IN (${extIds.join(",")})`;
}

// ─── Helper: busca IDs dos colaboradores de uma unidade ─────────────────────────────────────────────
/**
 * Retorna os IDs de todos os colaboradores (usuarios) da(s) unidade(s).
 * Usar como filtro primário nas queries: vp.colaborador IN (...) ou v.usuario IN (...)
 * Isso evita JOIN com usuarios em tabelas de 2-3M de linhas, reduzindo a leitura
 * de todo o banco para apenas ~50k linhas da unidade solicitada.
 */
export async function getColaboradoresIds(extIds: number[]): Promise<number[]> {
  if (extIds.length === 0) return []; // sem filtro = todas as unidades, não otimiza
  const cond = extIds.length === 1
    ? `unidade = ${extIds[0]}`
    : `unidade IN (${extIds.join(",")})`;
  const rows = await queryExternal<{ id: number }>(
    `SELECT id FROM usuarios WHERE ${cond} AND status = 1`,
    []
  );
  return rows.map(r => Number(r.id));
}

/** Monta cláusula IN para colaboradores em vendas_produtos. Se lista vazia, retorna condição falsa. */
function colabInCond(colabIds: number[], alias = "vp"): string {
  if (colabIds.length === 0) return "1=0";
  if (colabIds.length === 1) return `${alias}.colaborador = ${colabIds[0]}`;
  return `${alias}.colaborador IN (${colabIds.join(",")})`;
}

/** Monta cláusula IN para usuario em vendas. */
function usuarioInCond(colabIds: number[], alias = "v"): string {
  if (colabIds.length === 0) return "1=0";
  if (colabIds.length === 1) return `${alias}.usuario = ${colabIds[0]}`;
  return `${alias}.usuario IN (${colabIds.join(",")})`;
}

// ─── Dashboard KPIs (híbrido: tempo real para mês atual, dashboard_faturamento para anteriores) ─────

/** Busca KPIs diretamente da tabela vendas (tempo real, sem atraso de 1 dia) */
async function getKpisRealtime(extIds: number[], ano: number, mes: number) {
  const dataInicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const proximoMes = mes === 12 ? 1 : mes + 1;
  const anoProximo = mes === 12 ? ano + 1 : ano;
  const dataFim = `${anoProximo}-${String(proximoMes).padStart(2, '0')}-01`;

  // Busca IDs dos colaboradores da unidade uma única vez
  const colabIds = await getColaboradoresIds(extIds);
  if (colabIds.length === 0 && extIds.length > 0) {
    return { total_vendas: 0, quantidade_vendas: 0, ticket_medio_por_venda: 0, total_clientes_novos: 0, total_clientes_antigos: 0, total_clientes_unicos: 0, total_servicos_realizados: 0, total_servicos_base: 0, total_servicos_extra: 0, total_valor_extra: 0, total_produtos_vendidos: 0 };
  }
  const vpCond = colabIds.length > 0 ? colabInCond(colabIds, "vp") : "1=1";
  const vCond  = colabIds.length > 0 ? usuarioInCond(colabIds, "v") : "1=1";
  const v2Cond = colabIds.length > 0 ? usuarioInCond(colabIds, "v2") : "1=1";

  // Faturamento e atendimentos via vendas_produtos filtrado por colaborador
  const rows = await queryExternal<{
    total_vendas: number;
    quantidade_vendas: number;
    total_clientes_unicos: number;
  }>(`
    SELECT 
      COALESCE(SUM(vp.valor_total), 0) as total_vendas,
      COUNT(DISTINCT v.id) as quantidade_vendas,
      COUNT(DISTINCT v.cliente) as total_clientes_unicos
    FROM vendas_produtos vp
    JOIN vendas v ON v.id = vp.venda
    WHERE ${vpCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
  `, [dataInicio, dataFim]);

  // Clientes novos = primeira visita nesta unidade no período
  const novosRows = await queryExternal<{ novos: number }>(`
    SELECT COUNT(DISTINCT v.cliente) as novos
    FROM vendas v
    WHERE ${vCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
      AND v.cliente IS NOT NULL
      AND v.cliente NOT IN (
        SELECT DISTINCT v2.cliente
        FROM vendas v2
        WHERE ${v2Cond}
          AND v2.data_criacao < ?
          AND v2.comanda_temp = 0
          AND v2.status = 1
          AND v2.cliente IS NOT NULL
      )
  `, [dataInicio, dataFim, dataInicio]);

  // Serviços: total, base, extra, produtos
  const servicosRows = await queryExternal<{
    total_servicos_realizados: number;
    total_servicos_base: number;
    total_servicos_extra: number;
    total_valor_extra: number;
    total_produtos_vendidos: number;
  }>(`
    SELECT 
      COUNT(CASE WHEN p.tipo = 'ser' THEN 1 END) as total_servicos_realizados,
      COUNT(CASE WHEN p.tipo = 'ser' AND p.categoria = 'base' THEN 1 END) as total_servicos_base,
      COUNT(CASE WHEN p.tipo = 'ser' AND (p.categoria = 'extra' OR p.categoria IS NULL) THEN 1 END) as total_servicos_extra,
      COALESCE(SUM(CASE WHEN p.tipo = 'ser' AND (p.categoria = 'extra' OR p.categoria IS NULL) THEN vp.valor_total END), 0) as total_valor_extra,
      COUNT(CASE WHEN p.tipo IN ('probar','proemp','proins') THEN 1 END) as total_produtos_vendidos
    FROM vendas_produtos vp
    JOIN vendas v ON vp.venda = v.id
    JOIN produtos p ON p.id = vp.produto
    WHERE ${vpCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
  `, [dataInicio, dataFim]);

  const totalClientes = Number(rows[0]?.total_clientes_unicos ?? 0);
  const novos = Number(novosRows[0]?.novos ?? 0);
  return {
    total_vendas: rows[0]?.total_vendas ?? 0,
    quantidade_vendas: rows[0]?.quantidade_vendas ?? 0,
    ticket_medio_por_venda: rows[0]?.quantidade_vendas > 0
      ? Number(rows[0]?.total_vendas ?? 0) / Number(rows[0]?.quantidade_vendas)
      : 0,
    total_clientes_novos: novos,
    total_clientes_antigos: Math.max(0, totalClientes - novos),
    total_clientes_unicos: totalClientes,
    ...(servicosRows[0] ?? {}),
  };
}

/** Busca KPIs por range de datas livre (tempo real, tabela vendas) */
export async function getKpisRealtimeByRange(
  extIds: number[],
  dataInicio: string,
  dataFim: string,
  colaboradorId?: number
) {
  // dataFim é inclusivo: adicionar 1 dia para usar < no WHERE
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);

  // Busca IDs dos colaboradores da unidade uma única vez
  const colabIds = await getColaboradoresIds(extIds);
  if (colabIds.length === 0 && extIds.length > 0) {
    return { faturamento: 0, faturamentoAnterior: 0, crescimentoFat: 0, atendimentos: 0, atendimentosAnterior: 0, crescimentoAtend: 0, ticketMedio: 0, clientesNovos: 0, clientesAntigos: 0, totalClientes: 0, servicosBase: 0, servicosExtra: 0, servicosExtraTotal: 0, servicosTotal: 0, produtosVendidos: 0, isMesAtual: false };
  }
  // Se colaboradorId fornecido, filtra apenas ele; senão usa todos da unidade
  const filtroIds = colaboradorId ? [colaboradorId] : colabIds;
  const vpCond = filtroIds.length > 0 ? colabInCond(filtroIds, "vp") : "1=1";
  const vCond  = filtroIds.length > 0 ? usuarioInCond(filtroIds, "v") : "1=1";
  const v2Cond = filtroIds.length > 0 ? usuarioInCond(filtroIds, "v2") : "1=1";

  // Faturamento e atendimentos via vendas_produtos filtrado por colaborador
  const rows = await queryExternal<{
    total_vendas: number;
    quantidade_vendas: number;
    total_clientes_unicos: number;
  }>(`
    SELECT 
      COALESCE(SUM(vp.valor_total), 0) as total_vendas,
      COUNT(DISTINCT v.id) as quantidade_vendas,
      COUNT(DISTINCT v.cliente) as total_clientes_unicos
    FROM vendas_produtos vp
    JOIN vendas v ON v.id = vp.venda
    WHERE ${vpCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
  `, [dataInicio, dataFimExcl]);

  // Clientes novos = primeira visita nesta unidade no período
  const novosRows = await queryExternal<{ novos: number }>(`
    SELECT COUNT(DISTINCT v.cliente) as novos
    FROM vendas v
    WHERE ${vCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
      AND v.cliente IS NOT NULL
      AND v.cliente NOT IN (
        SELECT DISTINCT v2.cliente
        FROM vendas v2
        WHERE ${v2Cond}
          AND v2.data_criacao < ?
          AND v2.comanda_temp = 0
          AND v2.status = 1
          AND v2.cliente IS NOT NULL
      )
  `, [dataInicio, dataFimExcl, dataInicio]);

  // Serviços: total, base, extra, produtos
  const servicosRows = await queryExternal<{
    total_servicos_realizados: number;
    total_servicos_base: number;
    total_servicos_extra: number;
    total_valor_extra: number;
    total_produtos_vendidos: number;
  }>(`
    SELECT 
      COUNT(CASE WHEN p.tipo = 'ser' THEN 1 END) as total_servicos_realizados,
      COUNT(CASE WHEN p.tipo = 'ser' AND p.categoria = 'base' THEN 1 END) as total_servicos_base,
      COUNT(CASE WHEN p.tipo = 'ser' AND (p.categoria = 'extra' OR p.categoria IS NULL) THEN 1 END) as total_servicos_extra,
      COALESCE(SUM(CASE WHEN p.tipo = 'ser' AND (p.categoria = 'extra' OR p.categoria IS NULL) THEN vp.valor_total END), 0) as total_valor_extra,
      COUNT(CASE WHEN p.tipo IN ('probar','proemp','proins') THEN 1 END) as total_produtos_vendidos
    FROM vendas_produtos vp
    JOIN vendas v ON vp.venda = v.id
    JOIN produtos p ON p.id = vp.produto
    WHERE ${vpCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
  `, [dataInicio, dataFimExcl]);

  const fat = Number(rows[0]?.total_vendas ?? 0);
  const atend = Number(rows[0]?.quantidade_vendas ?? 0);
  const totalClientes = Number(rows[0]?.total_clientes_unicos ?? 0);
  const novos = Number(novosRows[0]?.novos ?? 0);
  return {
    faturamento: fat,
    faturamentoAnterior: 0,
    crescimentoFat: 0,
    atendimentos: atend,
    atendimentosAnterior: 0,
    crescimentoAtend: 0,
    ticketMedio: atend > 0 ? fat / atend : 0,
    clientesNovos: novos,
    clientesAntigos: Math.max(0, totalClientes - novos),
    totalClientes,
    servicosBase: Number(servicosRows[0]?.total_servicos_base ?? 0),
    servicosExtra: Number(servicosRows[0]?.total_servicos_extra ?? 0),
    servicosExtraTotal: Number(servicosRows[0]?.total_valor_extra ?? 0),
    servicosTotal: Number(servicosRows[0]?.total_servicos_realizados ?? 0),
    produtosVendidos: Number(servicosRows[0]?.total_produtos_vendidos ?? 0),
    isMesAtual: false,
  };
}

export async function getDashboardKpis(extIds: number[], ano: number, mes: number) {
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `unidade = ${extIds[0]}`
    : `unidade IN (${extIds.join(",")})`;

  // Verificar se é o mês atual — usar dados em tempo real para evitar atraso de 1 dia
  const agora = new Date();
  const anoAtual = agora.getFullYear();
  const mesAtual = agora.getMonth() + 1;
  const isMesAtual = ano === anoAtual && mes === mesAtual;

  // Sempre busca em tempo real da tabela vendas (via vp.valor_total) para garantir precisão
  const dataInicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const proximoMes = mes === 12 ? 1 : mes + 1;
  const anoProximo = mes === 12 ? ano + 1 : ano;
  const dataFim = `${anoProximo}-${String(proximoMes).padStart(2, '0')}-01`;
  // getKpisRealtime já usa a lógica correta (vp.valor_total, categoria='extra')
  const cur = (await getKpisRealtime(extIds, ano, mes)) as Record<string, number>;

  // Mês anterior para comparação: também busca em tempo real
  const mesAnt = mes === 1 ? 12 : mes - 1;
  const anoAnt = mes === 1 ? ano - 1 : ano;
  const antData = await getKpisRealtime(extIds, anoAnt, mesAnt) as Record<string, number>;

  const fat = Number(cur.total_vendas ?? 0);
  const fatAnt = Number(antData.total_vendas ?? 0);
  const atend = Number(cur.quantidade_vendas ?? 0);
  const atendAnt = Number(antData.quantidade_vendas ?? 0);
  const totalClientes = Number(cur.total_clientes_unicos ?? 0);
  const novos = Number(cur.total_clientes_novos ?? 0);

  return {
    faturamento: fat,
    faturamentoAnterior: fatAnt,
    crescimentoFat: fatAnt > 0 ? ((fat - fatAnt) / fatAnt) * 100 : 0,
    atendimentos: atend,
    atendimentosAnterior: atendAnt,
    crescimentoAtend: atendAnt > 0 ? ((atend - atendAnt) / atendAnt) * 100 : 0,
    ticketMedio: atend > 0 ? fat / atend : 0,
    clientesNovos: novos,
    clientesAntigos: Math.max(0, totalClientes - novos),
    totalClientes,
    servicosBase: Number(cur.total_servicos_base ?? 0),
    servicosExtra: Number(cur.total_servicos_extra ?? 0),
    servicosExtraTotal: Number(cur.total_valor_extra ?? 0),
    servicosTotal: Number(cur.total_servicos_realizados ?? 0),
    produtosVendidos: Number(cur.total_produtos_vendidos ?? 0),
    isMesAtual,
  };
}

// ─── Dias trabalhados e faturamento por dia ──────────────────────────────────

/**
 * Conta quantos dias distintos tiveram faturamento > 0 no período.
 * Também retorna o total faturado para calcular fat/dia.
 */
export async function getDiasTrabalhados(
  extIds: number[],
  dataInicio: string,
  dataFim: string // exclusivo
): Promise<{ diasTrabalhados: number; faturamentoTotal: number }> {
  const colabIds = await getColaboradoresIds(extIds);
  const vpCond = colabIds.length > 0 ? colabInCond(colabIds, "vp") : "1=1";

  const rows = await queryExternal<{ dias: number; total: number }>(`
    SELECT 
      COUNT(DISTINCT DATE(v.data_criacao)) as dias,
      COALESCE(SUM(vp.valor_total), 0) as total
    FROM vendas_produtos vp
    JOIN vendas v ON v.id = vp.venda
    WHERE ${vpCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
  `, [dataInicio, dataFim]);

  return {
    diasTrabalhados: Number(rows[0]?.dias ?? 0),
    faturamentoTotal: Number(rows[0]?.total ?? 0),
  };
}

/**
 * Calcula a média de dias trabalhados por mês num período de vários meses.
 * Agrupa por mês e conta dias únicos com venda em cada mês, depois tira a média.
 * Mais preciso que contar dias totais e dividir pelo número de meses.
 */
export async function getDiasTrabalhadosMedia(
  extIds: number[],
  dataInicio: string,
  dataFim: string // exclusivo
): Promise<{ mediaDias: number }> {
  const colabIds = await getColaboradoresIds(extIds);
  const vCond = colabIds.length > 0 ? usuarioInCond(colabIds, "v") : "1=1";

  const rows = await queryExternal<{ mes: string; dias: number }>(`
    SELECT 
      DATE_FORMAT(v.data_criacao, '%Y-%m') as mes,
      COUNT(DISTINCT DATE(v.data_criacao)) as dias
    FROM vendas v
    WHERE ${vCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
    GROUP BY DATE_FORMAT(v.data_criacao, '%Y-%m')
  `, [dataInicio, dataFim]);

  if (rows.length === 0) return { mediaDias: 0 };
  const totalDias = rows.reduce((s, r) => s + Number(r.dias), 0);
  return { mediaDias: Math.round((totalDias / rows.length) * 10) / 10 };
}

/**
 * Conta serviços extra e soma seu valor total.
 * Serviços extra = tipo='ser' E (categoria='extra' OU categoria IS NULL).
 * A categoria vem do banco externo (tabela produtos.categoria).
 * Opcionalmente, a lista nomesBase pode sobrescrever a lógica para unidades sem categoria configurada.
 */
export async function getServicosExtra(
  extIds: number[],
  dataInicio: string,
  dataFim: string, // exclusivo
  nomesBase: string[] = []
): Promise<{ qtdExtra: number; totalExtra: number }> {
  const colabIds = await getColaboradoresIds(extIds);
  const vpCond = colabIds.length > 0 ? colabInCond(colabIds, "vp") : "1=1";

  let extraCond: string;
  if (nomesBase.length > 0) {
    const placeholders = nomesBase.map(() => "?").join(",");
    extraCond = `p.tipo = 'ser' AND p.nome NOT IN (${placeholders})`;
  } else {
    extraCond = `p.tipo = 'ser' AND (p.categoria = 'extra' OR p.categoria IS NULL)`;
  }

  const params: unknown[] = [...(nomesBase.length > 0 ? nomesBase : []), dataInicio, dataFim];

  const rows = await queryExternal<{ qtd: number; total: number }>(`
    SELECT 
      COUNT(*) as qtd,
      COALESCE(SUM(vp.valor_total), 0) as total
    FROM vendas_produtos vp
    JOIN vendas v ON vp.venda = v.id
    JOIN produtos p ON p.id = vp.produto
    WHERE ${vpCond}
      AND ${extraCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
  `, params);

  return {
    qtdExtra: Number(rows[0]?.qtd ?? 0),
    totalExtra: Number(rows[0]?.total ?? 0),
  };
}

// ─── Faturamento mensal histórico (híbrido: tempo real para mês atual) ────────────────

export async function getFaturamentoMensal(extIds: number[], meses: number = 12) {
  const unitCondDf = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `unidade = ${extIds[0]}`
    : `unidade IN (${extIds.join(",")})`;
   // Meses anteriores: usa dashboard_faturamento (já consolidada)
  // Busca meses-1 para deixar espaço para o mês atual em tempo real
  const agora = new Date();
  const anoAtual = agora.getFullYear();
  const mesAtual = agora.getMonth() + 1;

  const historico = await queryExternal<{
    ano: number;
    mes: number;
    total_vendas: number;
    quantidade_vendas: number;
    ticket_medio_por_venda: number;
    total_clientes_novos: number;
    total_clientes_antigos: number;
  }>(`
    SELECT 
      ano, mes,
      COALESCE(SUM(total_vendas), 0) as total_vendas,
      COALESCE(SUM(quantidade_vendas), 0) as quantidade_vendas,
      COALESCE(AVG(ticket_medio_por_venda), 0) as ticket_medio_por_venda,
      COALESCE(SUM(total_clientes_novos), 0) as total_clientes_novos,
      COALESCE(SUM(total_clientes_antigos), 0) as total_clientes_antigos
    FROM dashboard_faturamento
    WHERE ${unitCondDf}
      AND total_vendas > 0
      AND NOT (ano = ${anoAtual} AND mes = ${mesAtual})
    GROUP BY ano, mes
    ORDER BY ano DESC, mes DESC
    LIMIT ${Number(meses) - 1}
  `, []);

  // Mês atual: busca em tempo real da tabela vendas
  const dataInicio = `${anoAtual}-${String(mesAtual).padStart(2, '0')}-01`;
  const proximoMes = mesAtual === 12 ? 1 : mesAtual + 1;
  const anoProximo = mesAtual === 12 ? anoAtual + 1 : anoAtual;
  const dataFim = `${anoProximo}-${String(proximoMes).padStart(2, '0')}-01`;

  const colabIds = await getColaboradoresIds(extIds);
  const vCond = colabIds.length > 0 ? usuarioInCond(colabIds, "v") : "1=1";
  const realtimeRows = await queryExternal<{
    total_vendas: number;
    quantidade_vendas: number;
    ticket_medio_por_venda: number;
    total_clientes_novos: number;
    total_clientes_antigos: number;
  }>(`
    SELECT 
      COALESCE(SUM(v.valor_total), 0) as total_vendas,
      COUNT(DISTINCT v.id) as quantidade_vendas,
      COALESCE(AVG(v.valor_total), 0) as ticket_medio_por_venda,
      COUNT(DISTINCT CASE WHEN c.data_criacao >= ? THEN v.cliente END) as total_clientes_novos,
      COUNT(DISTINCT CASE WHEN c.data_criacao < ? OR c.data_criacao IS NULL THEN v.cliente END) as total_clientes_antigos
    FROM vendas v
    LEFT JOIN clientes c ON c.id = v.cliente
    WHERE ${vCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.cancelado_motivo IS NULL
      AND v.status = 1
  `, [dataInicio, dataInicio, dataInicio, dataFim]);

  const rt = realtimeRows[0];
  const mesAtualRow = {
    ano: anoAtual,
    mes: mesAtual,
    total_vendas: Number(rt?.total_vendas ?? 0),
    quantidade_vendas: Number(rt?.quantidade_vendas ?? 0),
    ticket_medio_por_venda: Number(rt?.ticket_medio_por_venda ?? 0),
    total_clientes_novos: Number(rt?.total_clientes_novos ?? 0),
    total_clientes_antigos: Number(rt?.total_clientes_antigos ?? 0),
  };

  // Retorna mês atual primeiro (mais recente), seguido do histórico
  return [mesAtualRow, ...historico];
}

// ─── Faturamento mensal detalhado (com extras, serviços, produtos) ──────────────

export async function getFaturamentoMensalDetalhado(extIds: number[], meses: number = 12) {
  const agora = new Date();
  const anoAtual = agora.getFullYear();
  const mesAtual = agora.getMonth() + 1;

  const dataInicio = new Date(anoAtual, mesAtual - meses, 1);
  const dataInicioStr = `${dataInicio.getFullYear()}-${String(dataInicio.getMonth() + 1).padStart(2, '0')}-01`;
  const proximoMes = mesAtual === 12 ? 1 : mesAtual + 1;
  const anoProximo = mesAtual === 12 ? anoAtual + 1 : anoAtual;
  const dataFimStr = `${anoProximo}-${String(proximoMes).padStart(2, '0')}-01`;

  const colabIds = await getColaboradoresIds(extIds);
  const vpCond = colabIds.length > 0 ? colabInCond(colabIds, "vp") : "1=1";

  const rows = await queryExternal<{
    ano: number;
    mes: number;
    faturamento: number;
    atendimentos: number;
    ticket_medio: number;
    clientes: number;
    clientes_novos: number;
    extras_qtd: number;
    extras_valor: number;
    servicos_total: number;
    produtos_qtd: number;
    produtos_valor: number;
  }>(`
    SELECT
      YEAR(v.data_criacao) as ano,
      MONTH(v.data_criacao) as mes,
      COALESCE(SUM(vp.valor_total), 0) as faturamento,
      COUNT(DISTINCT v.id) as atendimentos,
      COALESCE(SUM(vp.valor_total) / NULLIF(COUNT(DISTINCT v.id), 0), 0) as ticket_medio,
      COUNT(DISTINCT v.cliente) as clientes,
      COUNT(DISTINCT CASE WHEN cl.data_criacao >= DATE_FORMAT(v.data_criacao, '%Y-%m-01') THEN v.cliente END) as clientes_novos,
      COUNT(CASE WHEN p.tipo = 'ser' AND (p.categoria = 'extra' OR p.categoria IS NULL OR p.categoria != 'base') AND p.categoria != 'base' THEN 1 END) as extras_qtd,
      COALESCE(SUM(CASE WHEN p.tipo = 'ser' AND p.categoria != 'base' AND p.categoria IS NOT NULL THEN vp.valor_total ELSE 0 END), 0) as extras_valor,
      COUNT(CASE WHEN p.tipo = 'ser' THEN 1 END) as servicos_total,
      COUNT(CASE WHEN p.tipo IN ('probar','proemp','proins') THEN 1 END) as produtos_qtd,
      COALESCE(SUM(CASE WHEN p.tipo IN ('probar','proemp','proins') THEN vp.valor_total ELSE 0 END), 0) as produtos_valor
    FROM vendas_produtos vp
    JOIN vendas v ON v.id = vp.venda
    JOIN produtos p ON p.id = vp.produto
    LEFT JOIN clientes cl ON cl.id = v.cliente
    WHERE ${vpCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.cancelado_motivo IS NULL
      AND v.status = 1
    GROUP BY YEAR(v.data_criacao), MONTH(v.data_criacao)
    ORDER BY ano DESC, mes DESC
    LIMIT ${Number(meses)}
  `, [dataInicioStr, dataFimStr]);

  return rows.map(r => ({
    periodo: `${r.ano}-${String(Number(r.mes)).padStart(2, '0')}`,
    faturamento: Number(r.faturamento),
    atendimentos: Number(r.atendimentos),
    ticketMedio: Number(r.ticket_medio),
    clientes: Number(r.clientes),
    clientesNovos: Number(r.clientes_novos),
    extrasQtd: Number(r.extras_qtd),
    extrasValor: Number(r.extras_valor),
    servicosTotal: Number(r.servicos_total),
    produtosQtd: Number(r.produtos_qtd),
    produtosValor: Number(r.produtos_valor),
  }));
}

// ─── Faturamento mensal detalhado com filtros (data, colaborador, tipo) ──────

export async function getFaturamentoMensalDetalhadoFiltrado(
  extIds: number[],
  dataInicioStr: string,
  dataFimStr: string,
  colaboradorId?: number,
  tipo?: string // 'colaborador' | 'caixa' | undefined = todos
) {
  const colabIds = await getColaboradoresIds(extIds);
  const filtroIds = colaboradorId ? [colaboradorId] : colabIds;
  const vpCond = filtroIds.length > 0 ? colabInCond(filtroIds, "vp") : "1=1";

  const rows = await queryExternal<{
    ano: number;
    mes: number;
    faturamento: number;
    atendimentos: number;
    ticket_medio: number;
    clientes: number;
    clientes_novos: number;
    extras_qtd: number;
    extras_valor: number;
    servicos_total: number;
    produtos_qtd: number;
    produtos_valor: number;
  }>(`
    SELECT
      YEAR(v.data_criacao) as ano,
      MONTH(v.data_criacao) as mes,
      COALESCE(SUM(vp.valor_total), 0) as faturamento,
      COUNT(DISTINCT v.id) as atendimentos,
      COALESCE(SUM(vp.valor_total) / NULLIF(COUNT(DISTINCT v.id), 0), 0) as ticket_medio,
      COUNT(DISTINCT v.cliente) as clientes,
      COUNT(DISTINCT CASE WHEN cl.data_criacao >= DATE_FORMAT(v.data_criacao, '%Y-%m-01') THEN v.cliente END) as clientes_novos,
      COUNT(CASE WHEN p.tipo = 'ser' AND p.categoria != 'base' THEN 1 END) as extras_qtd,
      COALESCE(SUM(CASE WHEN p.tipo = 'ser' AND p.categoria != 'base' AND p.categoria IS NOT NULL THEN vp.valor_total ELSE 0 END), 0) as extras_valor,
      COUNT(CASE WHEN p.tipo = 'ser' THEN 1 END) as servicos_total,
      COUNT(CASE WHEN p.tipo IN ('probar','proemp','proins') THEN 1 END) as produtos_qtd,
      COALESCE(SUM(CASE WHEN p.tipo IN ('probar','proemp','proins') THEN vp.valor_total ELSE 0 END), 0) as produtos_valor
    FROM vendas_produtos vp
    JOIN vendas v ON v.id = vp.venda
    JOIN produtos p ON p.id = vp.produto
    LEFT JOIN clientes cl ON cl.id = v.cliente
    WHERE ${vpCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.cancelado_motivo IS NULL
      AND v.status = 1
    GROUP BY YEAR(v.data_criacao), MONTH(v.data_criacao)
    ORDER BY ano ASC, mes ASC
  `, [dataInicioStr, dataFimStr]);

  return rows.map(r => ({
    periodo: `${r.ano}-${String(Number(r.mes)).padStart(2, '0')}`,
    faturamento: Number(r.faturamento),
    atendimentos: Number(r.atendimentos),
    ticketMedio: Number(r.ticket_medio),
    clientes: Number(r.clientes),
    clientesNovos: Number(r.clientes_novos),
    extrasQtd: Number(r.extras_qtd),
    extrasValor: Number(r.extras_valor),
    servicosTotal: Number(r.servicos_total),
    produtosQtd: Number(r.produtos_qtd),
    produtosValor: Number(r.produtos_valor),
  }));
}

// ─── Lista colaboradores para filtro mensal ──────────────────────────────────

export async function getListaColaboradoresMensal(
  extIds: number[],
  dataInicio?: string,
  dataFim?: string
) {
  const colabIds = await getColaboradoresIds(extIds);
  const vpCond = colabIds.length > 0 ? colabInCond(colabIds, "vp") : "1=1";

  const periodoCond = (dataInicio && dataFim)
    ? `AND v.data_criacao >= ? AND v.data_criacao < ?`
    : "";
  const params: string[] = (dataInicio && dataFim) ? [dataInicio, dataFim] : [];

  return queryExternal<{
    colaborador_id: number;
    colaborador_nome: string;
    tipo: string;
  }>(`
    SELECT DISTINCT
      uu.id as colaborador_id,
      uu.nome as colaborador_nome,
      'colaborador' as tipo
    FROM vendas_produtos vp
    JOIN usuarios uu ON uu.id = vp.colaborador
    JOIN vendas v ON v.id = vp.venda
    WHERE ${vpCond}
      AND v.comanda_temp = 0
      AND v.status = 1
      AND v.cancelado_motivo IS NULL
      AND uu.nome IS NOT NULL
      AND uu.nome != ''
      ${periodoCond}
    ORDER BY uu.nome ASC
  `, params);
}

// ─── Faturamento por forma de pagamento ──────────────────────────────────────

export async function getFaturamentoPorPagamento(extIds: number[], dataInicio: string, dataFim: string) {
  const colabIds = await getColaboradoresIds(extIds);
  const vCond = colabIds.length > 0 ? usuarioInCond(colabIds, "v") : "1=1";

  return queryExternal<{
    forma: string;
    tipo: string;
    total: number;
    qtd_vendas: number;
  }>(`
    SELECT 
      fp.nome as forma,
      fp.tipo,
      COALESCE(SUM(vpag.valor), 0) as total,
      COUNT(DISTINCT v.id) as qtd_vendas
    FROM vendas v
    JOIN vendas_pagamentos vpag ON vpag.venda = v.id
    JOIN formas_pagamentos fp ON fp.id = vpag.forma_pagamento
    WHERE ${vCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < DATE_ADD(?, INTERVAL 1 DAY)
      AND v.comanda_temp = 0
      AND v.cancelado_motivo IS NULL
      AND v.status = 1
    GROUP BY fp.id, fp.nome, fp.tipo
    ORDER BY total DESC
  `, [dataInicio, dataFim]);
}

// ─── Faturamento diário ───────────────────────────────────────────────────────

export async function getEvolucaoDiaria(
  extIds: number[],
  dataInicio: string,
  dataFimIncl: string // inclusivo
) {
  const dataFimExcl = new Date(new Date(dataFimIncl + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const colabIds = await getColaboradoresIds(extIds);
  const vpCond = colabIds.length > 0 ? colabInCond(colabIds, "vp") : "1=1";
  const v2Cond = colabIds.length > 0 ? usuarioInCond(colabIds, "v2") : "1=1";

  return queryExternal<{
    dia: string;
    faturamento: number;
    atendimentos: number;
    clientes: number;
    clientes_novos: number;
    ticket_medio: number;
    servicos: number;
    produtos: number;
    extra_qtd: number;
    extra_valor: number;
  }>(`
    SELECT 
      DATE_FORMAT(v.data_criacao, '%Y-%m-%d') as dia,
      COALESCE(SUM(vp.valor_total), 0) as faturamento,
      COUNT(DISTINCT v.id) as atendimentos,
      COUNT(DISTINCT v.cliente) as clientes,
      COUNT(DISTINCT CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM vendas v2
          WHERE v2.cliente = v.cliente
            AND ${v2Cond}
            AND v2.data_criacao < DATE(v.data_criacao)
            AND v2.comanda_temp = 0
            AND v2.status = 1
        ) THEN v.cliente
      END) as clientes_novos,
      COALESCE(SUM(vp.valor_total) / NULLIF(COUNT(DISTINCT v.id), 0), 0) as ticket_medio,
      COUNT(CASE WHEN p.tipo = 'ser' THEN 1 END) as servicos,
      COUNT(CASE WHEN p.tipo IN ('probar','proemp','proins') THEN 1 END) as produtos,
      COUNT(CASE WHEN p.tipo = 'ser' AND (p.categoria = 'extra' OR p.categoria IS NULL) THEN 1 END) as extra_qtd,
      COALESCE(SUM(CASE WHEN p.tipo = 'ser' AND (p.categoria = 'extra' OR p.categoria IS NULL) THEN vp.valor_total END), 0) as extra_valor
    FROM vendas_produtos vp
    JOIN vendas v ON v.id = vp.venda
    JOIN produtos p ON p.id = vp.produto
    WHERE ${vpCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
    GROUP BY DATE_FORMAT(v.data_criacao, '%Y-%m-%d')
    ORDER BY dia ASC
  `, [dataInicio, dataFimExcl]);
}

/** @deprecated use getEvolucaoDiaria */
export async function getFaturamentoDiario(extIds: number[], dataInicio: string, dataFim: string) {
  const colabIds = await getColaboradoresIds(extIds);
  const vpCond = colabIds.length > 0 ? colabInCond(colabIds, "vp") : "1=1";

  return queryExternal<{
    dia: string;
    faturamento: number;
    atendimentos: number;
    clientes: number;
  }>(`
    SELECT 
      DATE_FORMAT(v.data_criacao, '%Y-%m-%d') as dia,
      COALESCE(SUM(vp.valor_total), 0) as faturamento,
      COUNT(DISTINCT v.id) as atendimentos,
      COUNT(DISTINCT v.cliente) as clientes
    FROM vendas_produtos vp
    JOIN vendas v ON v.id = vp.venda
    WHERE ${vpCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < DATE_ADD(?, INTERVAL 1 DAY)
      AND v.comanda_temp = 0
      AND v.status = 1
    GROUP BY DATE_FORMAT(v.data_criacao, '%Y-%m-%d')
    ORDER BY dia ASC
  `, [dataInicio, dataFim]);
}

// ─── Faturamento por produto/serviço ─────────────────────────────────────────

export async function getFaturamentoPorProduto(extIds: number[], dataInicio: string, dataFim: string) {
  const colabIds = await getColaboradoresIds(extIds);
  const vpCond = colabIds.length > 0 ? colabInCond(colabIds, "vp") : "1=1";

  return queryExternal<{
    produto_id: number;
    produto_nome: string;
    tipo: string;
    quantidade: number;
    total: number;
  }>(`
    SELECT 
      MIN(p.id) as produto_id,
      MIN(p.nome) as produto_nome,
      MIN(p.tipo) as tipo,
      SUM(vp.quantidade) as quantidade,
      COALESCE(SUM(vp.valor_total), 0) as total
    FROM vendas_produtos vp
    JOIN vendas v ON v.id = vp.venda
    JOIN produtos p ON p.id = vp.produto
    WHERE ${vpCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < DATE_ADD(?, INTERVAL 1 DAY)
      AND v.comanda_temp = 0
      AND v.cancelado_motivo IS NULL
      AND v.status = 1
    GROUP BY LOWER(TRIM(p.nome)), p.tipo
    ORDER BY total DESC
    LIMIT 50
  `, [dataInicio, dataFim]);
}

// ─── Colaboradores (usa dashboard_colaboradores pré-calculado) ────────────────

export async function getColaboradores(extIds: number[], ano: number, mes: number) {
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `dc.unidade = ${extIds[0]}`
    : `dc.unidade IN (${extIds.join(",")})`;

  return queryExternal<{
    colaborador_id: number;
    colaborador_nome: string;
    unidade_id: number;
    total_vendas: number;
    total_servicos_realizados: number;
    total_clientes_novos: number;
    total_clientes_antigos: number;
    total_clientes_geral: number;
    media_consumo_cliente: number;
    fidelizacao: number;
    nps: number;
    total_produtos_vendidos: number;
    total_produtos_vendidos_reais: number;
    media_servicos_cliente: number;
    media_itens_cliente: number;
    estrela: number;
  }>(`
    SELECT 
      dc.colaborador as colaborador_id,
      u.nome as colaborador_nome,
      dc.unidade as unidade_id,
      COALESCE(dc.total_vendas, 0) as total_vendas,
      COALESCE(dc.total_servicos_realizados, 0) as total_servicos_realizados,
      COALESCE(dc.total_clientes_novos, 0) as total_clientes_novos,
      COALESCE(dc.total_clientes_antigos, 0) as total_clientes_antigos,
      COALESCE(dc.total_clientes_geral, 0) as total_clientes_geral,
      COALESCE(dc.media_consumo_cliente, 0) as media_consumo_cliente,
      COALESCE(dc.fidelizacao, 0) as fidelizacao,
      COALESCE(dc.nps, 0) as nps,
      COALESCE(dc.total_produtos_vendidos, 0) as total_produtos_vendidos,
      COALESCE(dc.total_produtos_vendidos_reais, 0) as total_produtos_vendidos_reais,
      COALESCE(dc.media_servicos_cliente, 0) as media_servicos_cliente,
      COALESCE(dc.media_itens_cliente, 0) as media_itens_cliente,
      COALESCE(dc.estrela, 0) as estrela
    FROM dashboard_colaboradores dc
    JOIN usuarios u ON u.id = dc.colaborador
    WHERE ${unitCond} AND dc.ano = ? AND dc.mes = ?
    ORDER BY dc.total_vendas DESC
  `, [ano, mes]);
}

// ─── Colaboradores por range de datas (tempo real, tabela vendas) ───────────────

export async function getColaboradoresByRange(extIds: number[], dataInicio: string, dataFim: string) {
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const colabIds = await getColaboradoresIds(extIds);
  const vpCond = colabIds.length > 0 ? colabInCond(colabIds, "vp") : "1=1";
  const v2Cond = colabIds.length > 0 ? usuarioInCond(colabIds, "v2") : "1=1";

  return queryExternal<{
    colaborador_id: number;
    colaborador_nome: string;
    faturamento: number;
    atendimentos: number;
    ticket_medio: number;
    dias_trabalhados: number;
    faturamento_dia: number;
    servicos: number;
    extra_qtd: number;
    extra_valor: number;
    clientes: number;
    clientes_novos: number;
    produtos_qtd: number;
    produtos_valor: number;
  }>(`
    SELECT
      colab.id as colaborador_id,
      colab.nome as colaborador_nome,
      COALESCE(SUM(vp.valor_total), 0) as faturamento,
      COUNT(DISTINCT v.id) as atendimentos,
      COALESCE(SUM(vp.valor_total) / NULLIF(COUNT(DISTINCT v.id), 0), 0) as ticket_medio,
      COUNT(DISTINCT DATE(v.data_criacao)) as dias_trabalhados,
      COALESCE(SUM(vp.valor_total) / NULLIF(COUNT(DISTINCT DATE(v.data_criacao)), 0), 0) as faturamento_dia,
      COUNT(CASE WHEN p.tipo = 'ser' THEN 1 END) as servicos,
      COUNT(CASE WHEN p.tipo = 'ser' AND (p.categoria = 'extra' OR p.categoria IS NULL) THEN 1 END) as extra_qtd,
      COALESCE(SUM(CASE WHEN p.tipo = 'ser' AND (p.categoria = 'extra' OR p.categoria IS NULL) THEN vp.valor_total END), 0) as extra_valor,
      COUNT(DISTINCT v.cliente) as clientes,
      COUNT(DISTINCT CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM vendas v2
          WHERE v2.cliente = v.cliente
            AND ${v2Cond}
            AND v2.data_criacao < ?
            AND v2.comanda_temp = 0
            AND v2.status = 1
        ) THEN v.cliente
      END) as clientes_novos,
      COUNT(CASE WHEN p.tipo IN ('probar','proemp','proins') THEN 1 END) as produtos_qtd,
      COALESCE(SUM(CASE WHEN p.tipo IN ('probar','proemp','proins') THEN vp.valor_total END), 0) as produtos_valor
    FROM vendas_produtos vp
    JOIN usuarios colab ON colab.id = vp.colaborador
    JOIN vendas v ON v.id = vp.venda
    JOIN produtos p ON p.id = vp.produto
    WHERE ${vpCond}
      AND colab.visivel_agenda != 'nenhuma'
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
    GROUP BY colab.id, colab.nome
    ORDER BY faturamento DESC
  `, [dataInicio, dataInicio, dataFimExcl]);
}

// ─── Ranking de unidades ──────────────────────────────────────────────────────

export async function getRankingUnidades(extIds: number[], ano: number, mes: number) {
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `df.unidade = ${extIds[0]}`
    : `df.unidade IN (${extIds.join(",")})`;

  return queryExternal<{
    unidade_id: number;
    unidade_nome: string;
    total_vendas: number;
    quantidade_vendas: number;
    ticket_medio_por_venda: number;
    total_clientes_novos: number;
    total_clientes_antigos: number;
  }>(`
    SELECT 
      df.unidade as unidade_id,
      un.nome as unidade_nome,
      COALESCE(df.total_vendas, 0) as total_vendas,
      COALESCE(df.quantidade_vendas, 0) as quantidade_vendas,
      COALESCE(df.ticket_medio_por_venda, 0) as ticket_medio_por_venda,
      COALESCE(df.total_clientes_novos, 0) as total_clientes_novos,
      COALESCE(df.total_clientes_antigos, 0) as total_clientes_antigos
    FROM dashboard_faturamento df
    JOIN unidades un ON un.id = df.unidade
    WHERE ${unitCond} AND df.ano = ? AND df.mes = ?
    ORDER BY df.total_vendas DESC
  `, [ano, mes]);
}

// ─── Clientes (Raio X) ────────────────────────────────────────────────────────

export async function getClientesStatus(extIds: number[]) {
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `ultima_visita_unidade = ${extIds[0]}`
    : `ultima_visita_unidade IN (${extIds.join(",")})`;

  const rows = await queryExternal<{
    total: number;
    ativos: number;
    em_risco: number;
    perdidos: number;
    novos_30d: number;
  }>(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN DATEDIFF(NOW(), ultima_visita) <= 60 THEN 1 ELSE 0 END) as ativos,
      SUM(CASE WHEN DATEDIFF(NOW(), ultima_visita) BETWEEN 61 AND 90 THEN 1 ELSE 0 END) as em_risco,
      SUM(CASE WHEN DATEDIFF(NOW(), ultima_visita) > 90 THEN 1 ELSE 0 END) as perdidos,
      SUM(CASE WHEN DATEDIFF(NOW(), data_criacao) <= 30 THEN 1 ELSE 0 END) as novos_30d
    FROM clientes
    WHERE ${unitCond} AND status = 1 AND ultima_visita IS NOT NULL
  `);
  return rows[0] ?? { total: 0, ativos: 0, em_risco: 0, perdidos: 0, novos_30d: 0 };
}

export async function getClientesPerdidosRecentes(
  extIds: number[],
  diasMin: number = 61,
  diasMax: number = 120,
  limit: number = 50
) {
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `c.ultima_visita_unidade = ${extIds[0]}`
    : `c.ultima_visita_unidade IN (${extIds.join(",")})`;

  return queryExternal<{
    id: number;
    nome: string;
    telefone: string;
    ultima_visita: Date;
    dias_ausente: number;
    total_visitas: number;
    total_gasto: number;
  }>(`
    SELECT 
      c.id,
      c.nome,
      c.telefone,
      c.ultima_visita,
      DATEDIFF(NOW(), c.ultima_visita) as dias_ausente,
      (SELECT COUNT(*) FROM vendas v2 
       JOIN usuarios u2 ON v2.usuario = u2.id 
       WHERE v2.cliente = c.id 
         AND (${extIds.length === 0 ? "1=1" : extIds.length === 1 ? `u2.unidade = ${extIds[0]}` : `u2.unidade IN (${extIds.join(",")})`})
         AND v2.comanda_temp = 0 AND v2.cancelado_motivo IS NULL AND v2.status = 1) as total_visitas,
      (SELECT COALESCE(SUM(vp2.valor_total), 0) FROM vendas v2 
       JOIN usuarios u2 ON v2.usuario = u2.id 
       JOIN vendas_produtos vp2 ON vp2.venda = v2.id
       WHERE v2.cliente = c.id 
         AND (${extIds.length === 0 ? "1=1" : extIds.length === 1 ? `u2.unidade = ${extIds[0]}` : `u2.unidade IN (${extIds.join(",")})`})
         AND v2.comanda_temp = 0 AND v2.cancelado_motivo IS NULL AND v2.status = 1) as total_gasto
    FROM clientes c
    WHERE ${unitCond}
      AND c.status = 1
      AND DATEDIFF(NOW(), c.ultima_visita) BETWEEN ? AND ?
    ORDER BY dias_ausente ASC
    LIMIT ?
  `, [diasMin, diasMax, limit]);
}

// ─── Visão geral do Raio X ────────────────────────────────────────────────────

export async function getRaioXVisaoGeral(extIds: number[]) {
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `ultima_visita_unidade = ${extIds[0]}`
    : `ultima_visita_unidade IN (${extIds.join(",")})`;

  // Status atual de todos os clientes
  const statusRows = await queryExternal<{
    status_label: string;
    total: number;
  }>(`
    SELECT 
      CASE 
        WHEN DATEDIFF(NOW(), ultima_visita) <= 60 THEN 'ativo'
        WHEN DATEDIFF(NOW(), ultima_visita) BETWEEN 61 AND 90 THEN 'em_risco'
        ELSE 'perdido'
      END as status_label,
      COUNT(*) as total
    FROM clientes
    WHERE ${unitCond} AND status = 1 AND ultima_visita IS NOT NULL
    GROUP BY status_label
  `);

  const statusMap: Record<string, number> = {};
  for (const r of statusRows) {
    statusMap[r.status_label] = Number(r.total);
  }

  // One-shots (apenas 1 visita)
  const oneShotRows = await queryExternal<{ total: number }>(`
    SELECT COUNT(DISTINCT c.id) as total
    FROM clientes c
    WHERE ${unitCond} AND c.status = 1
      AND (
        SELECT COUNT(*) FROM vendas v 
        JOIN usuarios u ON v.usuario = u.id 
        WHERE v.cliente = c.id 
          AND (${extIds.length === 0 ? "1=1" : extIds.length === 1 ? `u.unidade = ${extIds[0]}` : `u.unidade IN (${extIds.join(",")})`})
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
      ) = 1
  `);

  return {
    ativos: statusMap["ativo"] ?? 0,
    emRisco: statusMap["em_risco"] ?? 0,
    perdidos: statusMap["perdido"] ?? 0,
    oneShots: Number(oneShotRows[0]?.total ?? 0),
    total: (statusMap["ativo"] ?? 0) + (statusMap["em_risco"] ?? 0) + (statusMap["perdido"] ?? 0),
  };
}

// ─── Churn por barbeiro ───────────────────────────────────────────────────────


// ─── Cadência de visitas ──────────────────────────────────────────────────────

export async function getCadenciaVisitas(extIds: number[]) {
  const colabIds = await getColaboradoresIds(extIds);
  const vCond = colabIds.length > 0 ? usuarioInCond(colabIds, "v") : "1=1";

  return queryExternal<{
    faixa: string;
    total: number;
  }>(`
    SELECT 
      CASE 
        WHEN visitas = 1 THEN '1 visita'
        WHEN visitas BETWEEN 2 AND 3 THEN '2-3 visitas'
        WHEN visitas BETWEEN 4 AND 6 THEN '4-6 visitas'
        WHEN visitas BETWEEN 7 AND 12 THEN '7-12 visitas'
        ELSE '13+ visitas'
      END as faixa,
      COUNT(*) as total
    FROM (
      SELECT v.cliente, COUNT(*) as visitas
      FROM vendas v
      WHERE ${vCond}
        AND v.comanda_temp = 0
        AND v.cancelado_motivo IS NULL
        AND v.status = 1
        AND v.cliente IS NOT NULL
        AND v.cliente != 2
      GROUP BY v.cliente
    ) sub
    GROUP BY faixa
    ORDER BY MIN(visitas)
  `);
}

// ─── Diagnóstico de clientes ──────────────────────────────────────────────────

export async function getDiagnosticoClientes(extIds: number[]) {
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `ultima_visita_unidade = ${extIds[0]}`
    : `ultima_visita_unidade IN (${extIds.join(",")})`;

  // Distribuição por dias de ausência
  const rows = await queryExternal<{
    faixa_dias: string;
    total: number;
    percentual: number;
  }>(`
    SELECT 
      CASE 
        WHEN DATEDIFF(NOW(), ultima_visita) <= 30 THEN '0-30 dias'
        WHEN DATEDIFF(NOW(), ultima_visita) BETWEEN 31 AND 60 THEN '31-60 dias'
        WHEN DATEDIFF(NOW(), ultima_visita) BETWEEN 61 AND 90 THEN '61-90 dias'
        WHEN DATEDIFF(NOW(), ultima_visita) BETWEEN 91 AND 120 THEN '91-120 dias'
        WHEN DATEDIFF(NOW(), ultima_visita) BETWEEN 121 AND 180 THEN '121-180 dias'
        ELSE '180+ dias'
      END as faixa_dias,
      COUNT(*) as total,
      ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) as percentual
    FROM clientes
    WHERE ${unitCond} AND status = 1 AND ultima_visita IS NOT NULL
    GROUP BY faixa_dias
    ORDER BY MIN(DATEDIFF(NOW(), ultima_visita))
  `);
  return rows;
}

// ─── Cohort de clientes ───────────────────────────────────────────────────────

export async function getCohortClientes(extIds: number[]) {
  const colabIds = await getColaboradoresIds(extIds);
  const vCond = colabIds.length > 0 ? usuarioInCond(colabIds, "v") : "1=1";
  const v2Cond = colabIds.length > 0 ? usuarioInCond(colabIds, "v2") : "1=1";

  return queryExternal<{
    cohort_mes: string;
    total_entrada: number;
    voltaram: number;
    taxa_retencao: number;
  }>(`
    SELECT
      primeira_visita.cohort_mes,
      COUNT(DISTINCT primeira_visita.cliente) as total_entrada,
      COUNT(DISTINCT CASE WHEN retorno.cliente IS NOT NULL THEN primeira_visita.cliente END) as voltaram,
      ROUND(
        COUNT(DISTINCT CASE WHEN retorno.cliente IS NOT NULL THEN primeira_visita.cliente END) * 100.0 /
        NULLIF(COUNT(DISTINCT primeira_visita.cliente), 0), 1
      ) as taxa_retencao
    FROM (
      SELECT v.cliente, DATE_FORMAT(MIN(v.data_criacao), '%Y-%m') as cohort_mes
      FROM vendas v
      WHERE ${vCond}
        AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
        AND v.cliente IS NOT NULL AND v.cliente != 2
        AND v.data_criacao >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY v.cliente
    ) primeira_visita
    LEFT JOIN (
      SELECT DISTINCT v2.cliente
      FROM vendas v2
      WHERE ${v2Cond}
        AND v2.comanda_temp = 0 AND v2.cancelado_motivo IS NULL AND v2.status = 1
        AND v2.cliente IS NOT NULL AND v2.cliente != 2
      GROUP BY v2.cliente
      HAVING COUNT(*) > 1
    ) retorno ON retorno.cliente = primeira_visita.cliente
    GROUP BY primeira_visita.cohort_mes
    ORDER BY primeira_visita.cohort_mes DESC
    LIMIT 12
  `);
}

// ─── Ações de reativação (clientes perdidos com contato) ─────────────────────

export async function getAcoesReativacao(extIds: number[], limit: number = 100) {
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `c.ultima_visita_unidade = ${extIds[0]}`
    : `c.ultima_visita_unidade IN (${extIds.join(",")})`;

  return queryExternal<{
    id: number;
    nome: string;
    telefone: string;
    ultima_visita: Date;
    dias_ausente: number;
    prioridade: string;
    tipo_acao: string;
  }>(`
    SELECT 
      c.id,
      c.nome,
      c.telefone,
      c.ultima_visita,
      DATEDIFF(NOW(), c.ultima_visita) as dias_ausente,
      CASE 
        WHEN DATEDIFF(NOW(), c.ultima_visita) BETWEEN 61 AND 90 THEN 'alta'
        WHEN DATEDIFF(NOW(), c.ultima_visita) BETWEEN 91 AND 120 THEN 'media'
        ELSE 'baixa'
      END as prioridade,
      CASE 
        WHEN DATEDIFF(NOW(), c.ultima_visita) BETWEEN 61 AND 90 THEN 'risco'
        WHEN DATEDIFF(NOW(), c.ultima_visita) BETWEEN 91 AND 120 THEN 'perdido_recente'
        ELSE 'perdido'
      END as tipo_acao
    FROM clientes c
    WHERE ${unitCond}
      AND c.status = 1
      AND c.ultima_visita IS NOT NULL
      AND DATEDIFF(NOW(), c.ultima_visita) > 60
      AND c.telefone IS NOT NULL
      AND c.telefone != ''
    ORDER BY dias_ausente ASC
    LIMIT ?
  `, [limit]);
}

// ─── Barbeiros (lista) ────────────────────────────────────────────────────────

export async function getBarbeiros(extIds: number[], ano: number, mes: number) {
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `dc.unidade = ${extIds[0]}`
    : `dc.unidade IN (${extIds.join(",")})`;

  return queryExternal<{
    id: number;
    nome: string;
    unidade_id: number;
  }>(`
    SELECT DISTINCT u.id, u.nome, dc.unidade as unidade_id
    FROM dashboard_colaboradores dc
    JOIN usuarios u ON u.id = dc.colaborador
    WHERE ${unitCond} AND dc.ano = ? AND dc.mes = ?
    ORDER BY u.nome ASC
  `, [ano, mes]);
}

// ─── Top Barbeiros por período ────────────────────────────────────────────────

export async function getTopBarbeiros(extIds: number[], dataInicio: string, dataFim: string) {
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const colabIds = await getColaboradoresIds(extIds);
  const vpCond = colabIds.length > 0 ? colabInCond(colabIds, "vp") : "1=1";

  return queryExternal<{
    colaborador_id: number;
    colaborador_nome: string;
    faturamento: number;
    atendimentos: number;
  }>(`
    SELECT 
      colab.id as colaborador_id,
      colab.nome as colaborador_nome,
      COALESCE(SUM(vp.valor_total), 0) as faturamento,
      COUNT(DISTINCT v.id) as atendimentos
    FROM vendas_produtos vp
    JOIN usuarios colab ON colab.id = vp.colaborador
    JOIN vendas v ON v.id = vp.venda
    WHERE ${vpCond}
      AND colab.visivel_agenda != 'nenhuma'
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
    GROUP BY colab.id, colab.nome
    ORDER BY faturamento DESC
  `, [dataInicio, dataFimExcl]);
}

// ─── Top Itens (serviços e produtos) por período ──────────────────────────────

export async function getTopItens(extIds: number[], dataInicio: string, dataFim: string) {
  const colabIds = await getColaboradoresIds(extIds);
  const vpCond = colabIds.length > 0 ? colabInCond(colabIds, "vp") : "1=1";

  return queryExternal<{
    nome: string;
    tipo: string;
    categoria: string | null;
    quantidade: number;
    total: number;
  }>(`
    SELECT 
      MIN(p.nome) as nome,
      p.tipo,
      p.categoria,
      SUM(vp.quantidade) as quantidade,
      COALESCE(SUM(vp.valor_total), 0) as total
    FROM vendas_produtos vp
    JOIN vendas v ON v.id = vp.venda
    JOIN produtos p ON p.id = vp.produto
    WHERE ${vpCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < DATE_ADD(?, INTERVAL 1 DAY)
      AND v.comanda_temp = 0
      AND v.cancelado_motivo IS NULL
      AND v.status = 1
    GROUP BY LOWER(TRIM(p.nome)), p.tipo, p.categoria
    ORDER BY total DESC
    LIMIT 20
  `, [dataInicio, dataFim]);
}

// ─── Composição por grupo (Fat. Base, Extra, Produtos) ───────────────────────

export async function getComposicaoGrupo(extIds: number[], dataInicio: string, dataFim: string) {
  const colabIds = await getColaboradoresIds(extIds);
  const vpCond = colabIds.length > 0 ? colabInCond(colabIds, "vp") : "1=1";

  return queryExternal<{
    grupo: string;
    total: number;
    quantidade: number;
  }>(`
    SELECT 
      CASE
        WHEN p.tipo = 'ser' AND p.categoria = 'base' THEN 'Serviço Base'
        WHEN p.tipo = 'ser' AND (p.categoria = 'extra' OR p.categoria IS NULL) THEN 'Serviço Extra'
        WHEN p.tipo IN ('probar','proemp','proins') AND p.categoria = 'cabelo' THEN 'Prod. Cabelo'
        WHEN p.tipo IN ('probar','proemp','proins') AND p.categoria = 'barba' THEN 'Prod. Barba'
        WHEN p.tipo IN ('probar','proemp','proins') AND p.categoria = 'emporio' THEN 'Prod. Empório'
        WHEN p.tipo IN ('probar','proemp','proins') THEN 'Prod. Outros'
        ELSE 'Outros'
      END as grupo,
      COALESCE(SUM(vp.valor_total), 0) as total,
      COUNT(*) as quantidade
    FROM vendas_produtos vp
    JOIN vendas v ON v.id = vp.venda
    JOIN produtos p ON p.id = vp.produto
    WHERE ${vpCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < DATE_ADD(?, INTERVAL 1 DAY)
      AND v.comanda_temp = 0
      AND v.cancelado_motivo IS NULL
      AND v.status = 1
    GROUP BY
      CASE
        WHEN p.tipo = 'ser' AND p.categoria = 'base' THEN 'Serviço Base'
        WHEN p.tipo = 'ser' AND (p.categoria = 'extra' OR p.categoria IS NULL) THEN 'Serviço Extra'
        WHEN p.tipo IN ('probar','proemp','proins') AND p.categoria = 'cabelo' THEN 'Prod. Cabelo'
        WHEN p.tipo IN ('probar','proemp','proins') AND p.categoria = 'barba' THEN 'Prod. Barba'
        WHEN p.tipo IN ('probar','proemp','proins') AND p.categoria = 'emporio' THEN 'Prod. Empório'
        WHEN p.tipo IN ('probar','proemp','proins') THEN 'Prod. Outros'
        ELSE 'Outros'
      END
    ORDER BY total DESC
  `, [dataInicio, dataFim]);
}

// ─── KPIs simples de um período (para comparativos) ──────────────────────────

export async function getKpisPeriodo(extIds: number[], dataInicio: string, dataFim: string) {
  const colabIds = await getColaboradoresIds(extIds);
  const vpCond = colabIds.length > 0 ? colabInCond(colabIds, "vp") : "1=1";

  const rows = await queryExternal<{
    fat_base: number;
    fat_extra: number;
    fat_produtos: number;
    fat_outros: number;
    fat_total: number;
    atendimentos: number;
  }>(`
    SELECT 
      COALESCE(SUM(CASE WHEN p.tipo = 'ser' AND p.categoria = 'base' THEN vp.valor_total END), 0) as fat_base,
      COALESCE(SUM(CASE WHEN p.tipo = 'ser' AND (p.categoria = 'extra' OR p.categoria IS NULL) THEN vp.valor_total END), 0) as fat_extra,
      COALESCE(SUM(CASE WHEN p.tipo IN ('probar','proemp','proins') THEN vp.valor_total END), 0) as fat_produtos,
      COALESCE(SUM(CASE WHEN p.tipo NOT IN ('ser','probar','proemp','proins') THEN vp.valor_total END), 0) as fat_outros,
      COALESCE(SUM(vp.valor_total), 0) as fat_total,
      COUNT(DISTINCT v.id) as atendimentos
    FROM vendas_produtos vp
    JOIN vendas v ON v.id = vp.venda
    JOIN produtos p ON p.id = vp.produto
    WHERE ${vpCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < DATE_ADD(?, INTERVAL 1 DAY)
      AND v.comanda_temp = 0
      AND v.cancelado_motivo IS NULL
      AND v.status = 1
  `, [dataInicio, dataFim]);

  const r = rows[0];
  return {
    fatBase: Number(r?.fat_base ?? 0),
    fatExtra: Number(r?.fat_extra ?? 0),
    fatProdutos: Number(r?.fat_produtos ?? 0),
    fatOutros: Number(r?.fat_outros ?? 0),
    fatTotal: Number(r?.fat_total ?? 0),
    atendimentos: Number(r?.atendimentos ?? 0),
  };
}

// ─── Faturamento por dia da semana ────────────────────────────────────────────

export async function getFaturamentoPorDiaSemana(extIds: number[], dataInicio: string, dataFim: string) {
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const colabIds = await getColaboradoresIds(extIds);
  const vpCond = colabIds.length > 0 ? colabInCond(colabIds, "vp") : "1=1";

  return queryExternal<{
    dia_semana: number;
    total: number;
    atendimentos: number;
  }>(`
    SELECT 
      DAYOFWEEK(v.data_criacao) as dia_semana,
      COALESCE(SUM(vp.valor_total), 0) as total,
      COUNT(DISTINCT v.id) as atendimentos
    FROM vendas_produtos vp
    JOIN vendas v ON v.id = vp.venda
    WHERE ${vpCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
    GROUP BY DAYOFWEEK(v.data_criacao)
    ORDER BY dia_semana ASC
  `, [dataInicio, dataFimExcl]);
}

// ─── Faturamento por faixa horária ───────────────────────────────────────────

export async function getFaturamentoPorFaixaHoraria(extIds: number[], dataInicio: string, dataFim: string) {
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const colabIds = await getColaboradoresIds(extIds);
  const vpCond = colabIds.length > 0 ? colabInCond(colabIds, "vp") : "1=1";

  return queryExternal<{
    faixa: string;
    hora_inicio: number;
    total: number;
    atendimentos: number;
  }>(`
    SELECT 
      CASE
        WHEN HOUR(v.data_criacao) BETWEEN 7 AND 8 THEN '07-09'
        WHEN HOUR(v.data_criacao) BETWEEN 9 AND 10 THEN '09-11'
        WHEN HOUR(v.data_criacao) BETWEEN 11 AND 12 THEN '11-13'
        WHEN HOUR(v.data_criacao) BETWEEN 13 AND 14 THEN '13-15'
        WHEN HOUR(v.data_criacao) BETWEEN 15 AND 16 THEN '15-17'
        WHEN HOUR(v.data_criacao) BETWEEN 17 AND 18 THEN '17-19'
        WHEN HOUR(v.data_criacao) BETWEEN 19 AND 20 THEN '19-21'
        ELSE 'Outros'
      END as faixa,
      CASE
        WHEN HOUR(v.data_criacao) BETWEEN 7 AND 8 THEN 7
        WHEN HOUR(v.data_criacao) BETWEEN 9 AND 10 THEN 9
        WHEN HOUR(v.data_criacao) BETWEEN 11 AND 12 THEN 11
        WHEN HOUR(v.data_criacao) BETWEEN 13 AND 14 THEN 13
        WHEN HOUR(v.data_criacao) BETWEEN 15 AND 16 THEN 15
        WHEN HOUR(v.data_criacao) BETWEEN 17 AND 18 THEN 17
        WHEN HOUR(v.data_criacao) BETWEEN 19 AND 20 THEN 19
        ELSE 99
      END as hora_inicio,
      COALESCE(SUM(vp.valor_total), 0) as total,
      COUNT(DISTINCT v.id) as atendimentos
    FROM vendas_produtos vp
    JOIN vendas v ON v.id = vp.venda
    WHERE ${vpCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
    GROUP BY
      CASE
        WHEN HOUR(v.data_criacao) BETWEEN 7 AND 8 THEN '07-09'
        WHEN HOUR(v.data_criacao) BETWEEN 9 AND 10 THEN '09-11'
        WHEN HOUR(v.data_criacao) BETWEEN 11 AND 12 THEN '11-13'
        WHEN HOUR(v.data_criacao) BETWEEN 13 AND 14 THEN '13-15'
        WHEN HOUR(v.data_criacao) BETWEEN 15 AND 16 THEN '15-17'
        WHEN HOUR(v.data_criacao) BETWEEN 17 AND 18 THEN '17-19'
        WHEN HOUR(v.data_criacao) BETWEEN 19 AND 20 THEN '19-21'
        ELSE 'Outros'
      END,
      CASE
        WHEN HOUR(v.data_criacao) BETWEEN 7 AND 8 THEN 7
        WHEN HOUR(v.data_criacao) BETWEEN 9 AND 10 THEN 9
        WHEN HOUR(v.data_criacao) BETWEEN 11 AND 12 THEN 11
        WHEN HOUR(v.data_criacao) BETWEEN 13 AND 14 THEN 13
        WHEN HOUR(v.data_criacao) BETWEEN 15 AND 16 THEN 15
        WHEN HOUR(v.data_criacao) BETWEEN 17 AND 18 THEN 17
        WHEN HOUR(v.data_criacao) BETWEEN 19 AND 20 THEN 19
        ELSE 99
      END
    ORDER BY hora_inicio ASC
  `, [dataInicio, dataFimExcl]);
}


// ═══════════════════════════════════════════════════════════════════════════════
// PAINEL DE CLIENTES — queries completas
// ═══════════════════════════════════════════════════════════════════════════════

/** KPIs gerais do painel de clientes para um período */
export async function getClientesKpis(extIds: number[], dataInicio: string, dataFim: string, colaboradorId?: number | null) {
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const colabIds = await getColaboradoresIds(extIds);
  // Se filtrar por colaborador específico, usa só ele; senão usa todos da unidade
  const filtroIds = colaboradorId ? [colaboradorId] : colabIds;
  const vpCond = filtroIds.length > 0 ? colabInCond(filtroIds, "vp") : "1=1";
  const vCond = filtroIds.length > 0 ? usuarioInCond(filtroIds, "v") : "1=1";
  const v2Cond = colabIds.length > 0 ? usuarioInCond(colabIds, "v2") : "1=1";
  const v3Cond = colabIds.length > 0 ? usuarioInCond(colabIds, "v3") : "1=1";

  // Total clientes únicos no período + novos (primeira visita na unidade)
  const rows = await queryExternal<{
    total_clientes: number;
    total_atendimentos: number;
    valor_total: number;
  }>(`
    SELECT
      COUNT(DISTINCT v.cliente) as total_clientes,
      COUNT(DISTINCT v.id) as total_atendimentos,
      COALESCE(SUM(vp.valor_total), 0) as valor_total
    FROM vendas_produtos vp
    JOIN vendas v ON v.id = vp.venda
    WHERE ${vpCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
      AND v.cliente IS NOT NULL
  `, [dataInicio, dataFimExcl]);

  // Clientes novos = primeira visita nesta unidade no período
  const novosRows = await queryExternal<{ novos: number }>(`
    SELECT COUNT(DISTINCT v.cliente) as novos
    FROM vendas v
    WHERE ${vCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
      AND v.cliente IS NOT NULL
      AND v.cliente NOT IN (
        SELECT DISTINCT v2.cliente
        FROM vendas v2
        WHERE ${v2Cond}
          AND v2.data_criacao < ?
          AND v2.comanda_temp = 0
          AND v2.status = 1
          AND v2.cliente IS NOT NULL
      )
  `, [dataInicio, dataFimExcl, dataInicio]);

  // Novos que retornaram = clientes novos no período que tiveram 2+ visitas no período
  const novosRetornaramRows = await queryExternal<{ retornaram: number }>(`
    SELECT COUNT(*) as retornaram
    FROM (
      SELECT v.cliente
      FROM vendas v
      WHERE ${vCond}
        AND v.data_criacao >= ?
        AND v.data_criacao < ?
        AND v.comanda_temp = 0
        AND v.status = 1
        AND v.cliente IS NOT NULL
        AND v.cliente NOT IN (
          SELECT DISTINCT v2.cliente
          FROM vendas v2
          WHERE ${v2Cond}
            AND v2.data_criacao < ?
            AND v2.comanda_temp = 0
            AND v2.status = 1
            AND v2.cliente IS NOT NULL
        )
      GROUP BY v.cliente
      HAVING COUNT(DISTINCT v.id) >= 2
    ) sub
  `, [dataInicio, dataFimExcl, dataInicio]);

  // Retenção 30d novos: % de novos que voltaram em até 30 dias
  const retencao30dRows = await queryExternal<{ retencao: number }>(`
    SELECT 
      ROUND(
        100.0 * COUNT(DISTINCT CASE WHEN v2.id IS NOT NULL THEN v.cliente END)
        / NULLIF(COUNT(DISTINCT v.cliente), 0)
      , 1) as retencao
    FROM vendas v
    LEFT JOIN vendas v2 ON v2.cliente = v.cliente
      AND v2.data_criacao > v.data_criacao
      AND v2.data_criacao <= DATE_ADD(v.data_criacao, INTERVAL 30 DAY)
      AND v2.comanda_temp = 0
      AND v2.status = 1
    WHERE ${vCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
      AND v.cliente IS NOT NULL
      AND v.cliente NOT IN (
        SELECT DISTINCT v3.cliente
        FROM vendas v3
        WHERE ${v3Cond}
          AND v3.data_criacao < ?
          AND v3.comanda_temp = 0
          AND v3.status = 1
          AND v3.cliente IS NOT NULL
      )
  `, [dataInicio, dataFimExcl, dataInicio]);

  const total = Number(rows[0]?.total_clientes ?? 0);
  const atend = Number(rows[0]?.total_atendimentos ?? 0);
  const valorTotal = Number(rows[0]?.valor_total ?? 0);
  const novos = Number(novosRows[0]?.novos ?? 0);
  const novosRetornaram = Number(novosRetornaramRows[0]?.retornaram ?? 0);
  const retencao30d = Number(retencao30dRows[0]?.retencao ?? 0);

  return {
    totalClientes: total,
    novos,
    novosRetornaram,
    novosRetornaramPct: novos > 0 ? Math.round((novosRetornaram / novos) * 100 * 10) / 10 : 0,
    novosPctTotal: total > 0 ? Math.round((novos / total) * 100 * 10) / 10 : 0,
    atendimentos: atend,
    ticketMedio: atend > 0 ? valorTotal / atend : 0,
    valorTotal,
    retencao30dNovos: retencao30d,
  };
}

/** Distribuição por status (Assíduo, Regular, Espaçando, 1ª Vez, Em Risco, Perdido)
 * Lógica baseada em cadência de visitas no período selecionado:
 * - Universo: clientes que visitaram pelo menos 1x no período
 * - Cadência individual = (dias entre primeira e última visita no período) / (visitas - 1)
 *   Para clientes com 1 visita, cadência = 30d (padrão)
 * - Dias sem vir = DATEDIFF(NOW(), última visita no período)
 * - Assíduo: dias_sem_vir <= 0.8 * cadência
 * - Regular: dias_sem_vir BETWEEN 0.8 e 1.2 * cadência
 * - Espaçando: dias_sem_vir BETWEEN 1.2 e 1.8 * cadência
 * - Em Risco: dias_sem_vir BETWEEN 1.8 e 2.5 * cadência (min 31d, max 75d para 1 vis)
 * - Perdido: dias_sem_vir > 2.5 * cadência (ou >75d para 1 vis)
 * - 1ª Vez: 1 visita E dias_sem_vir <= 30
 */
export async function getClientesDistribuicaoStatus(extIds: number[], colaboradorId?: number | null, dataInicio?: string, dataFim?: string) {
  const colabIds = await getColaboradoresIds(extIds);
  const filtroIds = colaboradorId ? [colaboradorId] : colabIds;
  const vCond = filtroIds.length > 0 ? usuarioInCond(filtroIds, "v") : "1=1";
  const v2Cond = colabIds.length > 0 ? usuarioInCond(colabIds, "v2") : "1=1";

  const ini = dataInicio ?? new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const fimExcl = dataFim
    ? new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const rows = await queryExternal<{
    status_label: string;
    total: number;
  }>(`
    SELECT
      CASE
        WHEN total_visitas = 1 AND dias_sem_vir <= 30 THEN '1a_vez'
        WHEN dias_sem_vir <= cadencia * 0.8 THEN 'assiduo'
        WHEN dias_sem_vir <= cadencia * 1.2 THEN 'regular'
        WHEN dias_sem_vir <= cadencia * 1.8 THEN 'espacando'
        WHEN dias_sem_vir <= cadencia * 2.5 THEN 'em_risco'
        ELSE 'perdido'
      END as status_label,
      COUNT(*) as total
    FROM (
      SELECT
        v.cliente,
        COUNT(DISTINCT v.id) as total_visitas,
        DATEDIFF(NOW(), MAX(v.data_criacao)) as dias_sem_vir,
        CASE
          WHEN COUNT(DISTINCT v.id) >= 2
            THEN DATEDIFF(MAX(v.data_criacao), MIN(v.data_criacao)) / (COUNT(DISTINCT v.id) - 1)
          ELSE 30
        END as cadencia
      FROM vendas v
      WHERE ${vCond}
        AND v.data_criacao >= ?
        AND v.data_criacao < ?
        AND v.comanda_temp = 0
        AND v.status = 1
        AND v.cliente IS NOT NULL
      GROUP BY v.cliente
    ) sub
    GROUP BY status_label
  `, [ini, fimExcl]);

  // Só 1 vez: clientes com exatamente 1 visita no período
  const rowsSo1vez = await queryExternal<{ total: number }>(`
    SELECT COUNT(*) as total
    FROM (
      SELECT v.cliente
      FROM vendas v
      WHERE ${vCond}
        AND v.data_criacao >= ?
        AND v.data_criacao < ?
        AND v.comanda_temp = 0
        AND v.status = 1
        AND v.cliente IS NOT NULL
      GROUP BY v.cliente
      HAVING COUNT(DISTINCT v.id) = 1
    ) sub
  `, [ini, fimExcl]);

  // Fiéis (3+ excl.): clientes com 3 ou mais visitas no período
  const rowsFieis = await queryExternal<{ total: number }>(`
    SELECT COUNT(*) as total
    FROM (
      SELECT v.cliente
      FROM vendas v
      WHERE ${vCond}
        AND v.data_criacao >= ?
        AND v.data_criacao < ?
        AND v.comanda_temp = 0
        AND v.status = 1
        AND v.cliente IS NOT NULL
      GROUP BY v.cliente
      HAVING COUNT(DISTINCT v.id) >= 3
    ) sub
  `, [ini, fimExcl]);

  // Novos: clientes cuja primeira visita na unidade foi no período
  const rowsNovos = await queryExternal<{ total: number }>(`
    SELECT COUNT(DISTINCT v.cliente) as total
    FROM vendas v
    WHERE ${vCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
      AND v.cliente IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM vendas v2
        WHERE v2.cliente = v.cliente
          AND ${v2Cond}
          AND v2.data_criacao < ?
          AND v2.comanda_temp = 0
          AND v2.status = 1
      )
  `, [ini, fimExcl, ini]);

  const map: Record<string, number> = {};
  for (const r of rows) map[r.status_label] = Number(r.total);
  const totalBase = Object.values(map).reduce((s, v) => s + v, 0);

  return {
    assiduo: map["assiduo"] ?? 0,
    regular: map["regular"] ?? 0,
    espacando: map["espacando"] ?? 0,
    primeiraVez: map["1a_vez"] ?? 0,
    emRisco: map["em_risco"] ?? 0,
    perdido: map["perdido"] ?? 0,
    total: totalBase,
    novos: Number(rowsNovos[0]?.total ?? 0),
    so1vez: Number(rowsSo1vez[0]?.total ?? 0),
    fieis3mais: Number(rowsFieis[0]?.total ?? 0),
  };
}

/** Evolução mensal: clientes únicos e novos por mês no período */
export async function getClientesEvolucaoMensal(extIds: number[], dataInicio: string, dataFim: string, colaboradorId?: number | null) {
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const colabIds = await getColaboradoresIds(extIds);
  const filtroIds = colaboradorId ? [colaboradorId] : colabIds;
  const vCond = filtroIds.length > 0 ? usuarioInCond(filtroIds, "v") : "1=1";
  const v2Cond = colabIds.length > 0 ? usuarioInCond(colabIds, "v2") : "1=1";

  const rows = await queryExternal<{
    ano: number;
    mes: number;
    clientes_unicos: number;
    novos: number;
  }>(`
    SELECT
      YEAR(v.data_criacao) as ano,
      MONTH(v.data_criacao) as mes,
      COUNT(DISTINCT v.cliente) as clientes_unicos,
      COUNT(DISTINCT CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM vendas v2
          WHERE v2.cliente = v.cliente
            AND ${v2Cond}
            AND v2.data_criacao < DATE_FORMAT(v.data_criacao, '%Y-%m-01')
            AND v2.comanda_temp = 0
            AND v2.status = 1
        ) THEN v.cliente
      END) as novos
    FROM vendas v
    WHERE ${vCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
      AND v.cliente IS NOT NULL
    GROUP BY YEAR(v.data_criacao), MONTH(v.data_criacao)
    ORDER BY ano ASC, mes ASC
  `, [dataInicio, dataFimExcl]);

  return rows.map(r => ({
    periodo: `${r.ano}-${String(Number(r.mes)).padStart(2, "0")}`,
    clientesUnicos: Number(r.clientes_unicos),
    novos: Number(r.novos),
  }));
}

/** Distribuição por frequência de visitas no período */
export async function getClientesDistribuicaoFrequencia(extIds: number[], dataInicio: string, dataFim: string, colaboradorId?: number | null) {
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const colabIds = await getColaboradoresIds(extIds);
  const filtroIds = colaboradorId ? [colaboradorId] : colabIds;
  const vCond = filtroIds.length > 0 ? usuarioInCond(filtroIds, "v") : "1=1";

  const rows = await queryExternal<{ faixa: string; ordem: number; total: number }>(`
    SELECT
      CASE
        WHEN visitas = 1 AND dias_desde_visita <= 30 THEN '1x (aguardando)'
        WHEN visitas = 1 AND dias_desde_visita > 30 AND dias_desde_visita <= 60 THEN '1x (>30d)'
        WHEN visitas = 1 AND dias_desde_visita > 60 THEN '1x (>60d)'
        WHEN visitas = 2 THEN '2 vezes'
        WHEN visitas BETWEEN 3 AND 4 THEN '3-4 vezes'
        WHEN visitas BETWEEN 5 AND 9 THEN '5-9 vezes'
        WHEN visitas BETWEEN 10 AND 12 THEN '10-12 vezes'
        WHEN visitas BETWEEN 13 AND 15 THEN '13-15 vezes'
        WHEN visitas BETWEEN 16 AND 20 THEN '16-20 vezes'
        WHEN visitas BETWEEN 21 AND 30 THEN '21-30 vezes'
        ELSE '30+ vezes'
      END as faixa,
      CASE
        WHEN visitas = 1 AND dias_desde_visita <= 30 THEN 1
        WHEN visitas = 1 AND dias_desde_visita > 30 AND dias_desde_visita <= 60 THEN 2
        WHEN visitas = 1 AND dias_desde_visita > 60 THEN 3
        WHEN visitas = 2 THEN 4
        WHEN visitas BETWEEN 3 AND 4 THEN 5
        WHEN visitas BETWEEN 5 AND 9 THEN 6
        WHEN visitas BETWEEN 10 AND 12 THEN 7
        WHEN visitas BETWEEN 13 AND 15 THEN 8
        WHEN visitas BETWEEN 16 AND 20 THEN 9
        WHEN visitas BETWEEN 21 AND 30 THEN 10
        ELSE 11
      END as ordem,
      COUNT(*) as total
    FROM (
      SELECT
        v.cliente,
        COUNT(DISTINCT v.id) as visitas,
        DATEDIFF(NOW(), MAX(v.data_criacao)) as dias_desde_visita
      FROM vendas v
      WHERE ${vCond}
        AND v.data_criacao >= ?
        AND v.data_criacao < ?
        AND v.comanda_temp = 0
        AND v.status = 1
        AND v.cliente IS NOT NULL
      GROUP BY v.cliente
    ) sub
    GROUP BY faixa, ordem
    ORDER BY ordem ASC
  `, [dataInicio, dataFimExcl]);

  return rows.map(r => ({
    faixa: r.faixa,
    total: Number(r.total),
  }));
}

/** Distribuição por dias sem vir (baseado na última visita atual dos clientes que visitaram no período) */
export async function getClientesDistribuicaoDiasSemVir(extIds: number[], dataInicio: string, dataFim: string, colaboradorId?: number | null) {
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const colabIds = await getColaboradoresIds(extIds);
  const filtroIds = colaboradorId ? [colaboradorId] : colabIds;
  const vCond = filtroIds.length > 0 ? usuarioInCond(filtroIds, "v") : "1=1";

  const rows = await queryExternal<{ faixa: string; total: number }>(`
    SELECT
      CASE
        WHEN DATEDIFF(NOW(), ultima_visita_periodo) <= 20 THEN 'ate_20d'
        WHEN DATEDIFF(NOW(), ultima_visita_periodo) BETWEEN 21 AND 30 THEN '21_30d'
        WHEN DATEDIFF(NOW(), ultima_visita_periodo) BETWEEN 31 AND 45 THEN '31_45d'
        WHEN DATEDIFF(NOW(), ultima_visita_periodo) BETWEEN 46 AND 75 THEN '46_75d'
        ELSE 'mais_75d'
      END as faixa,
      COUNT(*) as total
    FROM (
      SELECT v.cliente, MAX(v.data_criacao) as ultima_visita_periodo
      FROM vendas v
      WHERE ${vCond}
        AND v.data_criacao >= ?
        AND v.data_criacao < ?
        AND v.comanda_temp = 0
        AND v.status = 1
        AND v.cliente IS NOT NULL
      GROUP BY v.cliente
    ) sub
    GROUP BY faixa
  `, [dataInicio, dataFimExcl]);

  const map: Record<string, number> = {};
  for (const r of rows) map[r.faixa] = Number(r.total);

  return {
    ate20d: map["ate_20d"] ?? 0,
    d21a30: map["21_30d"] ?? 0,
    d31a45: map["31_45d"] ?? 0,
    d46a75: map["46_75d"] ?? 0,
    mais75d: map["mais_75d"] ?? 0,
  };
}

/** Top N clientes por valor total no período */
export async function getClientesTop(extIds: number[], dataInicio: string, dataFim: string, limit = 10) {
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const colabIds = await getColaboradoresIds(extIds);
  const vpCond = colabIds.length > 0 ? colabInCond(colabIds, "vp") : "1=1";

  const rows = await queryExternal<{
    cliente_id: number;
    nome: string;
    visitas: number;
    valor_total: number;
    ultima_visita: Date | null;
    dias_sem_vir: number;
  }>(`
    SELECT
      v.cliente as cliente_id,
      COALESCE(c.nome, CONCAT('Cliente #', v.cliente)) as nome,
      COUNT(DISTINCT v.id) as visitas,
      COALESCE(SUM(vp.valor_total), 0) as valor_total,
      MAX(v.data_criacao) as ultima_visita,
      DATEDIFF(NOW(), MAX(v.data_criacao)) as dias_sem_vir
    FROM vendas_produtos vp
    JOIN vendas v ON v.id = vp.venda
    LEFT JOIN clientes c ON c.id = v.cliente
    WHERE ${vpCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
      AND v.cliente IS NOT NULL
    GROUP BY v.cliente, c.nome
    ORDER BY valor_total DESC
    LIMIT ${Number(limit)}
  `, [dataInicio, dataFimExcl]);

  return rows.map(r => {
    const dias = Number(r.dias_sem_vir ?? 0);
    let status: string;
    if (dias <= 30) status = "assiduo";
    else if (dias <= 45) status = "regular";
    else if (dias <= 60) status = "espacando";
    else if (dias <= 75) status = "em_risco";
    else status = "perdido";

    return {
      clienteId: Number(r.cliente_id),
      nome: String(r.nome),
      visitas: Number(r.visitas),
      valorTotal: Number(r.valor_total),
      diasSemVir: dias,
      status,
    };
  });
}

/** Lista de clientes Em Risco e Perdidos (Churn & Risco) */
export async function getClientesChurnRisco(
  extIds: number[],
  dataInicio: string,
  dataFim: string,
  colaboradorId?: number | null,
  statusFiltro?: string | null,
  limit = 200
) {
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const colabIds = await getColaboradoresIds(extIds);
  const filtroIds = colaboradorId ? [colaboradorId] : colabIds;
  const vpCond = filtroIds.length > 0 ? colabInCond(filtroIds, "vp") : "1=1";
  const rows = await queryExternal<{
    cliente_id: number;
    nome: string;
    telefone: string | null;
    visitas: number;
    valor_total: number;
    ultima_visita: Date | null;
    dias_sem_vir: number;
  }>(`
    SELECT
      v.cliente as cliente_id,
      COALESCE(c.nome, CONCAT('Cliente #', v.cliente)) as nome,
      c.telefone,
      COUNT(DISTINCT v.id) as visitas,
      COALESCE(SUM(vp.valor_total), 0) as valor_total,
      MAX(v.data_criacao) as ultima_visita,
      DATEDIFF(NOW(), MAX(v.data_criacao)) as dias_sem_vir
    FROM vendas_produtos vp
    JOIN vendas v ON v.id = vp.venda
    LEFT JOIN clientes c ON c.id = v.cliente
    WHERE ${vpCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
      AND v.cliente IS NOT NULL
    GROUP BY v.cliente, c.nome, c.telefone
    HAVING dias_sem_vir > 60
    ORDER BY dias_sem_vir DESC
    LIMIT ${Number(limit)}
  `, [dataInicio, dataFimExcl]);
  return rows.map(r => {
    const dias = Number(r.dias_sem_vir ?? 0);
    const status = dias <= 75 ? "em_risco" : "perdido";
    return {
      clienteId: Number(r.cliente_id),
      nome: String(r.nome),
      telefone: r.telefone ?? null,
      visitas: Number(r.visitas),
      valorTotal: Number(r.valor_total),
      diasSemVir: dias,
      status,
    };
  }).filter(r => !statusFiltro || r.status === statusFiltro);
}

/** Top N clientes por valor total no período (expandido com paginação e busca) */
export async function getClientesTopExpandido(
  extIds: number[],
  dataInicio: string,
  dataFim: string,
  limit = 100,
  offset = 0,
  search = "",
  colaboradorId?: number | null
) {
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const colabIds = await getColaboradoresIds(extIds);
  const filtroIds = colaboradorId ? [colaboradorId] : colabIds;
  const vpCond = filtroIds.length > 0 ? colabInCond(filtroIds, "vp") : "1=1";
  const searchCond = search ? `AND COALESCE(c.nome, '') LIKE ?` : "";
  const params: (string | number)[] = [dataInicio, dataFimExcl];
  if (search) params.push(`%${search}%`);
  const rows = await queryExternal<{
    cliente_id: number;
    nome: string;
    telefone: string | null;
    visitas: number;
    valor_total: number;
    ultima_visita: Date | null;
    dias_sem_vir: number;
  }>(`
    SELECT
      v.cliente as cliente_id,
      COALESCE(c.nome, CONCAT('Cliente #', v.cliente)) as nome,
      c.telefone,
      COUNT(DISTINCT v.id) as visitas,
      COALESCE(SUM(vp.valor_total), 0) as valor_total,
      MAX(v.data_criacao) as ultima_visita,
      DATEDIFF(NOW(), MAX(v.data_criacao)) as dias_sem_vir
    FROM vendas_produtos vp
    JOIN vendas v ON v.id = vp.venda
    LEFT JOIN clientes c ON c.id = v.cliente
    WHERE ${vpCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
      AND v.cliente IS NOT NULL
      ${searchCond}
    GROUP BY v.cliente, c.nome, c.telefone
    ORDER BY valor_total DESC
    LIMIT ${Number(limit)} OFFSET ${Number(offset)}
  `, params);
  return rows.map(r => {
    const dias = Number(r.dias_sem_vir ?? 0);
    let status: string;
    if (dias <= 30) status = "assiduo";
    else if (dias <= 45) status = "regular";
    else if (dias <= 60) status = "espacando";
    else if (dias <= 75) status = "em_risco";
    else status = "perdido";
    return {
      clienteId: Number(r.cliente_id),
      nome: String(r.nome),
      telefone: r.telefone ?? null,
      visitas: Number(r.visitas),
      valorTotal: Number(r.valor_total),
      diasSemVir: dias,
      status,
    };
  });
}

/** Lista de colaboradores com atendimentos no período (para filtro do painel de clientes) */
/** Usa vp.colaborador (barbeiro que executou o serviço) em vez de v.usuario (caixa) */
export async function getListaColaboradoresClientes(extIds: number[], dataInicio: string, dataFim: string) {
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const colabIds = await getColaboradoresIds(extIds);
  const vpCond = colabIds.length > 0 ? colabInCond(colabIds, "vp") : "1=1";
  const rows = await queryExternal<{ id: number; nome: string; total: number }>(`
    SELECT colab.id, colab.nome, COUNT(DISTINCT v.id) as total
    FROM vendas_produtos vp
    JOIN vendas v ON vp.venda = v.id
    JOIN usuarios colab ON vp.colaborador = colab.id
    WHERE ${vpCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
      AND v.cliente IS NOT NULL
    GROUP BY colab.id, colab.nome
    ORDER BY total DESC
  `, [dataInicio, dataFimExcl]);
  return rows.map(r => ({ id: Number(r.id), nome: String(r.nome), total: Number(r.total) }));
}

// ── Detalhes de um cliente específico ────────────────────────────────────────
export async function getClienteDetalhes(extIds: number[], clienteId: number) {
  const colabIds = await getColaboradoresIds(extIds);
  const vpCond = colabIds.length > 0 ? colabInCond(colabIds, "vp") : "1=1";

  // KPIs gerais do cliente
  const kpiRows = await queryExternal<{
    nome: string;
    telefone: string | null;
    total_visitas: number;
    valor_total: number;
    ticket_medio: number;
    primeira_visita: Date | null;
    ultima_visita: Date | null;
    dias_sem_vir: number;
  }>(`
    SELECT
      COALESCE(c.nome, CONCAT('Cliente #', v.cliente)) as nome,
      c.telefone,
      COUNT(DISTINCT v.id) as total_visitas,
      COALESCE(SUM(vp.valor_total), 0) as valor_total,
      COALESCE(SUM(vp.valor_total) / COUNT(DISTINCT v.id), 0) as ticket_medio,
      MIN(v.data_criacao) as primeira_visita,
      MAX(v.data_criacao) as ultima_visita,
      DATEDIFF(NOW(), MAX(v.data_criacao)) as dias_sem_vir
    FROM vendas_produtos vp
    JOIN vendas v ON v.id = vp.venda
    LEFT JOIN clientes c ON c.id = v.cliente
    WHERE ${vpCond}
      AND v.cliente = ?
      AND v.comanda_temp = 0
      AND v.status = 1
  `, [clienteId]);

  if (!kpiRows.length || !kpiRows[0].total_visitas) return null;
  const kpi = kpiRows[0];

  // Últimas 20 visitas
  const visitasRows = await queryExternal<{
    venda_id: number;
    data: Date;
    colaborador: string;
    valor: number;
    servicos: string;
  }>(`
    SELECT
      v.id as venda_id,
      v.data_criacao as data,
      COALESCE(u.nome, 'Desconhecido') as colaborador,
      COALESCE(SUM(vp.valor_total), 0) as valor,
      GROUP_CONCAT(DISTINCT vp.descricao ORDER BY vp.descricao SEPARATOR ', ') as servicos
    FROM vendas_produtos vp
    JOIN vendas v ON v.id = vp.venda
    LEFT JOIN usuarios u ON vp.colaborador = u.id
    LEFT JOIN clientes c ON c.id = v.cliente
    WHERE ${vpCond}
      AND v.cliente = ?
      AND v.comanda_temp = 0
      AND v.status = 1
    GROUP BY v.id, v.data_criacao, u.nome
    ORDER BY v.data_criacao DESC
    LIMIT 20
  `, [clienteId]);

  // Top 5 serviços mais consumidos
  const servicosRows = await queryExternal<{
    servico: string;
    quantidade: number;
    valor_total: number;
  }>(`
    SELECT
      vp.descricao as servico,
      COUNT(*) as quantidade,
      COALESCE(SUM(vp.valor_total), 0) as valor_total
    FROM vendas_produtos vp
    JOIN vendas v ON v.id = vp.venda
    WHERE ${vpCond}
      AND v.cliente = ?
      AND v.comanda_temp = 0
      AND v.status = 1
    GROUP BY vp.descricao
    ORDER BY quantidade DESC
    LIMIT 5
  `, [clienteId]);

  // Evolução mensal de gasto (últimos 12 meses)
  const evolRows = await queryExternal<{
    periodo: string;
    visitas: number;
    valor: number;
  }>(`
    SELECT
      DATE_FORMAT(v.data_criacao, '%Y-%m') as periodo,
      COUNT(DISTINCT v.id) as visitas,
      COALESCE(SUM(vp.valor_total), 0) as valor
    FROM vendas_produtos vp
    JOIN vendas v ON v.id = vp.venda
    WHERE ${vpCond}
      AND v.cliente = ?
      AND v.comanda_temp = 0
      AND v.status = 1
      AND v.data_criacao >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
    GROUP BY DATE_FORMAT(v.data_criacao, '%Y-%m')
    ORDER BY periodo ASC
  `, [clienteId]);

  const dias = Number(kpi.dias_sem_vir ?? 0);
  let status: string;
  if (dias <= 30) status = "assiduo";
  else if (dias <= 45) status = "regular";
  else if (dias <= 60) status = "espacando";
  else if (dias <= 75) status = "em_risco";
  else status = "perdido";

  return {
    clienteId,
    nome: String(kpi.nome),
    telefone: kpi.telefone ?? null,
    totalVisitas: Number(kpi.total_visitas),
    valorTotal: Number(kpi.valor_total),
    ticketMedio: Number(kpi.ticket_medio),
    primeiraVisita: kpi.primeira_visita ? new Date(kpi.primeira_visita).toISOString().slice(0, 10) : null,
    ultimaVisita: kpi.ultima_visita ? new Date(kpi.ultima_visita).toISOString().slice(0, 10) : null,
    diasSemVir: dias,
    status,
    visitas: visitasRows.map(r => ({
      vendaId: Number(r.venda_id),
      data: new Date(r.data).toISOString().slice(0, 10),
      colaborador: String(r.colaborador),
      valor: Number(r.valor),
      servicos: String(r.servicos ?? ""),
    })),
    topServicos: servicosRows.map(r => ({
      servico: String(r.servico),
      quantidade: Number(r.quantidade),
      valorTotal: Number(r.valor_total),
    })),
    evolucaoMensal: evolRows.map(r => ({
      periodo: String(r.periodo),
      visitas: Number(r.visitas),
      valor: Number(r.valor),
    })),
  };
}

/**
 * Churn & Saúde da Base
 * - Base ativa: clientes que visitaram no período
 * - Perdidos: clientes da base ativa que não voltaram após janelaDias
 * - Churn %: perdidos / base ativa
 * - Resgatados: clientes que não vieram antes do início do período mas voltaram no período
 * - Tempo médio resgate: média de dias de ausência dos resgatados
 * - Valor perdido estimado: perdidos * ticket médio da unidade no período
 */
export async function getChurnSaudeBase(extIds: number[], dataInicio: string, dataFim: string, janelaDias: number = 60, colaboradorId?: number | null) {
  const colabIds = await getColaboradoresIds(extIds);
  const filtroIds = colaboradorId ? [colaboradorId] : colabIds;
  const vCond = filtroIds.length > 0 ? usuarioInCond(filtroIds, "v") : "1=1";
  const v2Cond = colabIds.length > 0 ? usuarioInCond(colabIds, "v2") : "1=1";
  const v3Cond = colabIds.length > 0 ? usuarioInCond(colabIds, "v3") : "1=1";
  const v4Cond = colabIds.length > 0 ? usuarioInCond(colabIds, "v4") : "1=1";

  const janelaEntrada = Math.round(janelaDias * 1.833);
  const dataInicioJanela = new Date(new Date(dataInicio + "T12:00:00Z").getTime() - janelaEntrada * 86400000).toISOString().slice(0, 10);

  // Base Ativa: clientes que vieram nos últimos janelaDias antes do FIM do período
  const rowsBase = await queryExternal<{ total: number; ticket_medio: number }>(`
    SELECT COUNT(DISTINCT v.cliente) as total,
           COALESCE(SUM(v.valor_total) / NULLIF(COUNT(DISTINCT v.id), 0), 0) as ticket_medio
    FROM vendas v
    WHERE ${vCond}
      AND DATEDIFF(?, DATE(v.data_criacao)) <= ?
      AND DATE(v.data_criacao) <= ?
      AND v.comanda_temp = 0
      AND v.status = 1
      AND v.cliente IS NOT NULL
      AND v.cliente != 2
  `, [dataFim, janelaDias, dataFim]);
  const baseAtiva = Number(rowsBase[0]?.total ?? 0);
  const ticketMedio = Number(rowsBase[0]?.ticket_medio ?? 0);

  // Perdidos: clientes que vieram nos janelaEntrada dias antes do INÍCIO
  // mas não voltaram em nenhum momento do período selecionado
  const rowsPerdidos = await queryExternal<{ total: number }>(`
    SELECT COUNT(DISTINCT base.cliente) as total
    FROM (
      SELECT DISTINCT v.cliente
      FROM vendas v
      WHERE ${vCond}
        AND DATE(v.data_criacao) >= ?
        AND DATE(v.data_criacao) < ?
        AND v.comanda_temp = 0
        AND v.status = 1
        AND v.cliente IS NOT NULL
        AND v.cliente != 2
    ) base
    WHERE NOT EXISTS (
      SELECT 1
      FROM vendas v2
      WHERE ${v2Cond}
        AND v2.cliente = base.cliente
        AND DATE(v2.data_criacao) >= ?
        AND DATE(v2.data_criacao) <= ?
        AND v2.comanda_temp = 0
        AND v2.status = 1
    )
  `, [dataInicioJanela, dataInicio, dataInicio, dataFim]);
  const perdidos = Number(rowsPerdidos[0]?.total ?? 0);

  const janelaBaseAtiva = 45;
  const dataFimBaseAtiva = new Date(new Date(dataFim + "T12:00:00Z").getTime() - janelaBaseAtiva * 86400000).toISOString().slice(0, 10);
  const rowsResgatados = await queryExternal<{ total: number }>(`
    SELECT COUNT(DISTINCT base.cliente) as total
    FROM (
      SELECT DISTINCT v.cliente
      FROM vendas v
      WHERE ${vCond}
        AND DATE(v.data_criacao) >= ?
        AND DATE(v.data_criacao) <= ?
        AND v.comanda_temp = 0
        AND v.status = 1
        AND v.cliente IS NOT NULL
        AND v.cliente != 2
    ) base
    WHERE NOT EXISTS (
      SELECT 1 FROM vendas v2
      WHERE ${v2Cond}
        AND v2.cliente = base.cliente
        AND DATE(v2.data_criacao) >= ?
        AND DATE(v2.data_criacao) < ?
        AND v2.comanda_temp = 0
        AND v2.status = 1
    )
    AND EXISTS (
      SELECT 1 FROM vendas v3
      WHERE ${v3Cond}
        AND v3.cliente = base.cliente
        AND DATE(v3.data_criacao) < ?
        AND v3.comanda_temp = 0
        AND v3.status = 1
    )
    AND EXISTS (
      SELECT 1 FROM vendas v4
      WHERE ${v4Cond}
        AND v4.cliente = base.cliente
        AND DATE(v4.data_criacao) >= ?
        AND DATE(v4.data_criacao) <= ?
        AND v4.comanda_temp = 0
        AND v4.status = 1
    )
  `, [dataInicio, dataFim, dataInicioJanela, dataInicio, dataInicioJanela, dataFimBaseAtiva, dataFim]);
  const resgatados = Number(rowsResgatados[0]?.total ?? 0);
  // Tempo Médio de Resgate = janelaEntrada (parâmetro da janela, fiel ao sistema de referência)
  const tempoMedioResgate = janelaEntrada;

  // Churn = Perdidos / (Base Ativa + Perdidos)
  const denominador = baseAtiva + perdidos;
  return {
    baseAtiva,
    perdidos,
    churnPct: denominador > 0 ? (perdidos / denominador) * 100 : 0,
    resgatados,
    tempoMedioResgate,
    valorPerdidoEst: perdidos * ticketMedio,
    ticketMedio,
  };
}
/**
 * Churn por Barbeiro
 * Para cada barbeiro que atendeu no período:
 * - Base ativa: clientes únicos atendidos por ele nos janelaDias antes do FIM
 * - Perdidos: clientes dele que vieram nos janelaEntrada dias antes do INÍCIO mas não voltaram
 * - Churn %: perdidos / (base ativa + perdidos)
 * - Exclusivos: % de clientes que só foram atendidos por ele no período
 * - Compartilhados: % de clientes que também foram atendidos por outros
 */
export async function getChurnPorBarbeiro(extIds: number[], dataInicio: string, dataFim: string, janelaDias: number = 60, colaboradorId?: number | null) {
  const colabIds = await getColaboradoresIds(extIds);
  const filtroIds = colaboradorId ? [colaboradorId] : colabIds;
  const vpCond = filtroIds.length > 0 ? colabInCond(filtroIds, "vp") : "1=1";
  const v2Cond = colabIds.length > 0 ? usuarioInCond(colabIds, "v2") : "1=1";
  const v2bCond = colabIds.length > 0 ? usuarioInCond(colabIds, "v2") : "1=1";
  const janelaEntrada = Math.round(janelaDias * 1.833);
  const dataInicioJanela = new Date(new Date(dataInicio + "T12:00:00Z").getTime() - janelaEntrada * 86400000).toISOString().slice(0, 10);

  // Base ativa por barbeiro: clientes que vieram nos janelaDias antes do FIM
  const rowsBase = await queryExternal<{
    colaborador_id: number;
    colaborador_nome: string;
    base_ativa: number;
  }>(`
    SELECT vp.colaborador as colaborador_id,
           COALESCE(c.nome, CONCAT('Colaborador ', vp.colaborador)) as colaborador_nome,
           COUNT(DISTINCT v.cliente) as base_ativa
    FROM vendas_produtos vp
    JOIN vendas v ON vp.venda = v.id
    LEFT JOIN usuarios c ON vp.colaborador = c.id
    WHERE ${vpCond}
      AND DATEDIFF(?, DATE(v.data_criacao)) <= ?
      AND DATE(v.data_criacao) <= ?
      AND v.comanda_temp = 0
      AND v.status = 1
      AND v.cliente IS NOT NULL
      AND v.cliente != 2
      AND vp.colaborador IS NOT NULL
    GROUP BY vp.colaborador, c.nome
    ORDER BY base_ativa DESC
  `, [dataFim, janelaDias, dataFim]);
  if (rowsBase.length === 0) return [];
  const results = [];
  for (const row of rowsBase) {
    const colabId = Number(row.colaborador_id);
    const baseAtiva = Number(row.base_ativa);
    const rowsPerd = await queryExternal<{ total: number }>(`
      SELECT COUNT(DISTINCT base.cliente) as total
      FROM (
        SELECT DISTINCT v.cliente
        FROM vendas_produtos vp
        JOIN vendas v ON vp.venda = v.id
        WHERE vp.colaborador = ?
          AND DATE(v.data_criacao) >= ?
          AND DATE(v.data_criacao) < ?
          AND v.comanda_temp = 0
          AND v.status = 1
          AND v.cliente IS NOT NULL
          AND v.cliente != 2
      ) base
      WHERE NOT EXISTS (
        SELECT 1
        FROM vendas v2
        WHERE ${v2Cond}
          AND v2.cliente = base.cliente
          AND DATE(v2.data_criacao) >= ?
          AND DATE(v2.data_criacao) <= ?
          AND v2.comanda_temp = 0
          AND v2.status = 1
      )
    `, [colabId, dataInicioJanela, dataInicio, dataInicio, dataFim]);
    // Exclusivos: clientes atendidos SOMENTE por este barbeiro no período
    const rowsExcl = await queryExternal<{ total: number }>(`
      SELECT COUNT(DISTINCT v.cliente) as total
      FROM vendas_produtos vp
      JOIN vendas v ON vp.venda = v.id
      WHERE vp.colaborador = ?
        AND DATE(v.data_criacao) >= ?
        AND DATE(v.data_criacao) <= ?
        AND v.comanda_temp = 0
        AND v.status = 1
        AND v.cliente IS NOT NULL
        AND v.cliente != 2
        AND NOT EXISTS (
          SELECT 1
          FROM vendas_produtos vp2
          JOIN vendas v2 ON vp2.venda = v2.id
          WHERE ${v2bCond}
            AND v2.cliente = v.cliente
            AND vp2.colaborador != ?
            AND DATE(v2.data_criacao) >= ?
            AND DATE(v2.data_criacao) <= ?
            AND v2.comanda_temp = 0
            AND v2.status = 1
        )
    `, [colabId, dataInicio, dataFim, colabId, dataInicio, dataFim]);
    const perdidos = Number(rowsPerd[0]?.total ?? 0);
    const exclusivos = Number(rowsExcl[0]?.total ?? 0);
    const exclusivosPct = baseAtiva > 0 ? (exclusivos / baseAtiva) * 100 : 0;
    const denominador = baseAtiva + perdidos;
    results.push({
      colaboradorId: colabId,
      colaboradorNome: String(row.colaborador_nome),
      baseAtiva,
      perdidos,
      churnPct: denominador > 0 ? (perdidos / denominador) * 100 : 0,
      exclusivosPct,
      compartilhadosPct: 100 - exclusivosPct,
    });
  }
  return results;
}

// ─── Colaboradores para comissões (com breakdown base/extra/produtos) ─────────
/**
 * Busca colaboradores com breakdown correto de faturamento por tipo de serviço.
 * Usa nomesBase (da tabela servico_categorias) para classificar serviços base vs extra.
 * Se nomesBase fornecido: base = nome IN (nomesBase), extra = tipo='ser' AND nome NOT IN (nomesBase).
 * Se nomesBase vazio: base = categoria='base', extra = categoria='extra' OR categoria IS NULL.
 * Produtos = tipo IN ('probar','proemp','proins').
 */
export async function getColaboradoresComissoes(
  extIds: number[],
  dataInicio: string,
  dataFim: string,
  nomesBase: string[] = []
) {
  const colabIds = await getColaboradoresIds(extIds);
  const vpCond = colabIds.length > 0 ? colabInCond(colabIds, "vp") : "1=1";
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);

  let baseCond: string;
  let extraCond: string;
  let params: unknown[];

  if (nomesBase.length > 0) {
    const placeholders = nomesBase.map(() => "?").join(",");
    baseCond = `p.tipo = 'ser' AND p.nome IN (${placeholders})`;
    extraCond = `p.tipo = 'ser' AND p.nome NOT IN (${placeholders})`;
    // params: nomesBase x2 (para baseCond e extraCond nos CASE WHEN) + dataInicio + dataFimExcl (WHERE)
    params = [...nomesBase, ...nomesBase, dataInicio, dataFimExcl];
  } else {
    baseCond = `p.tipo = 'ser' AND p.categoria = 'base'`;
    extraCond = `p.tipo = 'ser' AND (p.categoria = 'extra' OR p.categoria IS NULL)`;
    // params: apenas dataInicio + dataFimExcl (WHERE) — sem placeholders nos CASE WHEN
    params = [dataInicio, dataFimExcl];
  }

  return queryExternal<{
    colaborador_id: number;
    colaborador_nome: string;
    faturamento: number;
    atendimentos: number;
    dias_trabalhados: number;
    faturamento_dia: number;
    servicos_base_valor: number;
    extra_valor: number;
    produtos_valor: number;
    clientes: number;
  }>(`
    SELECT
      colab.id as colaborador_id,
      colab.nome as colaborador_nome,
      COALESCE(SUM(vp.valor_total), 0) as faturamento,
      COUNT(DISTINCT v.id) as atendimentos,
      COUNT(DISTINCT DATE(v.data_criacao)) as dias_trabalhados,
      COALESCE(SUM(vp.valor_total) / NULLIF(COUNT(DISTINCT DATE(v.data_criacao)), 0), 0) as faturamento_dia,
      COALESCE(SUM(CASE WHEN ${baseCond} THEN vp.valor_total END), 0) as servicos_base_valor,
      COALESCE(SUM(CASE WHEN ${extraCond} THEN vp.valor_total END), 0) as extra_valor,
      COALESCE(SUM(CASE WHEN p.tipo IN ('probar','proemp','proins') THEN vp.valor_total END), 0) as produtos_valor,
      COUNT(DISTINCT v.cliente) as clientes
    FROM vendas_produtos vp
    JOIN usuarios colab ON colab.id = vp.colaborador
    JOIN vendas v ON v.id = vp.venda
    JOIN produtos p ON p.id = vp.produto
    WHERE ${vpCond}
      AND colab.visivel_agenda != 'nenhuma'
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
    GROUP BY colab.id, colab.nome
    ORDER BY faturamento DESC
  `, params);
}
