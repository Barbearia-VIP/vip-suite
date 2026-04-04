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

// ─── Dashboard KPIs (híbrido: tempo real para mês atual, dashboard_faturamento para anteriores) ─────

/** Busca KPIs diretamente da tabela vendas (tempo real, sem atraso de 1 dia) */
async function getKpisRealtime(extIds: number[], ano: number, mes: number) {
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
    : `uu.unidade IN (${extIds.join(",")})`;

  const dataInicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const proximoMes = mes === 12 ? 1 : mes + 1;
  const anoProximo = mes === 12 ? ano + 1 : ano;
  const dataFim = `${anoProximo}-${String(proximoMes).padStart(2, '0')}-01`;

  // Faturamento e atendimentos via JOIN vendas_produtos (só conta vendas com itens)
  const rows = await queryExternal<{
    total_vendas: number;
    quantidade_vendas: number;
    total_clientes_unicos: number;
  }>(`
    SELECT 
      COALESCE(SUM(vp.valor_total), 0) as total_vendas,
      COUNT(DISTINCT v.id) as quantidade_vendas,
      COUNT(DISTINCT v.cliente) as total_clientes_unicos
    FROM vendas v
    JOIN usuarios uu ON v.usuario = uu.id
    JOIN vendas_produtos vp ON vp.venda = v.id
    WHERE ${unitCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status != 0
  `, [dataInicio, dataFim]);

  // Clientes novos = primeira visita nesta unidade no período
  const novosRows = await queryExternal<{ novos: number }>(`
    SELECT COUNT(DISTINCT v.cliente) as novos
    FROM vendas v
    JOIN usuarios uu ON v.usuario = uu.id
    WHERE ${unitCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status != 0
      AND v.cliente IS NOT NULL
      AND v.cliente NOT IN (
        SELECT DISTINCT v2.cliente
        FROM vendas v2
        JOIN usuarios uu2 ON v2.usuario = uu2.id
        WHERE uu2.unidade ${extIds.length === 1 ? `= ${extIds[0]}` : extIds.length > 1 ? `IN (${extIds.join(',')})` : '> 0'}
          AND v2.data_criacao < ?
          AND v2.comanda_temp = 0
          AND v2.status != 0
          AND v2.cliente IS NOT NULL
      )
  `, [dataInicio, dataFim, dataInicio]);

  // Serviços: total, base (categoria='base'), extra (categoria='extra' ou null), produtos
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
    JOIN usuarios uu ON v.usuario = uu.id
    JOIN produtos p ON p.id = vp.produto
    WHERE ${unitCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status != 0
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
export async function getKpisRealtimeByRange(extIds: number[], dataInicio: string, dataFim: string) {
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
    : `uu.unidade IN (${extIds.join(",")})`;
  // dataFim é inclusivo: adicionar 1 dia para usar < no WHERE
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);

  // Faturamento e atendimentos via JOIN vendas_produtos (só conta vendas com itens)
  const rows = await queryExternal<{
    total_vendas: number;
    quantidade_vendas: number;
    total_clientes_unicos: number;
  }>(`
    SELECT 
      COALESCE(SUM(vp.valor_total), 0) as total_vendas,
      COUNT(DISTINCT v.id) as quantidade_vendas,
      COUNT(DISTINCT v.cliente) as total_clientes_unicos
    FROM vendas v
    JOIN usuarios uu ON v.usuario = uu.id
    JOIN vendas_produtos vp ON vp.venda = v.id
    WHERE ${unitCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status != 0
  `, [dataInicio, dataFimExcl]);

  // Clientes novos = primeira visita nesta unidade no período
  const novosRows = await queryExternal<{ novos: number }>(`
    SELECT COUNT(DISTINCT v.cliente) as novos
    FROM vendas v
    JOIN usuarios uu ON v.usuario = uu.id
    WHERE ${unitCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status != 0
      AND v.cliente IS NOT NULL
      AND v.cliente NOT IN (
        SELECT DISTINCT v2.cliente
        FROM vendas v2
        JOIN usuarios uu2 ON v2.usuario = uu2.id
        WHERE uu2.unidade ${extIds.length === 1 ? `= ${extIds[0]}` : extIds.length > 1 ? `IN (${extIds.join(',')})` : '> 0'}
          AND v2.data_criacao < ?
          AND v2.comanda_temp = 0
          AND v2.status != 0
          AND v2.cliente IS NOT NULL
      )
  `, [dataInicio, dataFimExcl, dataInicio]);

  // Serviços: total, base (categoria='base'), extra (categoria='extra' ou null), produtos
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
    JOIN usuarios uu ON v.usuario = uu.id
    JOIN produtos p ON p.id = vp.produto
    WHERE ${unitCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status != 0
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
  dataFim: string // exclusivo (já ajustado pelo caller)
): Promise<{ diasTrabalhados: number; faturamentoTotal: number }> {
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
    : `uu.unidade IN (${extIds.join(",")})`;

  const rows = await queryExternal<{ dias: number; total: number }>(`
    SELECT 
      COUNT(DISTINCT DATE(v.data_criacao)) as dias,
      COALESCE(SUM(vp.valor_total), 0) as total
    FROM vendas v
    JOIN usuarios uu ON v.usuario = uu.id
    JOIN vendas_produtos vp ON vp.venda = v.id
    WHERE ${unitCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status != 0
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
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
    : `uu.unidade IN (${extIds.join(",")})`;

  const rows = await queryExternal<{ mes: string; dias: number }>(`
    SELECT 
      DATE_FORMAT(v.data_criacao, '%Y-%m') as mes,
      COUNT(DISTINCT DATE(v.data_criacao)) as dias
    FROM vendas v
    JOIN usuarios uu ON v.usuario = uu.id
    WHERE ${unitCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status != 0
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
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
    : `uu.unidade IN (${extIds.join(",")})`;

  // Lógica principal: usa categoria do banco externo
  // Se nomesBase fornecidos (configuração local), usa lista de nomes como fallback
  let extraCond: string;
  if (nomesBase.length > 0) {
    const placeholders = nomesBase.map(() => "?").join(",");
    extraCond = `p.tipo = 'ser' AND p.nome NOT IN (${placeholders})`;
  } else {
    // Usa categoria do banco externo: extra = categoria='extra' OU categoria IS NULL
    extraCond = `p.tipo = 'ser' AND (p.categoria = 'extra' OR p.categoria IS NULL)`;
  }

  const params: unknown[] = [...(nomesBase.length > 0 ? nomesBase : []), dataInicio, dataFim];

  const rows = await queryExternal<{ qtd: number; total: number }>(`
    SELECT 
      COUNT(*) as qtd,
      COALESCE(SUM(vp.valor_total), 0) as total
    FROM vendas_produtos vp
    JOIN vendas v ON vp.venda = v.id
    JOIN usuarios uu ON v.usuario = uu.id
    JOIN produtos p ON p.id = vp.produto
    WHERE ${unitCond}
      AND ${extraCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status != 0
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
  const unitCondV = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
    : `uu.unidade IN (${extIds.join(",")})`;

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
    JOIN usuarios uu ON v.usuario = uu.id
    LEFT JOIN clientes c ON c.id = v.cliente
    WHERE ${unitCondV}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.cancelado_motivo IS NULL
      AND v.status != 0
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
  const unitCondV = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
    : `uu.unidade IN (${extIds.join(",")})`;

  const agora = new Date();
  const anoAtual = agora.getFullYear();
  const mesAtual = agora.getMonth() + 1;

  // Calcula data de início: N meses atrás
  const dataInicio = new Date(anoAtual, mesAtual - meses, 1);
  const dataInicioStr = `${dataInicio.getFullYear()}-${String(dataInicio.getMonth() + 1).padStart(2, '0')}-01`;
  const proximoMes = mesAtual === 12 ? 1 : mesAtual + 1;
  const anoProximo = mesAtual === 12 ? anoAtual + 1 : anoAtual;
  const dataFimStr = `${anoProximo}-${String(proximoMes).padStart(2, '0')}-01`;

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
      COALESCE(SUM(v.valor_liquido), 0) as faturamento,
      COUNT(DISTINCT v.id) as atendimentos,
      COALESCE(AVG(v.valor_liquido), 0) as ticket_medio,
      COUNT(DISTINCT v.cliente) as clientes,
      COUNT(DISTINCT CASE WHEN cl.data_criacao >= DATE_FORMAT(v.data_criacao, '%Y-%m-01') THEN v.cliente END) as clientes_novos,
      COUNT(CASE WHEN p.tipo = 'ser' AND (p.categoria = 'extra' OR p.categoria IS NULL OR p.categoria != 'base') AND p.categoria != 'base' THEN 1 END) as extras_qtd,
      COALESCE(SUM(CASE WHEN p.tipo = 'ser' AND p.categoria != 'base' AND p.categoria IS NOT NULL THEN vp.valor_total ELSE 0 END), 0) as extras_valor,
      COUNT(CASE WHEN p.tipo = 'ser' THEN 1 END) as servicos_total,
      COUNT(CASE WHEN p.tipo IN ('probar','proemp','proins') THEN 1 END) as produtos_qtd,
      COALESCE(SUM(CASE WHEN p.tipo IN ('probar','proemp','proins') THEN vp.valor_total ELSE 0 END), 0) as produtos_valor
    FROM vendas v
    JOIN usuarios uu ON v.usuario = uu.id
    JOIN vendas_produtos vp ON vp.venda = v.id
    JOIN produtos p ON p.id = vp.produto
    LEFT JOIN clientes cl ON cl.id = v.cliente
    WHERE ${unitCondV}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.cancelado_motivo IS NULL
      AND v.status != 0
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

// ─── Faturamento por forma de pagamento ──────────────────────────────────────

export async function getFaturamentoPorPagamento(extIds: number[], dataInicio: string, dataFim: string) {
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
    : `uu.unidade IN (${extIds.join(",")})`;

  return queryExternal<{
    forma: string;
    tipo: string;
    total: number;
    qtd_vendas: number;
  }>(`
    SELECT 
      fp.nome as forma,
      fp.tipo,
      COALESCE(SUM(vp.valor), 0) as total,
      COUNT(DISTINCT v.id) as qtd_vendas
    FROM vendas v
    JOIN usuarios uu ON v.usuario = uu.id
    JOIN vendas_pagamentos vp ON vp.venda = v.id
    JOIN formas_pagamentos fp ON fp.id = vp.forma_pagamento
    WHERE ${unitCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < DATE_ADD(?, INTERVAL 1 DAY)
      AND v.comanda_temp = 0
      AND v.cancelado_motivo IS NULL
      AND v.status != 0
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
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
    : `uu.unidade IN (${extIds.join(",")})`;
  const dataFimExcl = new Date(new Date(dataFimIncl + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);

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
          JOIN usuarios uu2 ON v2.usuario = uu2.id
          WHERE v2.cliente = v.cliente
            AND ${unitCond.replace(/uu\.unidade/g, 'uu2.unidade')}
            AND v2.data_criacao < DATE(v.data_criacao)
            AND v2.comanda_temp = 0
            AND v2.status != 0
        ) THEN v.cliente
      END) as clientes_novos,
      COALESCE(SUM(vp.valor_total) / NULLIF(COUNT(DISTINCT v.id), 0), 0) as ticket_medio,
      COUNT(CASE WHEN p.tipo = 'ser' THEN 1 END) as servicos,
      COUNT(CASE WHEN p.tipo IN ('probar','proemp','proins') THEN 1 END) as produtos,
      COUNT(CASE WHEN p.tipo = 'ser' AND (p.categoria = 'extra' OR p.categoria IS NULL) THEN 1 END) as extra_qtd,
      COALESCE(SUM(CASE WHEN p.tipo = 'ser' AND (p.categoria = 'extra' OR p.categoria IS NULL) THEN vp.valor_total END), 0) as extra_valor
    FROM vendas v
    JOIN usuarios uu ON v.usuario = uu.id
    JOIN vendas_produtos vp ON vp.venda = v.id
    JOIN produtos p ON p.id = vp.produto
    WHERE ${unitCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status != 0
    GROUP BY DATE_FORMAT(v.data_criacao, '%Y-%m-%d')
    ORDER BY dia ASC
  `, [dataInicio, dataFimExcl]);
}

/** @deprecated use getEvolucaoDiaria */
export async function getFaturamentoDiario(extIds: number[], dataInicio: string, dataFim: string) {
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
    : `uu.unidade IN (${extIds.join(",")})`;

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
    FROM vendas v
    JOIN usuarios uu ON v.usuario = uu.id
    JOIN vendas_produtos vp ON vp.venda = v.id
    WHERE ${unitCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < DATE_ADD(?, INTERVAL 1 DAY)
      AND v.comanda_temp = 0
      AND v.status != 0
    GROUP BY DATE_FORMAT(v.data_criacao, '%Y-%m-%d')
    ORDER BY dia ASC
  `, [dataInicio, dataFim]);
}

// ─── Faturamento por produto/serviço ─────────────────────────────────────────

export async function getFaturamentoPorProduto(extIds: number[], dataInicio: string, dataFim: string) {
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
    : `uu.unidade IN (${extIds.join(",")})`;

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
    FROM vendas v
    JOIN usuarios uu ON v.usuario = uu.id
    JOIN vendas_produtos vp ON vp.venda = v.id
    JOIN produtos p ON p.id = vp.produto
    WHERE ${unitCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < DATE_ADD(?, INTERVAL 1 DAY)
      AND v.comanda_temp = 0
      AND v.cancelado_motivo IS NULL
      AND v.status != 0
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
  // O campo v.caixa identifica o barbeiro que realizou o atendimento
  // (v.usuario é quem registrou a venda, ex: recepcionista/caixa)
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `colab.unidade = ${extIds[0]}`
    : `colab.unidade IN (${extIds.join(",")})`;
  const unitCondV2 = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `uu2.unidade = ${extIds[0]}`
    : `uu2.unidade IN (${extIds.join(",")})`;
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);

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
          JOIN usuarios uu2 ON v2.usuario = uu2.id
          WHERE v2.cliente = v.cliente
            AND ${unitCondV2}
            AND v2.data_criacao < ?
            AND v2.comanda_temp = 0
            AND v2.status != 0
        ) THEN v.cliente
      END) as clientes_novos,
      COUNT(CASE WHEN p.tipo IN ('probar','proemp','proins') THEN 1 END) as produtos_qtd,
      COALESCE(SUM(CASE WHEN p.tipo IN ('probar','proemp','proins') THEN vp.valor_total END), 0) as produtos_valor
    FROM vendas_produtos vp
    JOIN usuarios colab ON colab.id = vp.colaborador
    JOIN vendas v ON v.id = vp.venda
    JOIN produtos p ON p.id = vp.produto
    WHERE ${unitCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status != 0
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
         AND v2.comanda_temp = 0 AND v2.cancelado_motivo IS NULL AND v2.status != 0) as total_visitas,
      (SELECT COALESCE(SUM(vp2.valor_total), 0) FROM vendas v2 
       JOIN usuarios u2 ON v2.usuario = u2.id 
       JOIN vendas_produtos vp2 ON vp2.venda = v2.id
       WHERE v2.cliente = c.id 
         AND (${extIds.length === 0 ? "1=1" : extIds.length === 1 ? `u2.unidade = ${extIds[0]}` : `u2.unidade IN (${extIds.join(",")})`})
         AND v2.comanda_temp = 0 AND v2.cancelado_motivo IS NULL AND v2.status != 0) as total_gasto
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
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
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

export async function getChurnPorBarbeiro(extIds: number[], dataInicio: string, dataFim: string) {
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
    : `uu.unidade IN (${extIds.join(",")})`;

  return queryExternal<{
    colaborador_id: number;
    colaborador_nome: string;
    total_clientes: number;
    ativos: number;
    em_risco: number;
    perdidos: number;
    one_shots: number;
    media_visitas: number;
    media_gasto: number;
  }>(`
    SELECT 
      uu.id as colaborador_id,
      uu.nome as colaborador_nome,
      COUNT(DISTINCT vp.venda) as total_clientes,
      COUNT(DISTINCT CASE WHEN DATEDIFF(NOW(), c.ultima_visita) <= 60 THEN v.cliente END) as ativos,
      COUNT(DISTINCT CASE WHEN DATEDIFF(NOW(), c.ultima_visita) BETWEEN 61 AND 90 THEN v.cliente END) as em_risco,
      COUNT(DISTINCT CASE WHEN DATEDIFF(NOW(), c.ultima_visita) > 90 THEN v.cliente END) as perdidos,
      COUNT(DISTINCT CASE WHEN (
        SELECT COUNT(*) FROM vendas v3 
        JOIN usuarios u3 ON v3.usuario = u3.id 
        WHERE v3.cliente = v.cliente 
          AND (${extIds.length === 0 ? "1=1" : extIds.length === 1 ? `u3.unidade = ${extIds[0]}` : `u3.unidade IN (${extIds.join(",")})`})
          AND v3.comanda_temp = 0 AND v3.cancelado_motivo IS NULL AND v3.status != 0
      ) = 1 THEN v.cliente END) as one_shots,
      AVG((
        SELECT COUNT(*) FROM vendas v4 
        JOIN usuarios u4 ON v4.usuario = u4.id 
        WHERE v4.cliente = v.cliente 
          AND (${extIds.length === 0 ? "1=1" : extIds.length === 1 ? `u4.unidade = ${extIds[0]}` : `u4.unidade IN (${extIds.join(",")})`})
          AND v4.comanda_temp = 0 AND v4.cancelado_motivo IS NULL AND v4.status != 0
      )) as media_visitas,
      AVG(c.consumo) as media_gasto
    FROM vendas v
    JOIN usuarios uu ON v.usuario = uu.id
    JOIN clientes c ON c.id = v.cliente
    JOIN vendas_produtos vp ON vp.venda = v.id
    WHERE ${unitCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < DATE_ADD(?, INTERVAL 1 DAY)
      AND v.comanda_temp = 0
      AND v.cancelado_motivo IS NULL
      AND v.status != 0
      AND v.cliente IS NOT NULL
      AND v.cliente != 2
    GROUP BY uu.id, uu.nome
    HAVING total_clientes > 0
    ORDER BY total_clientes DESC
  `, [dataInicio, dataFim]);
}

// ─── Cadência de visitas ──────────────────────────────────────────────────────

export async function getCadenciaVisitas(extIds: number[]) {
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
    : `uu.unidade IN (${extIds.join(",")})`;

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
      JOIN usuarios uu ON v.usuario = uu.id
      WHERE ${unitCond}
        AND v.comanda_temp = 0
        AND v.cancelado_motivo IS NULL
        AND v.status != 0
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
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
    : `uu.unidade IN (${extIds.join(",")})`;

  // Cohort por mês de primeira visita
  return queryExternal<{
    cohort: string;
    total_entrada: number;
    voltaram: number;
    taxa_retencao: number;
  }>(`
    SELECT 
      DATE_FORMAT(MIN(v.data_criacao), '%Y-%m') as cohort,
      COUNT(DISTINCT v.cliente) as total_entrada,
      COUNT(DISTINCT CASE WHEN 
        (SELECT COUNT(*) FROM vendas v2 
         JOIN usuarios uu2 ON v2.usuario = uu2.id
         WHERE v2.cliente = v.cliente 
           AND (${unitCond.replace(/uu\./g, "uu2.")})
           AND v2.comanda_temp = 0 AND v2.cancelado_motivo IS NULL AND v2.status != 0
        ) > 1 THEN v.cliente END) as voltaram,
      ROUND(
        COUNT(DISTINCT CASE WHEN 
          (SELECT COUNT(*) FROM vendas v2 
           JOIN usuarios uu2 ON v2.usuario = uu2.id
           WHERE v2.cliente = v.cliente 
             AND (${unitCond.replace(/uu\./g, "uu2.")})
             AND v2.comanda_temp = 0 AND v2.cancelado_motivo IS NULL AND v2.status != 0
          ) > 1 THEN v.cliente END) * 100.0 / 
        NULLIF(COUNT(DISTINCT v.cliente), 0), 1
      ) as taxa_retencao
    FROM vendas v
    JOIN usuarios uu ON v.usuario = uu.id
    WHERE ${unitCond}
      AND v.comanda_temp = 0
      AND v.cancelado_motivo IS NULL
      AND v.status != 0
      AND v.cliente IS NOT NULL
      AND v.cliente != 2
      AND v.data_criacao >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
    GROUP BY DATE_FORMAT(MIN(v.data_criacao), '%Y-%m')
    ORDER BY cohort DESC
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
  // Usa vp.colaborador (barbeiro que executou o serviço) em vez de v.usuario (caixa/recepcionista)
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `colab.unidade = ${extIds[0]}`
    : `colab.unidade IN (${extIds.join(",")})`;

  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);

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
    JOIN produtos p ON p.id = vp.produto
    WHERE ${unitCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status != 0
    GROUP BY colab.id, colab.nome
    ORDER BY faturamento DESC
  `, [dataInicio, dataFimExcl]);
}

// ─── Top Itens (serviços e produtos) por período ──────────────────────────────

export async function getTopItens(extIds: number[], dataInicio: string, dataFim: string) {
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
    : `uu.unidade IN (${extIds.join(",")})`;

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
    FROM vendas v
    JOIN usuarios uu ON v.usuario = uu.id
    JOIN vendas_produtos vp ON vp.venda = v.id
    JOIN produtos p ON p.id = vp.produto
    WHERE ${unitCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < DATE_ADD(?, INTERVAL 1 DAY)
      AND v.comanda_temp = 0
      AND v.cancelado_motivo IS NULL
      AND v.status != 0
    GROUP BY LOWER(TRIM(p.nome)), p.tipo, p.categoria
    ORDER BY total DESC
    LIMIT 20
  `, [dataInicio, dataFim]);
}

// ─── Composição por grupo (Fat. Base, Extra, Produtos) ───────────────────────

export async function getComposicaoGrupo(extIds: number[], dataInicio: string, dataFim: string) {
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
    : `uu.unidade IN (${extIds.join(",")})`;

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
    FROM vendas v
    JOIN usuarios uu ON v.usuario = uu.id
    JOIN vendas_produtos vp ON vp.venda = v.id
    JOIN produtos p ON p.id = vp.produto
    WHERE ${unitCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < DATE_ADD(?, INTERVAL 1 DAY)
      AND v.comanda_temp = 0
      AND v.cancelado_motivo IS NULL
      AND v.status != 0
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
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
    : `uu.unidade IN (${extIds.join(",")})`;

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
    FROM vendas v
    JOIN usuarios uu ON v.usuario = uu.id
    JOIN vendas_produtos vp ON vp.venda = v.id
    JOIN produtos p ON p.id = vp.produto
    WHERE ${unitCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < DATE_ADD(?, INTERVAL 1 DAY)
      AND v.comanda_temp = 0
      AND v.cancelado_motivo IS NULL
      AND v.status != 0
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
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
    : `uu.unidade IN (${extIds.join(",")})`;

  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);

  return queryExternal<{
    dia_semana: number;
    total: number;
    atendimentos: number;
  }>(`
    SELECT 
      DAYOFWEEK(v.data_criacao) as dia_semana,
      COALESCE(SUM(vp.valor_total), 0) as total,
      COUNT(DISTINCT v.id) as atendimentos
    FROM vendas v
    JOIN usuarios uu ON v.usuario = uu.id
    JOIN vendas_produtos vp ON vp.venda = v.id
    WHERE ${unitCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status != 0
    GROUP BY DAYOFWEEK(v.data_criacao)
    ORDER BY dia_semana ASC
  `, [dataInicio, dataFimExcl]);
}

// ─── Faturamento por faixa horária ───────────────────────────────────────────

export async function getFaturamentoPorFaixaHoraria(extIds: number[], dataInicio: string, dataFim: string) {
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
    : `uu.unidade IN (${extIds.join(",")})`;

  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);

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
    FROM vendas v
    JOIN usuarios uu ON v.usuario = uu.id
    JOIN vendas_produtos vp ON vp.venda = v.id
    WHERE ${unitCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status != 0
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
