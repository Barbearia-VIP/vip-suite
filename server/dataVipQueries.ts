/**
 * dataVipQueries.ts
 * Queries do módulo Data VIP usando o banco LOCAL (tabelas sync_*).
 * Fase 4: migração completa do banco externo SSH para banco local.
 * Latência: <10ms (banco local) vs 200-800ms (SSH externo).
 */

import mysql from "mysql2/promise";

// ─── Conexão local ────────────────────────────────────────────────────────────

let _localPool: mysql.Pool | null = null;

function getLocalPool(): mysql.Pool {
  if (!_localPool) {
    _localPool = mysql.createPool({
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      timezone: "Z",
    });
  }
  return _localPool;
}

async function queryLocal<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const pool = getLocalPool();
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ExtUnit {
  internalId: number;
  externalId: number;
}

// ─── Helpers de filtro por unidade ───────────────────────────────────────────

/** Filtro direto por unidade_id nas tabelas sync_* (sem JOIN com usuarios) */
function unitIdCond(extIds: number[], alias = "v"): string {
  if (extIds.length === 0) return "1=1";
  if (extIds.length === 1) return `${alias}.unidade_id = ${extIds[0]}`;
  return `${alias}.unidade_id IN (${extIds.join(",")})`;
}

/** Monta cláusula IN para colaborador em sync_vendas_produtos */
function colabInCond(colabIds: number[], alias = "vp"): string {
  if (colabIds.length === 0) return "1=0";
  if (colabIds.length === 1) return `${alias}.colaborador = ${colabIds[0]}`;
  return `${alias}.colaborador IN (${colabIds.join(",")})`;
}

/** Monta cláusula IN para usuario em sync_vendas */
function usuarioInCond(colabIds: number[], alias = "v"): string {
  if (colabIds.length === 0) return "1=0";
  if (colabIds.length === 1) return `${alias}.usuario = ${colabIds[0]}`;
  return `${alias}.usuario IN (${colabIds.join(",")})`;
}

// ─── Helper: busca IDs dos colaboradores de uma unidade ──────────────────────
/**
 * Retorna os IDs de todos os colaboradores da(s) unidade(s) via sync_usuarios.
 * Usado como filtro secundário quando necessário (ex: filtrar por colaborador específico).
 * Para filtros de unidade, preferir unitIdCond() diretamente.
 */
export async function getColaboradoresIds(extIds: number[]): Promise<number[]> {
  if (extIds.length === 0) return [];
  const cond = extIds.length === 1
    ? `unidade = ${extIds[0]}`
    : `unidade IN (${extIds.join(",")})`;
  const rows = await queryLocal<{ id: number }>(
    `SELECT id FROM sync_usuarios WHERE ${cond} AND status = 1`,
    []
  );
  return rows.map(r => Number(r.id));
}

// ─── KPIs em tempo real (mês ou range) ───────────────────────────────────────

async function getKpisRealtime(extIds: number[], ano: number, mes: number) {
  const dataInicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const proximoMes = mes === 12 ? 1 : mes + 1;
  const anoProximo = mes === 12 ? ano + 1 : ano;
  const dataFim = `${anoProximo}-${String(proximoMes).padStart(2, "0")}-01`;

  const vpUnit = unitIdCond(extIds, "vp");
  const vUnit  = unitIdCond(extIds, "v");
  const v2Unit = unitIdCond(extIds, "v2");

  const rows = await queryLocal<{
    total_vendas: number;
    quantidade_vendas: number;
    total_clientes_unicos: number;
  }>(`
    SELECT
      COALESCE(SUM(v.valor_total), 0) as total_vendas,
      COUNT(DISTINCT v.id) as quantidade_vendas,
      COUNT(DISTINCT v.cliente) as total_clientes_unicos
    FROM sync_vendas v
    WHERE ${vUnit}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
  `, [dataInicio, dataFim]);

  const novosRows = await queryLocal<{ novos: number }>(`
    SELECT COUNT(DISTINCT v.cliente) as novos
    FROM sync_vendas v
    WHERE ${vUnit}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
      AND v.cliente IS NOT NULL
      AND v.cliente NOT IN (
        SELECT DISTINCT v2.cliente
        FROM sync_vendas v2
        WHERE ${v2Unit}
          AND v2.data_criacao < ?
          AND v2.comanda_temp = 0
          AND v2.status = 1
          AND v2.cliente IS NOT NULL
      )
  `, [dataInicio, dataFim, dataInicio]);

  const servicosRows = await queryLocal<{
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
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON vp.venda = v.id
    JOIN sync_produtos p ON p.id = vp.produto
    WHERE ${vpUnit}
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
    ticket_medio_por_venda: Number(rows[0]?.quantidade_vendas ?? 0) > 0
      ? Number(rows[0]?.total_vendas ?? 0) / Number(rows[0]?.quantidade_vendas)
      : 0,
    total_clientes_novos: novos,
    total_clientes_antigos: Math.max(0, totalClientes - novos),
    total_clientes_unicos: totalClientes,
    ...(servicosRows[0] ?? {}),
  };
}

export async function getKpisRealtimeByRange(
  extIds: number[],
  dataInicio: string,
  dataFim: string,
  colaboradorId?: number
) {
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);

  // Se colaboradorId fornecido, filtra apenas ele; senão filtra por unidade
  let vpCond: string;
  let vCond: string;
  let v2Cond: string;

  if (colaboradorId) {
    vpCond = `vp.colaborador = ${colaboradorId}`;
    vCond  = `v.usuario = ${colaboradorId}`;
    v2Cond = unitIdCond(extIds, "v2");
  } else {
    vpCond = unitIdCond(extIds, "vp");
    vCond  = unitIdCond(extIds, "v");
    v2Cond = unitIdCond(extIds, "v2");
  }

  const rows = await queryLocal<{
    total_vendas: number;
    quantidade_vendas: number;
    total_clientes_unicos: number;
  }>(`
    SELECT
      COALESCE(SUM(v.valor_total), 0) as total_vendas,
      COUNT(DISTINCT v.id) as quantidade_vendas,
      COUNT(DISTINCT v.cliente) as total_clientes_unicos
    FROM sync_vendas v
    WHERE ${vCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
  `, [dataInicio, dataFimExcl]);

  const novosRows = await queryLocal<{ novos: number }>(`
    SELECT COUNT(DISTINCT v.cliente) as novos
    FROM sync_vendas v
    WHERE ${vCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
      AND v.cliente IS NOT NULL
      AND v.cliente NOT IN (
        SELECT DISTINCT v2.cliente
        FROM sync_vendas v2
        WHERE ${v2Cond}
          AND v2.data_criacao < ?
          AND v2.comanda_temp = 0
          AND v2.status = 1
          AND v2.cliente IS NOT NULL
      )
  `, [dataInicio, dataFimExcl, dataInicio]);

  const servicosRows = await queryLocal<{
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
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON vp.venda = v.id
    JOIN sync_produtos p ON p.id = vp.produto
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
  const agora = new Date();
  const anoAtual = agora.getFullYear();
  const mesAtual = agora.getMonth() + 1;
  const isMesAtual = ano === anoAtual && mes === mesAtual;

  const cur = (await getKpisRealtime(extIds, ano, mes)) as Record<string, number>;
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

// ─── Dias trabalhados ─────────────────────────────────────────────────────────

export async function getDiasTrabalhados(
  extIds: number[],
  dataInicio: string,
  dataFim: string
): Promise<{ diasTrabalhados: number; faturamentoTotal: number }> {
  const vpUnit = unitIdCond(extIds, "vp");
  const rows = await queryLocal<{ dias: number; total: number }>(`
    SELECT
      COUNT(DISTINCT DATE(v.data_criacao)) as dias,
      COALESCE(SUM(vp.valor_total), 0) as total
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON v.id = vp.venda
    WHERE ${vpUnit}
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

export async function getDiasTrabalhadosMedia(
  extIds: number[],
  dataInicio: string,
  dataFim: string
): Promise<{ mediaDias: number }> {
  const vUnit = unitIdCond(extIds, "v");
  const rows = await queryLocal<{ mes: string; dias: number }>(`
    SELECT
      DATE_FORMAT(v.data_criacao, '%Y-%m') as mes,
      COUNT(DISTINCT DATE(v.data_criacao)) as dias
    FROM sync_vendas v
    WHERE ${vUnit}
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

export async function getServicosExtra(
  extIds: number[],
  dataInicio: string,
  dataFim: string,
  nomesBase: string[] = []
): Promise<{ qtdExtra: number; totalExtra: number }> {
  const vpUnit = unitIdCond(extIds, "vp");
  let extraCond: string;
  if (nomesBase.length > 0) {
    const placeholders = nomesBase.map(() => "?").join(",");
    extraCond = `p.tipo = 'ser' AND p.nome NOT IN (${placeholders})`;
  } else {
    extraCond = `p.tipo = 'ser' AND (p.categoria = 'extra' OR p.categoria IS NULL)`;
  }
  const params: unknown[] = [...(nomesBase.length > 0 ? nomesBase : []), dataInicio, dataFim];
  const rows = await queryLocal<{ qtd: number; total: number }>(`
    SELECT
      COUNT(*) as qtd,
      COALESCE(SUM(vp.valor_total), 0) as total
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON vp.venda = v.id
    JOIN sync_produtos p ON p.id = vp.produto
    WHERE ${vpUnit}
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

// ─── Faturamento mensal histórico ─────────────────────────────────────────────

export async function getFaturamentoMensal(extIds: number[], meses: number = 12) {
  const agora = new Date();
  const anoAtual = agora.getFullYear();
  const mesAtual = agora.getMonth() + 1;
  const vpUnit = unitIdCond(extIds, "vp");
  const vUnit  = unitIdCond(extIds, "v");
  const v2Unit = unitIdCond(extIds, "v2");

  // Histórico: meses fechados via sync_vendas
  const dataInicioHist = new Date(anoAtual, mesAtual - meses, 1);
  const dataInicioHistStr = `${dataInicioHist.getFullYear()}-${String(dataInicioHist.getMonth() + 1).padStart(2, "0")}-01`;
  const dataFimHistStr = `${anoAtual}-${String(mesAtual).padStart(2, "0")}-01`;

  const historico = await queryLocal<{
    ano: number;
    mes: number;
    total_vendas: number;
    quantidade_vendas: number;
    ticket_medio_por_venda: number;
    total_clientes_novos: number;
    total_clientes_antigos: number;
  }>(`
    SELECT
      YEAR(v.data_criacao) as ano,
      MONTH(v.data_criacao) as mes,
      COALESCE(SUM(v.valor_total), 0) as total_vendas,
      COUNT(DISTINCT v.id) as quantidade_vendas,
      COALESCE(SUM(v.valor_total) / NULLIF(COUNT(DISTINCT v.id), 0), 0) as ticket_medio_por_venda,
      COUNT(DISTINCT CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM sync_vendas v2
          WHERE v2.cliente = v.cliente
            AND ${v2Unit}
            AND v2.data_criacao < DATE_FORMAT(v.data_criacao, '%Y-%m-01')
            AND v2.comanda_temp = 0
            AND v2.status = 1
        ) THEN v.cliente
      END) as total_clientes_novos,
      COUNT(DISTINCT CASE
        WHEN EXISTS (
          SELECT 1 FROM sync_vendas v2
          WHERE v2.cliente = v.cliente
            AND ${v2Unit}
            AND v2.data_criacao < DATE_FORMAT(v.data_criacao, '%Y-%m-01')
            AND v2.comanda_temp = 0
            AND v2.status = 1
        ) THEN v.cliente
      END) as total_clientes_antigos
    FROM sync_vendas v
    WHERE ${vUnit}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
      AND NOT (YEAR(v.data_criacao) = ${anoAtual} AND MONTH(v.data_criacao) = ${mesAtual})
    GROUP BY YEAR(v.data_criacao), MONTH(v.data_criacao)
    ORDER BY ano DESC, mes DESC
    LIMIT ${Number(meses) - 1}
  `, [dataInicioHistStr, dataFimHistStr]);

  // Mês atual em tempo real
  const dataInicioAtual = `${anoAtual}-${String(mesAtual).padStart(2, "0")}-01`;
  const proximoMes = mesAtual === 12 ? 1 : mesAtual + 1;
  const anoProximo = mesAtual === 12 ? anoAtual + 1 : anoAtual;
  const dataFimAtual = `${anoProximo}-${String(proximoMes).padStart(2, "0")}-01`;

  const realtimeRows = await queryLocal<{
    total_vendas: number;
    quantidade_vendas: number;
    ticket_medio_por_venda: number;
    total_clientes_novos: number;
    total_clientes_antigos: number;
  }>(`
    SELECT
      COALESCE(SUM(v.valor_total), 0) as total_vendas,
      COUNT(DISTINCT v.id) as quantidade_vendas,
      COALESCE(SUM(v.valor_total) / NULLIF(COUNT(DISTINCT v.id), 0), 0) as ticket_medio_por_venda,
      COUNT(DISTINCT CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM sync_vendas v2
          WHERE v2.cliente = v.cliente
            AND ${v2Unit}
            AND v2.data_criacao < ?
            AND v2.comanda_temp = 0
            AND v2.status = 1
        ) THEN v.cliente
      END) as total_clientes_novos,
      COUNT(DISTINCT CASE
        WHEN EXISTS (
          SELECT 1 FROM sync_vendas v2
          WHERE v2.cliente = v.cliente
            AND ${v2Unit}
            AND v2.data_criacao < ?
            AND v2.comanda_temp = 0
            AND v2.status = 1
        ) THEN v.cliente
      END) as total_clientes_antigos
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON v.id = vp.venda
    WHERE ${vpUnit}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
  `, [dataInicioAtual, dataInicioAtual, dataInicioAtual, dataFimAtual]);

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

  return [mesAtualRow, ...historico];
}

// ─── Faturamento mensal detalhado ─────────────────────────────────────────────

export async function getFaturamentoMensalDetalhado(extIds: number[], meses: number = 12) {
  const agora = new Date();
  const anoAtual = agora.getFullYear();
  const mesAtual = agora.getMonth() + 1;
  const dataInicio = new Date(anoAtual, mesAtual - meses, 1);
  const dataInicioStr = `${dataInicio.getFullYear()}-${String(dataInicio.getMonth() + 1).padStart(2, "0")}-01`;
  const proximoMes = mesAtual === 12 ? 1 : mesAtual + 1;
  const anoProximo = mesAtual === 12 ? anoAtual + 1 : anoAtual;
  const dataFimStr = `${anoProximo}-${String(proximoMes).padStart(2, "0")}-01`;
  const vpUnit = unitIdCond(extIds, "vp");

  const rows = await queryLocal<{
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
      COUNT(DISTINCT CASE WHEN sc.data_criacao >= DATE_FORMAT(v.data_criacao, '%Y-%m-01') THEN v.cliente END) as clientes_novos,
      COUNT(CASE WHEN p.tipo = 'ser' AND (p.categoria = 'extra' OR p.categoria IS NULL OR p.categoria != 'base') AND p.categoria != 'base' THEN 1 END) as extras_qtd,
      COALESCE(SUM(CASE WHEN p.tipo = 'ser' AND p.categoria != 'base' AND p.categoria IS NOT NULL THEN vp.valor_total ELSE 0 END), 0) as extras_valor,
      COUNT(CASE WHEN p.tipo = 'ser' THEN 1 END) as servicos_total,
      COUNT(CASE WHEN p.tipo IN ('probar','proemp','proins') THEN 1 END) as produtos_qtd,
      COALESCE(SUM(CASE WHEN p.tipo IN ('probar','proemp','proins') THEN vp.valor_total ELSE 0 END), 0) as produtos_valor
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON v.id = vp.venda
    JOIN sync_produtos p ON p.id = vp.produto
    LEFT JOIN sync_clientes sc ON sc.id = v.cliente
    WHERE ${vpUnit}
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
    periodo: `${r.ano}-${String(Number(r.mes)).padStart(2, "0")}`,
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

export async function getFaturamentoMensalDetalhadoFiltrado(
  extIds: number[],
  dataInicioStr: string,
  dataFimStr: string,
  colaboradorId?: number,
  _tipo?: string
) {
  let vpCond: string;
  if (colaboradorId) {
    vpCond = `vp.colaborador = ${colaboradorId}`;
  } else {
    vpCond = unitIdCond(extIds, "vp");
  }

  const rows = await queryLocal<{
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
      COUNT(DISTINCT CASE WHEN sc.data_criacao >= DATE_FORMAT(v.data_criacao, '%Y-%m-01') THEN v.cliente END) as clientes_novos,
      COUNT(CASE WHEN p.tipo = 'ser' AND p.categoria != 'base' THEN 1 END) as extras_qtd,
      COALESCE(SUM(CASE WHEN p.tipo = 'ser' AND p.categoria != 'base' AND p.categoria IS NOT NULL THEN vp.valor_total ELSE 0 END), 0) as extras_valor,
      COUNT(CASE WHEN p.tipo = 'ser' THEN 1 END) as servicos_total,
      COUNT(CASE WHEN p.tipo IN ('probar','proemp','proins') THEN 1 END) as produtos_qtd,
      COALESCE(SUM(CASE WHEN p.tipo IN ('probar','proemp','proins') THEN vp.valor_total ELSE 0 END), 0) as produtos_valor
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON v.id = vp.venda
    JOIN sync_produtos p ON p.id = vp.produto
    LEFT JOIN sync_clientes sc ON sc.id = v.cliente
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
    periodo: `${r.ano}-${String(Number(r.mes)).padStart(2, "0")}`,
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

// ─── Lista colaboradores ──────────────────────────────────────────────────────

export async function getListaColaboradoresMensal(
  extIds: number[],
  dataInicio?: string,
  dataFim?: string
) {
  const vpUnit = unitIdCond(extIds, "vp");
  const periodoCond = (dataInicio && dataFim)
    ? `AND v.data_criacao >= ? AND v.data_criacao < ?`
    : "";
  const params: string[] = (dataInicio && dataFim) ? [dataInicio, dataFim] : [];

  return queryLocal<{
    colaborador_id: number;
    colaborador_nome: string;
    tipo: string;
  }>(`
    SELECT DISTINCT
      su.id as colaborador_id,
      su.nome as colaborador_nome,
      'colaborador' as tipo
    FROM sync_vendas_produtos vp
    JOIN sync_usuarios su ON su.id = vp.colaborador
    JOIN sync_vendas v ON v.id = vp.venda
    WHERE ${vpUnit}
      AND v.comanda_temp = 0
      AND v.status = 1
      AND v.cancelado_motivo IS NULL
      AND su.nome IS NOT NULL
      AND su.nome != ''
      ${periodoCond}
    ORDER BY su.nome ASC
  `, params);
}

// ─── Faturamento por forma de pagamento ──────────────────────────────────────

export async function getFaturamentoPorPagamento(extIds: number[], dataInicio: string, dataFim: string) {
  const vUnit = unitIdCond(extIds, "v");

  return queryLocal<{
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
    FROM sync_vendas v
    JOIN sync_vendas_pagamentos vpag ON vpag.venda = v.id
    JOIN sync_formas_pagamentos fp ON fp.id = vpag.forma_pagamento
    WHERE ${vUnit}
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
  dataFimIncl: string
) {
  const dataFimExcl = new Date(new Date(dataFimIncl + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const vpUnit = unitIdCond(extIds, "vp");
  const v2Unit = unitIdCond(extIds, "v2");

  return queryLocal<{
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
          SELECT 1 FROM sync_vendas v2
          WHERE v2.cliente = v.cliente
            AND ${v2Unit}
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
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON v.id = vp.venda
    JOIN sync_produtos p ON p.id = vp.produto
    WHERE ${vpUnit}
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
  const vpUnit = unitIdCond(extIds, "vp");
  return queryLocal<{
    dia: string;
    faturamento: number;
    atendimentos: number;
    clientes: number;
  }>(`
    SELECT
      DATE_FORMAT(v.data_criacao, '%Y-%m-%d') as dia,
      COALESCE(SUM(v.valor_total), 0) as faturamento,
      COUNT(DISTINCT v.id) as atendimentos,
      COUNT(DISTINCT v.cliente) as clientes
    FROM sync_vendas v
    WHERE ${vpUnit}
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
  const vpUnit = unitIdCond(extIds, "vp");
  return queryLocal<{
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
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON v.id = vp.venda
    JOIN sync_produtos p ON p.id = vp.produto
    WHERE ${vpUnit}
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

// ─── Colaboradores (por range de datas) ──────────────────────────────────────

export async function getColaboradores(extIds: number[], ano: number, mes: number) {
  const dataInicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const proximoMes = mes === 12 ? 1 : mes + 1;
  const anoProximo = mes === 12 ? ano + 1 : ano;
  const dataFim = `${anoProximo}-${String(proximoMes).padStart(2, "0")}-01`;
  return getColaboradoresByRange(extIds, dataInicio, dataFim.slice(0, 10));
}

export async function getColaboradoresByRange(extIds: number[], dataInicio: string, dataFim: string) {
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const vpUnit = unitIdCond(extIds, "vp");
  const v2Unit = unitIdCond(extIds, "v2");

  return queryLocal<{
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
          SELECT 1 FROM sync_vendas v2
          WHERE v2.cliente = v.cliente
            AND ${v2Unit}
            AND v2.data_criacao < ?
            AND v2.comanda_temp = 0
            AND v2.status = 1
        ) THEN v.cliente
      END) as clientes_novos,
      COUNT(CASE WHEN p.tipo IN ('probar','proemp','proins') THEN 1 END) as produtos_qtd,
      COALESCE(SUM(CASE WHEN p.tipo IN ('probar','proemp','proins') THEN vp.valor_total END), 0) as produtos_valor
    FROM sync_vendas_produtos vp
    JOIN sync_usuarios colab ON colab.id = vp.colaborador
    JOIN sync_vendas v ON v.id = vp.venda
    JOIN sync_produtos p ON p.id = vp.produto
    WHERE ${vpUnit}
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
  const dataInicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const proximoMes = mes === 12 ? 1 : mes + 1;
  const anoProximo = mes === 12 ? ano + 1 : ano;
  const dataFim = `${anoProximo}-${String(proximoMes).padStart(2, "0")}-01`;
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `v.unidade_id = ${extIds[0]}`
    : `v.unidade_id IN (${extIds.join(",")})`;

  return queryLocal<{
    unidade_id: number;
    unidade_nome: string;
    total_vendas: number;
    quantidade_vendas: number;
    ticket_medio_por_venda: number;
    total_clientes_novos: number;
    total_clientes_antigos: number;
  }>(`
    SELECT
      v.unidade_id,
      CONCAT('Unidade ', v.unidade_id) as unidade_nome,
      COALESCE(SUM(v.valor_total), 0) as total_vendas,
      COUNT(DISTINCT v.id) as quantidade_vendas,
      COALESCE(SUM(v.valor_total) / NULLIF(COUNT(DISTINCT v.id), 0), 0) as ticket_medio_por_venda,
      0 as total_clientes_novos,
      0 as total_clientes_antigos
    FROM sync_vendas v
    WHERE ${unitCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
    GROUP BY v.unidade_id
    ORDER BY total_vendas DESC
  `, [dataInicio, dataFim]);
}

// ─── Clientes (Raio X) ────────────────────────────────────────────────────────

export async function getClientesStatus(extIds: number[]) {
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `ultima_visita_unidade = ${extIds[0]}`
    : `ultima_visita_unidade IN (${extIds.join(",")})`;

  const rows = await queryLocal<{
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
    FROM sync_clientes
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
  const vUnit = unitIdCond(extIds, "v2");

  return queryLocal<{
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
      (SELECT COUNT(*) FROM sync_vendas v2
       WHERE v2.cliente = c.id
         AND ${vUnit}
         AND v2.comanda_temp = 0 AND v2.cancelado_motivo IS NULL AND v2.status = 1) as total_visitas,
      (SELECT COALESCE(SUM(vp2.valor_total), 0) FROM sync_vendas v2
       JOIN sync_vendas_produtos vp2 ON vp2.venda = v2.id
       WHERE v2.cliente = c.id
         AND ${vUnit}
         AND v2.comanda_temp = 0 AND v2.cancelado_motivo IS NULL AND v2.status = 1) as total_gasto
    FROM sync_clientes c
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
  const vUnit = unitIdCond(extIds, "v");

  const statusRows = await queryLocal<{
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
    FROM sync_clientes
    WHERE ${unitCond} AND status = 1 AND ultima_visita IS NOT NULL
    GROUP BY status_label
  `);

  const statusMap: Record<string, number> = {};
  for (const r of statusRows) statusMap[r.status_label] = Number(r.total);

  const oneShotRows = await queryLocal<{ total: number }>(`
    SELECT COUNT(DISTINCT c.id) as total
    FROM sync_clientes c
    WHERE ${unitCond} AND c.status = 1
      AND (
        SELECT COUNT(*) FROM sync_vendas v
        WHERE v.cliente = c.id
          AND ${vUnit}
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

// ─── Cadência de visitas ──────────────────────────────────────────────────────

export async function getCadenciaVisitas(extIds: number[]) {
  const vUnit = unitIdCond(extIds, "v");

  return queryLocal<{
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
      FROM sync_vendas v
      WHERE ${vUnit}
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

  const rows = await queryLocal<{
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
    FROM sync_clientes
    WHERE ${unitCond} AND status = 1 AND ultima_visita IS NOT NULL
    GROUP BY faixa_dias
    ORDER BY MIN(DATEDIFF(NOW(), ultima_visita))
  `);
  return rows;
}

// ─── Cohort de clientes ───────────────────────────────────────────────────────

export async function getCohortClientes(extIds: number[]) {
  const vUnit  = unitIdCond(extIds, "v");
  const v2Unit = unitIdCond(extIds, "v2");

  return queryLocal<{
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
      FROM sync_vendas v
      WHERE ${vUnit}
        AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
        AND v.cliente IS NOT NULL AND v.cliente != 2
        AND v.data_criacao >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY v.cliente
    ) primeira_visita
    LEFT JOIN (
      SELECT DISTINCT v2.cliente
      FROM sync_vendas v2
      WHERE ${v2Unit}
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

// ─── Ações de reativação ──────────────────────────────────────────────────────

export async function getAcoesReativacao(extIds: number[], limit: number = 100) {
  const unitCond = extIds.length === 0 ? "1=1"
    : extIds.length === 1 ? `c.ultima_visita_unidade = ${extIds[0]}`
    : `c.ultima_visita_unidade IN (${extIds.join(",")})`;

  return queryLocal<{
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
    FROM sync_clientes c
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
  const dataInicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const proximoMes = mes === 12 ? 1 : mes + 1;
  const anoProximo = mes === 12 ? ano + 1 : ano;
  const dataFim = `${anoProximo}-${String(proximoMes).padStart(2, "0")}-01`;
  const vpUnit = unitIdCond(extIds, "vp");

  return queryLocal<{
    id: number;
    nome: string;
    unidade_id: number;
  }>(`
    SELECT DISTINCT su.id, su.nome, vp.unidade_id
    FROM sync_vendas_produtos vp
    JOIN sync_usuarios su ON su.id = vp.colaborador
    JOIN sync_vendas v ON v.id = vp.venda
    WHERE ${vpUnit}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
      AND su.visivel_agenda != 'nenhuma'
    ORDER BY su.nome ASC
  `, [dataInicio, dataFim]);
}

// ─── Top Barbeiros por período ────────────────────────────────────────────────

export async function getTopBarbeiros(extIds: number[], dataInicio: string, dataFim: string) {
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const vpUnit = unitIdCond(extIds, "vp");

  return queryLocal<{
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
    FROM sync_vendas_produtos vp
    JOIN sync_usuarios colab ON colab.id = vp.colaborador
    JOIN sync_vendas v ON v.id = vp.venda
    WHERE ${vpUnit}
      AND colab.visivel_agenda != 'nenhuma'
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
    GROUP BY colab.id, colab.nome
    ORDER BY faturamento DESC
  `, [dataInicio, dataFimExcl]);
}

// ─── Top Itens ────────────────────────────────────────────────────────────────

export async function getTopItens(extIds: number[], dataInicio: string, dataFim: string) {
  const vpUnit = unitIdCond(extIds, "vp");

  return queryLocal<{
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
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON v.id = vp.venda
    JOIN sync_produtos p ON p.id = vp.produto
    WHERE ${vpUnit}
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

// ─── Composição por grupo ─────────────────────────────────────────────────────

export async function getComposicaoGrupo(extIds: number[], dataInicio: string, dataFim: string) {
  const vpUnit = unitIdCond(extIds, "vp");

  return queryLocal<{
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
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON v.id = vp.venda
    JOIN sync_produtos p ON p.id = vp.produto
    WHERE ${vpUnit}
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

// ─── KPIs simples de um período ───────────────────────────────────────────────

export async function getKpisPeriodo(extIds: number[], dataInicio: string, dataFim: string) {
  const vpUnit = unitIdCond(extIds, "vp");

  const rows = await queryLocal<{
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
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON v.id = vp.venda
    JOIN sync_produtos p ON p.id = vp.produto
    WHERE ${vpUnit}
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
  const vpUnit = unitIdCond(extIds, "vp");

  return queryLocal<{
    dia_semana: number;
    total: number;
    atendimentos: number;
  }>(`
    SELECT
      DAYOFWEEK(v.data_criacao) as dia_semana,
      COALESCE(SUM(v.valor_total), 0) as total,
      COUNT(DISTINCT v.id) as atendimentos
    FROM sync_vendas v
    WHERE ${vpUnit}
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
  const vpUnit = unitIdCond(extIds, "vp");

  return queryLocal<{
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
      COALESCE(SUM(v.valor_total), 0) as total,
      COUNT(DISTINCT v.id) as atendimentos
    FROM sync_vendas v
    WHERE ${vpUnit}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
    GROUP BY faixa, hora_inicio
    ORDER BY hora_inicio ASC
  `, [dataInicio, dataFimExcl]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAINEL DE CLIENTES
// ═══════════════════════════════════════════════════════════════════════════════

export async function getClientesKpis(extIds: number[], dataInicio: string, dataFim: string, colaboradorId?: number | null) {
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);

  let vpCond: string;
  let vCond: string;
  const v2Cond = unitIdCond(extIds, "v2");
  const v3Cond = unitIdCond(extIds, "v3");

  if (colaboradorId) {
    vpCond = `vp.colaborador = ${colaboradorId}`;
    vCond  = `v.usuario = ${colaboradorId}`;
  } else {
    vpCond = unitIdCond(extIds, "vp");
    vCond  = unitIdCond(extIds, "v");
  }

  const rows = await queryLocal<{
    total_clientes: number;
    total_atendimentos: number;
    valor_total: number;
  }>(`
    SELECT
      COUNT(DISTINCT v.cliente) as total_clientes,
      COUNT(DISTINCT v.id) as total_atendimentos,
      COALESCE(SUM(vp.valor_total), 0) as valor_total
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON v.id = vp.venda
    WHERE ${vpCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
      AND v.cliente IS NOT NULL
  `, [dataInicio, dataFimExcl]);

  const novosRows = await queryLocal<{ novos: number }>(`
    SELECT COUNT(DISTINCT v.cliente) as novos
    FROM sync_vendas v
    WHERE ${vCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
      AND v.cliente IS NOT NULL
      AND v.cliente NOT IN (
        SELECT DISTINCT v2.cliente
        FROM sync_vendas v2
        WHERE ${v2Cond}
          AND v2.data_criacao < ?
          AND v2.comanda_temp = 0
          AND v2.status = 1
          AND v2.cliente IS NOT NULL
      )
  `, [dataInicio, dataFimExcl, dataInicio]);

  const novosRetornaramRows = await queryLocal<{ retornaram: number }>(`
    SELECT COUNT(*) as retornaram
    FROM (
      SELECT v.cliente
      FROM sync_vendas v
      WHERE ${vCond}
        AND v.data_criacao >= ?
        AND v.data_criacao < ?
        AND v.comanda_temp = 0
        AND v.status = 1
        AND v.cliente IS NOT NULL
        AND v.cliente NOT IN (
          SELECT DISTINCT v2.cliente
          FROM sync_vendas v2
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

  const retencao30dRows = await queryLocal<{ retencao: number }>(`
    SELECT
      ROUND(
        100.0 * COUNT(DISTINCT CASE WHEN v2.id IS NOT NULL THEN v.cliente END)
        / NULLIF(COUNT(DISTINCT v.cliente), 0)
      , 1) as retencao
    FROM sync_vendas v
    LEFT JOIN sync_vendas v2 ON v2.cliente = v.cliente
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
        FROM sync_vendas v3
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

export async function getClientesDistribuicaoStatus(extIds: number[], colaboradorId?: number | null, dataInicio?: string, dataFim?: string) {
  let vCond: string;
  const v2Cond = unitIdCond(extIds, "v2");

  if (colaboradorId) {
    vCond = `v.usuario = ${colaboradorId}`;
  } else {
    vCond = unitIdCond(extIds, "v");
  }

  const ini = dataInicio ?? new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const fimExcl = dataFim
    ? new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const rows = await queryLocal<{ status_label: string; total: number }>(`
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
      FROM sync_vendas v
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

  const rowsSo1vez = await queryLocal<{ total: number }>(`
    SELECT COUNT(*) as total
    FROM (
      SELECT v.cliente
      FROM sync_vendas v
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

  const rowsFieis = await queryLocal<{ total: number }>(`
    SELECT COUNT(*) as total
    FROM (
      SELECT v.cliente
      FROM sync_vendas v
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

  const rowsNovos = await queryLocal<{ total: number }>(`
    SELECT COUNT(DISTINCT v.cliente) as total
    FROM sync_vendas v
    WHERE ${vCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
      AND v.cliente IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM sync_vendas v2
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

export async function getClientesEvolucaoMensal(extIds: number[], dataInicio: string, dataFim: string, colaboradorId?: number | null) {
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const v2Cond = unitIdCond(extIds, "v2");
  const vCond = colaboradorId ? `v.usuario = ${colaboradorId}` : unitIdCond(extIds, "v");

  const rows = await queryLocal<{
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
          SELECT 1 FROM sync_vendas v2
          WHERE v2.cliente = v.cliente
            AND ${v2Cond}
            AND v2.data_criacao < DATE_FORMAT(v.data_criacao, '%Y-%m-01')
            AND v2.comanda_temp = 0
            AND v2.status = 1
        ) THEN v.cliente
      END) as novos
    FROM sync_vendas v
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

export async function getClientesDistribuicaoFrequencia(extIds: number[], dataInicio: string, dataFim: string, colaboradorId?: number | null) {
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const vCond = colaboradorId ? `v.usuario = ${colaboradorId}` : unitIdCond(extIds, "v");

  const rows = await queryLocal<{ faixa: string; ordem: number; total: number }>(`
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
      FROM sync_vendas v
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

  return rows.map(r => ({ faixa: r.faixa, total: Number(r.total) }));
}

export async function getClientesDistribuicaoDiasSemVir(extIds: number[], dataInicio: string, dataFim: string, colaboradorId?: number | null) {
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const vCond = colaboradorId ? `v.usuario = ${colaboradorId}` : unitIdCond(extIds, "v");

  const rows = await queryLocal<{ faixa: string; total: number }>(`
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
      FROM sync_vendas v
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

export async function getClientesTop(extIds: number[], dataInicio: string, dataFim: string, limit = 10) {
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const vpUnit = unitIdCond(extIds, "vp");

  const rows = await queryLocal<{
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
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON v.id = vp.venda
    LEFT JOIN sync_clientes c ON c.id = v.cliente
    WHERE ${vpUnit}
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
      ultimaVisita: r.ultima_visita ? new Date(r.ultima_visita).toISOString().slice(0, 10) : null,
      diasSemVir: dias,
      status,
    };
  });
}

export async function getClientesLista(
  extIds: number[],
  dataInicio: string,
  dataFim: string,
  colaboradorId?: number | null,
  search?: string,
  limit = 50,
  offset = 0
) {
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const vpCond = colaboradorId ? `vp.colaborador = ${colaboradorId}` : unitIdCond(extIds, "vp");

  let searchCond = "";
  const params: unknown[] = [dataInicio, dataFimExcl];
  if (search && search.trim()) {
    searchCond = "AND (c.nome LIKE ? OR c.telefone LIKE ?)";
    params.push(`%${search.trim()}%`, `%${search.trim()}%`);
  }

  const rows = await queryLocal<{
    cliente_id: number;
    nome: string;
    telefone: string | null;
    visitas: number;
    valor_total: number;
    dias_sem_vir: number;
  }>(`
    SELECT
      v.cliente as cliente_id,
      COALESCE(c.nome, CONCAT('Cliente #', v.cliente)) as nome,
      c.telefone,
      COUNT(DISTINCT v.id) as visitas,
      COALESCE(SUM(vp.valor_total), 0) as valor_total,
      DATEDIFF(NOW(), MAX(v.data_criacao)) as dias_sem_vir
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON v.id = vp.venda
    LEFT JOIN sync_clientes c ON c.id = v.cliente
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

export async function getListaColaboradoresClientes(extIds: number[], dataInicio: string, dataFim: string) {
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const vpUnit = unitIdCond(extIds, "vp");

  const rows = await queryLocal<{ id: number; nome: string; total: number }>(`
    SELECT colab.id, colab.nome, COUNT(DISTINCT v.id) as total
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON vp.venda = v.id
    JOIN sync_usuarios colab ON vp.colaborador = colab.id
    WHERE ${vpUnit}
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

// ─── Detalhes de um cliente específico ───────────────────────────────────────

export async function getClienteDetalhes(extIds: number[], clienteId: number) {
  const vpUnit = unitIdCond(extIds, "vp");

  const kpiRows = await queryLocal<{
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
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON v.id = vp.venda
    LEFT JOIN sync_clientes c ON c.id = v.cliente
    WHERE ${vpUnit}
      AND v.cliente = ?
      AND v.comanda_temp = 0
      AND v.status = 1
  `, [clienteId]);

  if (!kpiRows.length || !kpiRows[0].total_visitas) return null;
  const kpi = kpiRows[0];

  const visitasRows = await queryLocal<{
    venda_id: number;
    data: Date;
    colaborador: string;
    valor: number;
    servicos: string;
  }>(`
    SELECT
      v.id as venda_id,
      v.data_criacao as data,
      COALESCE(su.nome, 'Desconhecido') as colaborador,
      COALESCE(SUM(vp.valor_total), 0) as valor,
      GROUP_CONCAT(DISTINCT vp.descricao ORDER BY vp.descricao SEPARATOR ', ') as servicos
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON v.id = vp.venda
    LEFT JOIN sync_usuarios su ON vp.colaborador = su.id
    LEFT JOIN sync_clientes c ON c.id = v.cliente
    WHERE ${vpUnit}
      AND v.cliente = ?
      AND v.comanda_temp = 0
      AND v.status = 1
    GROUP BY v.id, v.data_criacao, su.nome
    ORDER BY v.data_criacao DESC
    LIMIT 20
  `, [clienteId]);

  const servicosRows = await queryLocal<{
    servico: string;
    quantidade: number;
    valor_total: number;
  }>(`
    SELECT
      p.nome as servico,
      COUNT(*) as quantidade,
      COALESCE(SUM(vp.valor_total), 0) as valor_total
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON v.id = vp.venda
    JOIN sync_produtos p ON p.id = vp.produto
    WHERE ${vpUnit}
      AND v.cliente = ?
      AND v.comanda_temp = 0
      AND v.status = 1
    GROUP BY p.nome
    ORDER BY quantidade DESC
    LIMIT 5
  `, [clienteId]);

  const evolRows = await queryLocal<{
    periodo: string;
    visitas: number;
    valor: number;
  }>(`
    SELECT
      DATE_FORMAT(v.data_criacao, '%Y-%m') as periodo,
      COUNT(DISTINCT v.id) as visitas,
      COALESCE(SUM(vp.valor_total), 0) as valor
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON v.id = vp.venda
    WHERE ${vpUnit}
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

// ─── Churn & Saúde da Base ────────────────────────────────────────────────────

export async function getChurnSaudeBase(extIds: number[], dataInicio: string, dataFim: string, janelaDias: number = 60, colaboradorId?: number | null) {
  let vCond: string;
  const v2Cond = unitIdCond(extIds, "v2");
  const v3Cond = unitIdCond(extIds, "v3");
  const v4Cond = unitIdCond(extIds, "v4");

  if (colaboradorId) {
    vCond = `v.usuario = ${colaboradorId}`;
  } else {
    vCond = unitIdCond(extIds, "v");
  }

  const janelaEntrada = Math.round(janelaDias * 1.833);
  const dataInicioJanela = new Date(new Date(dataInicio + "T12:00:00Z").getTime() - janelaEntrada * 86400000).toISOString().slice(0, 10);

  const rowsBase = await queryLocal<{ total: number; ticket_medio: number }>(`
    SELECT COUNT(DISTINCT v.cliente) as total,
           COALESCE(SUM(v.valor_total) / NULLIF(COUNT(DISTINCT v.id), 0), 0) as ticket_medio
    FROM sync_vendas v
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

  const rowsPerdidos = await queryLocal<{ total: number }>(`
    SELECT COUNT(DISTINCT base.cliente) as total
    FROM (
      SELECT DISTINCT v.cliente
      FROM sync_vendas v
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
      FROM sync_vendas v2
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
  const rowsResgatados = await queryLocal<{ total: number }>(`
    SELECT COUNT(DISTINCT base.cliente) as total
    FROM (
      SELECT DISTINCT v.cliente
      FROM sync_vendas v
      WHERE ${vCond}
        AND DATE(v.data_criacao) >= ?
        AND DATE(v.data_criacao) <= ?
        AND v.comanda_temp = 0
        AND v.status = 1
        AND v.cliente IS NOT NULL
        AND v.cliente != 2
    ) base
    WHERE NOT EXISTS (
      SELECT 1 FROM sync_vendas v2
      WHERE ${v2Cond}
        AND v2.cliente = base.cliente
        AND DATE(v2.data_criacao) >= ?
        AND DATE(v2.data_criacao) < ?
        AND v2.comanda_temp = 0
        AND v2.status = 1
    )
    AND EXISTS (
      SELECT 1 FROM sync_vendas v3
      WHERE ${v3Cond}
        AND v3.cliente = base.cliente
        AND DATE(v3.data_criacao) < ?
        AND v3.comanda_temp = 0
        AND v3.status = 1
    )
    AND EXISTS (
      SELECT 1 FROM sync_vendas v4
      WHERE ${v4Cond}
        AND v4.cliente = base.cliente
        AND DATE(v4.data_criacao) >= ?
        AND DATE(v4.data_criacao) <= ?
        AND v4.comanda_temp = 0
        AND v4.status = 1
    )
  `, [dataInicio, dataFim, dataInicioJanela, dataInicio, dataInicioJanela, dataFimBaseAtiva, dataFim]);
  const resgatados = Number(rowsResgatados[0]?.total ?? 0);
  const tempoMedioResgate = janelaEntrada;

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

export async function getChurnPorBarbeiro(extIds: number[], dataInicio: string, dataFim: string, janelaDias: number = 60, colaboradorId?: number | null) {
  const vpCond = colaboradorId ? `vp.colaborador = ${colaboradorId}` : unitIdCond(extIds, "vp");
  const v2Cond = unitIdCond(extIds, "v2");
  const v2bCond = unitIdCond(extIds, "v2"); // alias v2 = sync_vendas no subquery de exclusivos
  const janelaEntrada = Math.round(janelaDias * 1.833);
  const dataInicioJanela = new Date(new Date(dataInicio + "T12:00:00Z").getTime() - janelaEntrada * 86400000).toISOString().slice(0, 10);

  const rowsBase = await queryLocal<{
    colaborador_id: number;
    colaborador_nome: string;
    base_ativa: number;
  }>(`
    SELECT vp.colaborador as colaborador_id,
           COALESCE(su.nome, CONCAT('Colaborador ', vp.colaborador)) as colaborador_nome,
           COUNT(DISTINCT v.cliente) as base_ativa
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON vp.venda = v.id
    LEFT JOIN sync_usuarios su ON vp.colaborador = su.id
    WHERE ${vpCond}
      AND DATEDIFF(?, DATE(v.data_criacao)) <= ?
      AND DATE(v.data_criacao) <= ?
      AND v.comanda_temp = 0
      AND v.status = 1
      AND v.cliente IS NOT NULL
      AND v.cliente != 2
      AND vp.colaborador IS NOT NULL
    GROUP BY vp.colaborador, su.nome
    ORDER BY base_ativa DESC
  `, [dataFim, janelaDias, dataFim]);

  if (rowsBase.length === 0) return [];
  const results = [];

  for (const row of rowsBase) {
    const colabId = Number(row.colaborador_id);
    const baseAtiva = Number(row.base_ativa);

    const rowsPerd = await queryLocal<{ total: number }>(`
      SELECT COUNT(DISTINCT base.cliente) as total
      FROM (
        SELECT DISTINCT v.cliente
        FROM sync_vendas_produtos vp
        JOIN sync_vendas v ON vp.venda = v.id
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
        FROM sync_vendas v2
        WHERE ${v2Cond}
          AND v2.cliente = base.cliente
          AND DATE(v2.data_criacao) >= ?
          AND DATE(v2.data_criacao) <= ?
          AND v2.comanda_temp = 0
          AND v2.status = 1
      )
    `, [colabId, dataInicioJanela, dataInicio, dataInicio, dataFim]);

    const rowsExcl = await queryLocal<{ total: number }>(`
      SELECT COUNT(DISTINCT v.cliente) as total
      FROM sync_vendas_produtos vp
      JOIN sync_vendas v ON vp.venda = v.id
      WHERE vp.colaborador = ?
        AND DATE(v.data_criacao) >= ?
        AND DATE(v.data_criacao) <= ?
        AND v.comanda_temp = 0
        AND v.status = 1
        AND v.cliente IS NOT NULL
        AND v.cliente != 2
        AND NOT EXISTS (
          SELECT 1
          FROM sync_vendas_produtos vp2
          JOIN sync_vendas v2 ON vp2.venda = v2.id
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

// ─── Colaboradores para comissões ─────────────────────────────────────────────

export async function getColaboradoresComissoes(
  extIds: number[],
  dataInicio: string,
  dataFim: string,
  nomesBase: string[] = []
) {
  const vpUnit = unitIdCond(extIds, "vp");
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);

  let baseCond: string;
  let extraCond: string;
  let params: unknown[];

  if (nomesBase.length > 0) {
    const placeholders = nomesBase.map(() => "?").join(",");
    baseCond = `p.tipo = 'ser' AND p.nome IN (${placeholders})`;
    extraCond = `p.tipo = 'ser' AND p.nome NOT IN (${placeholders})`;
    params = [...nomesBase, ...nomesBase, dataInicio, dataFimExcl];
  } else {
    baseCond = `p.tipo = 'ser' AND p.categoria = 'base'`;
    extraCond = `p.tipo = 'ser' AND (p.categoria = 'extra' OR p.categoria IS NULL)`;
    params = [dataInicio, dataFimExcl];
  }

  return queryLocal<{
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
    pct_servico_nativo: number;
    pct_produto_nativo: number;
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
      COUNT(DISTINCT v.cliente) as clientes,
      COALESCE(colab.comissao_servico, 0) as pct_servico_nativo,
      COALESCE(colab.comissao_produto, 0) as pct_produto_nativo
    FROM sync_vendas_produtos vp
    JOIN sync_usuarios colab ON colab.id = vp.colaborador
    JOIN sync_vendas v ON v.id = vp.venda
    JOIN sync_produtos p ON p.id = vp.produto
    WHERE ${vpUnit}
      AND colab.visivel_agenda != 'nenhuma'
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
    GROUP BY colab.id, colab.nome
    ORDER BY faturamento DESC
  `, params);
}

// ─── Clientes em Churn/Risco ──────────────────────────────────────────────────

export async function getClientesChurnRisco(
  extIds: number[],
  dataInicio: string,
  dataFim: string,
  colaboradorId?: number | null,
  statusFiltro?: "em_risco" | "perdido" | null,
  limit: number = 200
) {
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const vCond = colaboradorId ? `v.usuario = ${colaboradorId}` : unitIdCond(extIds, "v");

  let statusCond = "";
  if (statusFiltro === "em_risco") {
    statusCond = "AND DATEDIFF(NOW(), MAX(v.data_criacao)) BETWEEN 61 AND 90";
  } else if (statusFiltro === "perdido") {
    statusCond = "AND DATEDIFF(NOW(), MAX(v.data_criacao)) > 90";
  } else {
    statusCond = "AND DATEDIFF(NOW(), MAX(v.data_criacao)) > 60";
  }

  const rows = await queryLocal<{
    cliente_id: number;
    nome: string;
    telefone: string | null;
    ultima_visita: Date;
    dias_sem_vir: number;
    total_visitas: number;
    valor_total: number;
  }>(`
    SELECT
      v.cliente as cliente_id,
      COALESCE(c.nome, CONCAT('Cliente #', v.cliente)) as nome,
      c.telefone,
      MAX(v.data_criacao) as ultima_visita,
      DATEDIFF(NOW(), MAX(v.data_criacao)) as dias_sem_vir,
      COUNT(DISTINCT v.id) as total_visitas,
      COALESCE(SUM(vp.valor_total), 0) as valor_total
    FROM sync_vendas v
    JOIN sync_vendas_produtos vp ON vp.venda = v.id
    LEFT JOIN sync_clientes c ON c.id = v.cliente
    WHERE ${vCond}
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
      AND v.cliente IS NOT NULL
      AND v.cliente != 2
    GROUP BY v.cliente, c.nome, c.telefone
    HAVING 1=1 ${statusCond}
    ORDER BY dias_sem_vir ASC
    LIMIT ${Number(limit)}
  `, [dataInicio, dataFimExcl]);

  return rows.map(r => {
    const dias = Number(r.dias_sem_vir ?? 0);
    const status = dias <= 90 ? "em_risco" : "perdido";
    return {
      clienteId: Number(r.cliente_id),
      nome: String(r.nome),
      telefone: r.telefone ?? null,
      ultimaVisita: r.ultima_visita ? new Date(r.ultima_visita).toISOString().slice(0, 10) : null,
      diasSemVir: dias,
      totalVisitas: Number(r.total_visitas),
      valorTotal: Number(r.valor_total),
      status,
    };
  });
}

// ─── Top Clientes Expandido ───────────────────────────────────────────────────

export async function getClientesTopExpandido(
  extIds: number[],
  dataInicio: string,
  dataFim: string,
  limit: number = 100,
  offset: number = 0,
  search: string = "",
  colaboradorId?: number | null
) {
  const dataFimExcl = new Date(new Date(dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const vpCond = colaboradorId ? `vp.colaborador = ${colaboradorId}` : unitIdCond(extIds, "vp");

  let searchCond = "";
  const params: unknown[] = [dataInicio, dataFimExcl];
  if (search && search.trim()) {
    searchCond = "AND (c.nome LIKE ? OR c.telefone LIKE ?)";
    params.push(`%${search.trim()}%`, `%${search.trim()}%`);
  }

  const rows = await queryLocal<{
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
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON v.id = vp.venda
    LEFT JOIN sync_clientes c ON c.id = v.cliente
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
      ultimaVisita: r.ultima_visita ? new Date(r.ultima_visita).toISOString().slice(0, 10) : null,
      diasSemVir: dias,
      status,
    };
  });
}
