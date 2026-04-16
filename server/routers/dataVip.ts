/**
 * server/routers/dataVip.ts
 * Router tRPC do módulo Data VIP
 * Dados operacionais: banco externo (franquia_producao via SSH tunnel)
 * Dados de configuração: banco interno (VIP Suite)
 */
import { z } from "zod";
import { protectedProcedure, router, sysUserProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { sql, eq, and, asc } from "drizzle-orm";
import mysql from "mysql2/promise";

// Pool mysql2 direto (sem prepared statements do Drizzle) para mutations de enum
let _localPool: mysql.Pool | null = null;
function getLocalPool(): mysql.Pool {
  if (!_localPool) {
    _localPool = mysql.createPool({
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 5,
    });
  }
  return _localPool;
}
import { metaFaixas, metasDinamicas } from "../../drizzle/schema";
import { getSyncStatus, getAllSyncStatuses, startAutoSyncScheduler } from "../vipDataSync";
import {
  getDashboardKpis,
  getKpisRealtimeByRange,
  getFaturamentoMensal,
  getFaturamentoPorPagamento,
  getFaturamentoPorProduto,
  getFaturamentoDiario,
  getEvolucaoDiaria,
  getColaboradores,
  getColaboradoresByRange,
  getColaboradoresComissoes,
  getRankingUnidades,
  getDiasTrabalhados,
  getDiasTrabalhadosMedia,
  getServicosExtra,
  getTopBarbeiros,
  getTopItens,
  getComposicaoGrupo,
  getKpisPeriodo,
  getFaturamentoPorDiaSemana,
  getFaturamentoPorFaixaHoraria,
  getFaturamentoMensalDetalhado,
  getFaturamentoMensalDetalhadoFiltrado,
  getListaColaboradoresMensal,
  getClientesKpis,
  getClientesDistribuicaoStatus,
  getClientesEvolucaoMensal,
  getClientesDistribuicaoFrequencia,
  getClientesDistribuicaoDiasSemVir,
  getClientesTop,
  getClientesChurnRisco,
  getClientesTopExpandido,
  getListaColaboradoresClientes,
  getClienteDetalhes,
  getChurnSaudeBase,
  getChurnPorBarbeiro,
} from "../dataVipQueries";

// Inicializa scheduler automático (08:00 BRT)
startAutoSyncScheduler();

// ─── Helper: resolve filtro de unidades (banco interno) ──────────────────────
type SysUserLike = { orgId: number; allowedUnitIds: number[] } | null | undefined;

async function resolveUnitFilter(
  userId: number,
  userRole: string,
  orgId?: number,
  unitId?: number,
  sysUser?: SysUserLike
): Promise<{ orgFilter: number | null; unitFilter: number | null; isAdmin: boolean }> {
  // Usuário de unidade (sysUser): usa orgId e allowedUnitIds diretamente
  if (sysUser) {
    const resolvedUnitId = unitId ?? (sysUser.allowedUnitIds.length === 1 ? sysUser.allowedUnitIds[0] : null);
    return { orgFilter: sysUser.orgId, unitFilter: resolvedUnitId, isAdmin: false };
  }
  const isAdmin = userRole === "admin";
  if (isAdmin && !orgId && !unitId) return { orgFilter: null, unitFilter: null, isAdmin };
  if (isAdmin && orgId) return { orgFilter: orgId, unitFilter: unitId || null, isAdmin };
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const [profiles] = await db.execute(sql`
    SELECT orgId, unitId FROM user_profiles WHERE userId = ${userId} LIMIT 1
  `) as any;
  const profile = (profiles as any[])[0];
  if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "Sem perfil de acesso" });
  return { orgFilter: profile.orgId, unitFilter: profile.unitId, isAdmin };
}

// ─── Helper: converte unitId interno → externalId (ID no banco externo) ──────
async function resolveExternalIds(
  userId: number,
  userRole: string,
  orgId?: number,
  unitId?: number,
  sysUser?: SysUserLike
): Promise<{ extIds: number[]; isAdmin: boolean; unitFilter: number | null; orgFilter: number | null }> {
  const { orgFilter, unitFilter, isAdmin } = await resolveUnitFilter(userId, userRole, orgId, unitId, sysUser);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

  if (unitFilter) {
    const [rows] = await db.execute(sql`
      SELECT externalId FROM units WHERE id = ${unitFilter} AND externalId IS NOT NULL
    `) as any;
    const extId = (rows as any[])[0]?.externalId;
    if (!extId) return { extIds: [], isAdmin, unitFilter, orgFilter };
    return { extIds: [Number(extId)], isAdmin, unitFilter, orgFilter };
  }

  if (orgFilter) {
    const [rows] = await db.execute(sql`
      SELECT externalId FROM units WHERE orgId = ${orgFilter} AND externalId IS NOT NULL
    `) as any;
    const extIds = (rows as any[]).map((r: any) => Number(r.externalId)).filter(Boolean);
    return { extIds, isAdmin, unitFilter, orgFilter };
  }

  const [rows] = await db.execute(sql`
    SELECT externalId FROM units WHERE externalId IS NOT NULL
  `) as any;
  const extIds = (rows as any[]).map((r: any) => Number(r.externalId)).filter(Boolean);
  return { extIds, isAdmin, unitFilter, orgFilter };
}

// ─── Helper: mapeia externalId → nome da unidade ─────────────────────────────
async function getUnitNameMap(): Promise<Record<number, string>> {
  const db = await getDb();
  if (!db) return {};
  const [rows] = await db.execute(sql`SELECT id, name, externalId FROM units WHERE externalId IS NOT NULL`) as any;
  const map: Record<number, string> = {};
  for (const r of rows as any[]) {
    if (r.externalId) map[Number(r.externalId)] = r.name;
  }
  return map;
}

// ─── Helper: converte erros de conexão SSH em mensagem amigável ─────────────────
function handleExternalDbError(err: unknown): never {
  const msg = (err as any)?.message ?? String(err);
  const isConnErr =
    msg.includes("handshake") ||
    msg.includes("Connection lost") ||
    msg.includes("ECONNRESET") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("closed state") ||
    msg.includes("Timed out") ||
    (err as any)?.code === "PROTOCOL_CONNECTION_LOST";
  if (isConnErr) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Banco de dados externo temporariamente indisponível. O sistema está reconectando automaticamente.",
    });
  }
  throw err;
}

// ─── Router ──────────────────────────────────────────────────────────────────
export const dataVipRouter = router({
  // ── Status do banco local (sync_*) ──────────────────────────────────────
  dbStatus: sysUserProcedure.query(async () => {
    try {
      const { queryLocal } = await import("../db-local");
      await queryLocal("SELECT 1");
      return { connected: true };
    } catch {
      return { connected: false };
    }
  }),

  // ── Dashboard KPIs ──────────────────────────────────────────────────────────
  dashboard: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      periodo: z.string().optional(),
      dataInicio: z.string().optional(), // YYYY-MM-DD — filtro livre
      dataFim: z.string().optional(),    // YYYY-MM-DD — filtro livre
    }))
    .query(async ({ ctx, input }) => {
      try {
      const { extIds, isAdmin, orgFilter } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );
      const now = new Date();
      // Helper: busca nomes base da tabela servico_categorias
      const db = await getDb();
      let nomesBase: string[] = [];
      if (db && orgFilter) {
        const [catRows] = await db.execute(sql`
          SELECT nomeServico FROM servico_categorias WHERE orgId = ${orgFilter} AND categoria = 'base'
        `) as any;
        nomesBase = (catRows as any[]).map((r: any) => r.nomeServico);
      }

      // Modo range livre (dia único ou intervalo)
      if (input.dataInicio && input.dataFim) {
        const dataFimExcl = new Date(new Date(input.dataFim + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
        const [kpis, diasData, extraData] = await Promise.all([
          getKpisRealtimeByRange(extIds, input.dataInicio, input.dataFim),
          getDiasTrabalhados(extIds, input.dataInicio, dataFimExcl),
          getServicosExtra(extIds, input.dataInicio, dataFimExcl, nomesBase),
        ]);
        return {
          periodo: `${input.dataInicio}:${input.dataFim}`,
          faturamento: kpis.faturamento,
          varFaturamento: 0,
          atendimentos: kpis.atendimentos,
          varAtendimentos: 0,
          ticketMedio: Math.round(kpis.ticketMedio * 100) / 100,
          clientesAtendidos: kpis.totalClientes,
          clientesNovos: kpis.clientesNovos,
          clientesAntigos: kpis.clientesAntigos,
          servicosTotal: kpis.servicosTotal,
          produtosVendidos: kpis.produtosVendidos,
          diasTrabalhados: diasData.diasTrabalhados,
          fatPorDia: diasData.diasTrabalhados > 0 ? Math.round(diasData.faturamentoTotal / diasData.diasTrabalhados * 100) / 100 : 0,
          servicosExtraQtd: extraData.qtdExtra,
          servicosExtraTotal: Math.round(extraData.totalExtra * 100) / 100,
          isAdmin,
          isRangeMode: true,
        };
      }
      // Modo mensal (padrão)
      const periodo = input.periodo || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [ano, mes] = periodo.split("-").map(Number);
      const dataInicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const proximoMes = mes === 12 ? 1 : mes + 1;
      const anoProximo = mes === 12 ? ano + 1 : ano;
      const dataFimExcl = `${anoProximo}-${String(proximoMes).padStart(2, "0")}-01`;
      const [kpis, diasData, extraData] = await Promise.all([
        getDashboardKpis(extIds, ano, mes),
        getDiasTrabalhados(extIds, dataInicio, dataFimExcl),
        getServicosExtra(extIds, dataInicio, dataFimExcl, nomesBase),
      ]);
      return {
        periodo,
        faturamento: kpis.faturamento,
        varFaturamento: Math.round(kpis.crescimentoFat * 10) / 10,
        atendimentos: kpis.atendimentos,
        varAtendimentos: Math.round(kpis.crescimentoAtend * 10) / 10,
        ticketMedio: Math.round(kpis.ticketMedio * 100) / 100,
        clientesAtendidos: kpis.totalClientes,
        clientesNovos: kpis.clientesNovos,
        clientesAntigos: kpis.clientesAntigos,
        servicosTotal: kpis.servicosTotal,
        produtosVendidos: kpis.produtosVendidos,
        diasTrabalhados: diasData.diasTrabalhados,
        fatPorDia: diasData.diasTrabalhados > 0 ? Math.round(diasData.faturamentoTotal / diasData.diasTrabalhados * 100) / 100 : 0,
        servicosExtraQtd: extraData.qtdExtra,
        servicosExtraTotal: Math.round(extraData.totalExtra * 100) / 100,
        isAdmin,
        isRangeMode: false,
      };
      } catch (err) { handleExternalDbError(err); }
    }),

  // ── Faturamento mensal ───────────────────────────────────────────────────────
  faturamentoMensal: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      meses: z.number().default(12),
    }))
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );
      const rows = await getFaturamentoMensal(extIds, input.meses);
      return rows.map(r => ({
        periodo: `${r.ano}-${String(r.mes).padStart(2, "0")}`,
        faturamento: Number(r.total_vendas),
        atendimentos: Number(r.quantidade_vendas),
        ticketMedio: Math.round(Number(r.ticket_medio_por_venda) * 100) / 100,
        clientes: Number(r.total_clientes_novos) + Number(r.total_clientes_antigos),
      })).reverse();
    }),

  // ── Faturamento mensal detalhado (evolução com extras, serviços, produtos) ────────────
  faturamentoMensalDetalhado: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      meses: z.number().default(12),
    }))
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );
      const rows = await getFaturamentoMensalDetalhado(extIds, input.meses);
      // Retorna em ordem cronológica (mais antigo primeiro)
      return [...rows].reverse();
    }),

  // ── Faturamento por produto e forma de pagamento ───────────────────────────────────────
  faturamentoPorProduto: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      periodo: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );
      const now = new Date();
      const periodo = input.periodo || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [ano, mes] = periodo.split("-").map(Number);
      const dataInicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const dataFim = new Date(ano, mes, 0).toISOString().split("T")[0];
      const [porProduto, porPagamento] = await Promise.all([
        getFaturamentoPorProduto(extIds, dataInicio, dataFim),
        getFaturamentoPorPagamento(extIds, dataInicio, dataFim),
      ]);
      return {
        porProduto: porProduto.map(r => ({
          produto: r.produto_nome,
          tipo: r.tipo,
          qtd: Number(r.quantidade),
          total: Number(r.total),
        })),
        porPagamento: porPagamento.map(r => ({
          forma: r.forma,
          tipo: r.tipo,
          qtd: Number(r.qtd_vendas),
          total: Number(r.total),
        })),
      };
    }),

  // ── Ranking da rede ──────────────────────────────────────────────────────────
  ranking: sysUserProcedure
    .input(z.object({ orgId: z.number().optional(), periodo: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const { extIds, isAdmin, unitFilter, orgFilter } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, undefined, ctx.sysUser
      );
      const now = new Date();
      const periodo = input.periodo || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [ano, mes] = periodo.split("-").map(Number);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      let allExtIds: number[] = extIds;
      if (orgFilter && !unitFilter) {
        const [rows] = await db.execute(sql`
          SELECT externalId FROM units WHERE orgId = ${orgFilter} AND externalId IS NOT NULL
        `) as any;
        allExtIds = (rows as any[]).map((r: any) => Number(r.externalId)).filter(Boolean);
      }

      const ranking = await getRankingUnidades(allExtIds, ano, mes);
      const unitNameMap = await getUnitNameMap();
      const [unitRows] = await db.execute(sql`
        SELECT id, externalId FROM units WHERE externalId IS NOT NULL
      `) as any;
      const extToInternal: Record<number, number> = {};
      for (const r of unitRows as any[]) {
        extToInternal[Number(r.externalId)] = r.id;
      }

      return {
        periodo,
        ranking: ranking.map((r, idx) => {
          const internalId = extToInternal[r.unidade_id];
          const isMyUnit = unitFilter === internalId;
          const canSee = isAdmin || isMyUnit;
          return {
            posicao: idx + 1,
            unitId: internalId ?? r.unidade_id,
            unitName: unitNameMap[r.unidade_id] ?? r.unidade_nome,
            faturamento: canSee ? Number(r.total_vendas) : null,
            atendimentos: canSee ? Number(r.quantidade_vendas) : null,
            clientes: canSee ? Number(r.total_clientes_novos) + Number(r.total_clientes_antigos) : null,
            ticketMedio: isAdmin ? Math.round(Number(r.ticket_medio_por_venda) * 100) / 100 : null,
            isMyUnit,
          };
        }),
      };
    }),

  // ── Clientes ─────────────────────────────────────────────────────────────────
  clientes: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      search: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(50),
    }))
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );
      const { queryLocal } = await import("../db-local");
      const unitCond = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `v.unidade_id = ${extIds[0]}`
        : `v.unidade_id IN (${extIds.join(",")})`;
      let searchCond = "";
      const params: unknown[] = [];
      if (input.search) {
        searchCond = ` AND (c.nome LIKE ? OR c.telefone LIKE ?)`;
        params.push(`%${input.search}%`, `%${input.search}%`);
      }
      const offset = (input.page - 1) * input.pageSize;
      const rows = await queryLocal<{
        id: number; nome: string; telefone: string;
        data_criacao: Date; ultima_visita: Date; total_visitas: number; total_gasto: number;
      }>(`
        SELECT
          c.id,
          COALESCE(c.nome, CONCAT('Cliente #', c.id)) as nome,
          c.telefone,
          c.data_criacao,
          MAX(v.data_criacao) as ultima_visita,
          COUNT(DISTINCT v.id) as total_visitas,
          COALESCE(SUM(vp.valor_total), 0) as total_gasto
        FROM sync_clientes c
        JOIN sync_vendas v ON v.cliente = c.id
        JOIN sync_vendas_produtos vp ON vp.venda = v.id
        WHERE ${unitCond}
          AND c.status = 1
          AND v.comanda_temp = 0
          AND v.status = 1${searchCond}
        GROUP BY c.id, c.nome, c.telefone, c.data_criacao
        ORDER BY ultima_visita DESC
        LIMIT ${input.pageSize} OFFSET ${offset}
      `, params);
      const cntRows = await queryLocal<{ total: number }>(`
        SELECT COUNT(DISTINCT c.id) as total
        FROM sync_clientes c
        JOIN sync_vendas v ON v.cliente = c.id
        JOIN sync_vendas_produtos vp ON vp.venda = v.id
        WHERE ${unitCond}
          AND c.status = 1
          AND v.comanda_temp = 0
          AND v.status = 1${searchCond}
      `, params);
      return {
        clientes: rows.map(r => ({
          clienteId: String(r.id),
          clienteNome: r.nome,
          telefone: r.telefone,
          primeiraVenda: r.data_criacao,
          ultimaVenda: r.ultima_visita,
          totalVisitas: Number(r.total_visitas),
          totalGasto: Number(r.total_gasto),
          dias: r.ultima_visita ? Math.floor((Date.now() - new Date(r.ultima_visita).getTime()) / 86400000) : 999,
        })),
        total: Number(cntRows[0]?.total ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  // ── Raio X de retenção ───────────────────────────────────────────────────────
  raioX: sysUserProcedure
    .input(z.object({ orgId: z.number().optional(), unitId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );
      const { queryLocal } = await import("../db-local");
      const unitCondC = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `c.unidade_id = ${extIds[0]}`
        : `c.unidade_id IN (${extIds.join(",")})`;
      const unitCondV = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `v.unidade_id = ${extIds[0]}`
        : `v.unidade_id IN (${extIds.join(",")})`;
      const rows = await queryLocal<{
        id: number; nome: string; telefone: string;
        data_criacao: Date; ultima_visita: Date; visitas: number; consumo: number;
      }>(`
        SELECT c.id, c.nome, c.telefone, c.data_criacao, c.ultima_visita,
               COALESCE(vc.total_visitas, 0) as visitas,
               COALESCE((
                 SELECT SUM(sv.valor_total) FROM sync_vendas sv
                 WHERE sv.cliente = c.id AND sv.comanda_temp=0 AND sv.cancelado_motivo IS NULL AND sv.status=1
               ), 0) as consumo
        FROM sync_clientes c
        LEFT JOIN (
          SELECT v.cliente, COUNT(*) as total_visitas
          FROM sync_vendas v
          WHERE ${unitCondV}
            AND v.comanda_temp = 0 AND v.status = 1 AND v.cliente IS NOT NULL AND v.cliente != 2
          GROUP BY v.cliente
        ) vc ON vc.cliente = c.id
        WHERE ${unitCondC} AND c.status = 1 AND c.ultima_visita IS NOT NULL
        ORDER BY c.ultima_visita DESC
        LIMIT 5000
      `);
      const clientes = rows.map(r => {
        const dias = r.ultima_visita
          ? Math.floor((Date.now() - new Date(r.ultima_visita).getTime()) / 86400000)
          : 999;
        return {
          clienteId: String(r.id),
          clienteNome: r.nome,
          telefone: r.telefone,
          primeiraVenda: r.data_criacao,
          ultimaVenda: r.ultima_visita,
          totalVisitas: Number(r.visitas),
          totalGasto: Number(r.consumo),
          dias,
          categoria: dias <= 60 ? "ativo" : dias <= 90 ? "em_risco" : "perdido",
        };
      });
      return {
        resumo: {
          total: clientes.length,
          ativos: clientes.filter(c => c.categoria === "ativo").length,
          emRisco: clientes.filter(c => c.categoria === "em_risco").length,
          perdidos: clientes.filter(c => c.categoria === "perdido").length,
          novos: clientes.filter(c => {
            if (!c.primeiraVenda) return false;
            return Math.floor((Date.now() - new Date(c.primeiraVenda).getTime()) / 86400000) <= 45;
          }).length,
        },
        clientes,
      };
    }),

  // ── Colaboradores ────────────────────────────────────────────────────────────
  colaboradores: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      periodo: z.string().optional(),
      dataInicio: z.string().optional(), // YYYY-MM-DD — filtro livre
      dataFim: z.string().optional(),    // YYYY-MM-DD — filtro livre
    }))
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );
      const now = new Date();
      // Modo range livre
      if (input.dataInicio && input.dataFim) {
        const rows = await getColaboradoresByRange(extIds, input.dataInicio, input.dataFim);
        return rows.map(r => ({
          colaboradorId: String(r.colaborador_id),
          colaboradorNome: r.colaborador_nome,
          tipoColaborador: "barbeiro",
          faturamento: Number(r.faturamento),
          atendimentos: Number(r.atendimentos),
          clientes: Number(r.clientes),
          clientesNovos: Number(r.clientes_novos),
          ticketMedio: Math.round(Number(r.ticket_medio) * 100) / 100,
          diasTrabalhados: Number(r.dias_trabalhados),
          faturamentoDia: Math.round(Number(r.faturamento_dia) * 100) / 100,
          servicos: Number(r.servicos),
          extraQtd: Number(r.extra_qtd),
          extraValor: Number(r.extra_valor),
          produtosQtd: Number(r.produtos_qtd),
          produtosValor: Number(r.produtos_valor),
          fidelizacao: 0,
          nps: 0,
          estrela: 0,
        }));
      }
      // Modo mensal (padrão) — usa getColaboradoresByRange para ter extras, dias trabalhados, etc.
      const periodo = input.periodo || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [ano, mes] = periodo.split("-").map(Number);
      const dataInicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const proximoMes = mes === 12 ? 1 : mes + 1;
      const anoProximo = mes === 12 ? ano + 1 : ano;
      const dataFimMes = new Date(anoProximo, proximoMes - 1, 1);
      dataFimMes.setDate(dataFimMes.getDate() - 1);
      const dataFimMesStr = dataFimMes.toISOString().slice(0, 10);
      const rows = await getColaboradoresByRange(extIds, dataInicioMes, dataFimMesStr);
      return rows.map(r => ({
        colaboradorId: String(r.colaborador_id),
        colaboradorNome: r.colaborador_nome,
        tipoColaborador: "barbeiro",
        faturamento: Number(r.faturamento),
        atendimentos: Number(r.atendimentos),
        clientes: Number(r.clientes),
        clientesNovos: Number(r.clientes_novos),
        ticketMedio: Math.round(Number(r.ticket_medio) * 100) / 100,
        diasTrabalhados: Number(r.dias_trabalhados),
        faturamentoDia: Math.round(Number(r.faturamento_dia) * 100) / 100,
        servicos: Number(r.servicos),
        extraQtd: Number(r.extra_qtd),
        extraValor: Number(r.extra_valor),
        produtosQtd: Number(r.produtos_qtd),
        produtosValor: Number(r.produtos_valor),
        fidelizacao: 0,
        nps: 0,
        estrela: 0,
      }));
    }),

  updateColaboradorTipo: sysUserProcedure
    .input(z.object({
      colaboradorId: z.string(),
      orgId: z.number(),
      tipoColaborador: z.enum(["barbeiro", "recepcao", "estetica", "nenhum"]),
      unitId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = (ctx.user?.role ?? "user") === "admin";
      if (!isAdmin && !ctx.sysUser) throw new TRPCError({ code: "FORBIDDEN" });
      if (!isAdmin && ctx.sysUser && input.unitId && !ctx.sysUser.allowedUnitIds.includes(input.unitId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para editar esta unidade" });
      }
      // Usar mysql2 diretamente (não Drizzle) para evitar cache de prepared statements
      // que rejeitaria novos valores de enum como 'estetica'
      const pool = getLocalPool();
      await pool.query(
        `INSERT INTO dimensao_colaboradores (colaboradorId, orgId, tipoColaborador, ativo)
        VALUES (?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE tipoColaborador = VALUES(tipoColaborador)`,
        [input.colaboradorId, input.orgId, input.tipoColaborador]
      );
      return { success: true };
    }),

  // ── Faturamento Detalhado (Resumo Executivo + Comparativos) ──────────────────────────────────────────────────────────────────────────────────
  faturamentoDetalhado: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      periodo: z.string().optional(), // YYYY-MM
    }))
    .query(async ({ ctx, input }) => {
      try {
      const { extIds } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );
      const now = new Date();
      const periodo = input.periodo || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [ano, mes] = periodo.split("-").map(Number);

      // Datas do período atual
      const dataInicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const dataFim = new Date(ano, mes, 0).toISOString().split("T")[0];

      // Período anterior (mês anterior)
      const mesAnt = mes === 1 ? 12 : mes - 1;
      const anoAnt = mes === 1 ? ano - 1 : ano;
      const dataInicioAnt = `${anoAnt}-${String(mesAnt).padStart(2, "0")}-01`;
      const dataFimAnt = new Date(anoAnt, mesAnt, 0).toISOString().split("T")[0];

      // Ano anterior (mesmo mês)
      const dataInicioAnoAnt = `${ano - 1}-${String(mes).padStart(2, "0")}-01`;
      const dataFimAnoAnt = new Date(ano - 1, mes, 0).toISOString().split("T")[0];

      // Média 6 meses (6 meses anteriores ao atual)
      const med6Inicio = new Date(ano, mes - 7, 1);
      const med6Fim = new Date(ano, mes - 1, 0);
      const dataInicioMed6 = med6Inicio.toISOString().split("T")[0];
      const dataFimMed6 = med6Fim.toISOString().split("T")[0];

      // Média 12 meses (12 meses anteriores ao atual)
      const med12Inicio = new Date(ano, mes - 13, 1);
      const med12Fim = new Date(ano, mes - 1, 0);
      const dataInicioMed12 = med12Inicio.toISOString().split("T")[0];
      const dataFimMed12 = med12Fim.toISOString().split("T")[0];

      const [atual, anterior, anoAnterior, med6Raw, med12Raw, diasAtual, diasAnt, diasAnoAnt, diasMed6Raw, diasMed12Raw, topBarbeiros, topItens, composicao] = await Promise.all([
        getKpisPeriodo(extIds, dataInicio, dataFim),
        getKpisPeriodo(extIds, dataInicioAnt, dataFimAnt),
        getKpisPeriodo(extIds, dataInicioAnoAnt, dataFimAnoAnt),
        getKpisPeriodo(extIds, dataInicioMed6, dataFimMed6),
        getKpisPeriodo(extIds, dataInicioMed12, dataFimMed12),
        getDiasTrabalhados(extIds, dataInicio, new Date(ano, mes, 1).toISOString().split("T")[0]),
        getDiasTrabalhados(extIds, dataInicioAnt, new Date(anoAnt, mesAnt, 1).toISOString().split("T")[0]),
        getDiasTrabalhados(extIds, dataInicioAnoAnt, new Date(ano - 1, mes, 1).toISOString().split("T")[0]),
        getDiasTrabalhadosMedia(extIds, dataInicioMed6, new Date(ano, mes - 1, 1).toISOString().split("T")[0]),
        getDiasTrabalhadosMedia(extIds, dataInicioMed12, new Date(ano, mes - 1, 1).toISOString().split("T")[0]),
        getTopBarbeiros(extIds, dataInicio, dataFim),
        getTopItens(extIds, dataInicio, dataFim),
        getComposicaoGrupo(extIds, dataInicio, dataFim),
      ]);

      // Médias divididas por 6 e 12 meses
      // diasTrabalhados = total de dias com atendimento no período / número de meses
      const med6 = { fatBase: med6Raw.fatBase / 6, fatExtra: med6Raw.fatExtra / 6, fatProdutos: med6Raw.fatProdutos / 6, fatTotal: med6Raw.fatTotal / 6, diasTrabalhados: diasMed6Raw.mediaDias };
      const med12 = { fatBase: med12Raw.fatBase / 12, fatExtra: med12Raw.fatExtra / 12, fatProdutos: med12Raw.fatProdutos / 12, fatTotal: med12Raw.fatTotal / 12, diasTrabalhados: diasMed12Raw.mediaDias };

      const pct = (a: number, b: number) => b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null;
      const r = (v: number) => Math.round(v * 100) / 100;

      const totalBarbeiros = topBarbeiros.reduce((s, b) => s + Number(b.faturamento), 0);
      const totalItens = topItens.reduce((s, i) => s + Number(i.total), 0);

      return {
        periodo,
        dataInicio,
        dataFim,
        resumo: {
          total: r(atual.fatTotal),
          fatBase: r(atual.fatBase),
          fatExtra: r(atual.fatExtra),
          fatProdutos: r(atual.fatProdutos),
          fatOutros: r(atual.fatOutros),
          diasTrabalhados: diasAtual.diasTrabalhados,
        },
        comparativo: {
          atual: { fatBase: r(atual.fatBase), fatExtra: r(atual.fatExtra), fatProdutos: r(atual.fatProdutos), fatTotal: r(atual.fatTotal), diasTrabalhados: diasAtual.diasTrabalhados, fatPorDia: diasAtual.diasTrabalhados > 0 ? r(atual.fatTotal / diasAtual.diasTrabalhados) : 0 },
          anterior: { fatBase: r(anterior.fatBase), fatExtra: r(anterior.fatExtra), fatProdutos: r(anterior.fatProdutos), fatTotal: r(anterior.fatTotal), diasTrabalhados: diasAnt.diasTrabalhados, fatPorDia: diasAnt.diasTrabalhados > 0 ? r(anterior.fatTotal / diasAnt.diasTrabalhados) : 0, pctBase: pct(atual.fatBase, anterior.fatBase), pctExtra: pct(atual.fatExtra, anterior.fatExtra), pctProdutos: pct(atual.fatProdutos, anterior.fatProdutos), pctTotal: pct(atual.fatTotal, anterior.fatTotal), pctDias: pct(diasAtual.diasTrabalhados, diasAnt.diasTrabalhados), pctFatDia: diasAnt.diasTrabalhados > 0 && diasAtual.diasTrabalhados > 0 ? pct(atual.fatTotal / diasAtual.diasTrabalhados, anterior.fatTotal / diasAnt.diasTrabalhados) : null },
          anoAnterior: { fatBase: r(anoAnterior.fatBase), fatExtra: r(anoAnterior.fatExtra), fatProdutos: r(anoAnterior.fatProdutos), fatTotal: r(anoAnterior.fatTotal), diasTrabalhados: diasAnoAnt.diasTrabalhados, fatPorDia: diasAnoAnt.diasTrabalhados > 0 ? r(anoAnterior.fatTotal / diasAnoAnt.diasTrabalhados) : 0, pctBase: pct(atual.fatBase, anoAnterior.fatBase), pctExtra: pct(atual.fatExtra, anoAnterior.fatExtra), pctProdutos: pct(atual.fatProdutos, anoAnterior.fatProdutos), pctTotal: pct(atual.fatTotal, anoAnterior.fatTotal), pctDias: pct(diasAtual.diasTrabalhados, diasAnoAnt.diasTrabalhados), pctFatDia: diasAnoAnt.diasTrabalhados > 0 && diasAtual.diasTrabalhados > 0 ? pct(atual.fatTotal / diasAtual.diasTrabalhados, anoAnterior.fatTotal / diasAnoAnt.diasTrabalhados) : null },
          med6: { fatBase: r(med6.fatBase), fatExtra: r(med6.fatExtra), fatProdutos: r(med6.fatProdutos), fatTotal: r(med6.fatTotal), diasTrabalhados: r(med6.diasTrabalhados), fatPorDia: med6.diasTrabalhados > 0 ? r(med6.fatTotal / med6.diasTrabalhados) : 0, pctBase: pct(atual.fatBase, med6.fatBase), pctExtra: pct(atual.fatExtra, med6.fatExtra), pctProdutos: pct(atual.fatProdutos, med6.fatProdutos), pctTotal: pct(atual.fatTotal, med6.fatTotal), pctDias: pct(diasAtual.diasTrabalhados, med6.diasTrabalhados), pctFatDia: med6.diasTrabalhados > 0 && diasAtual.diasTrabalhados > 0 ? pct(atual.fatTotal / diasAtual.diasTrabalhados, med6.fatTotal / med6.diasTrabalhados) : null },
          med12: { fatBase: r(med12.fatBase), fatExtra: r(med12.fatExtra), fatProdutos: r(med12.fatProdutos), fatTotal: r(med12.fatTotal), diasTrabalhados: r(med12.diasTrabalhados), fatPorDia: med12.diasTrabalhados > 0 ? r(med12.fatTotal / med12.diasTrabalhados) : 0, pctBase: pct(atual.fatBase, med12.fatBase), pctExtra: pct(atual.fatExtra, med12.fatExtra), pctProdutos: pct(atual.fatProdutos, med12.fatProdutos), pctTotal: pct(atual.fatTotal, med12.fatTotal), pctDias: pct(diasAtual.diasTrabalhados, med12.diasTrabalhados), pctFatDia: med12.diasTrabalhados > 0 && diasAtual.diasTrabalhados > 0 ? pct(atual.fatTotal / diasAtual.diasTrabalhados, med12.fatTotal / med12.diasTrabalhados) : null },
        },
        topBarbeiros: topBarbeiros.map(b => ({
          id: String(b.colaborador_id),
          nome: b.colaborador_nome,
          faturamento: r(Number(b.faturamento)),
          atendimentos: Number(b.atendimentos),
          pct: totalBarbeiros > 0 ? Math.round((Number(b.faturamento) / totalBarbeiros) * 1000) / 10 : 0,
        })),
        topItens: topItens.map(i => ({
          nome: i.nome,
          tipo: i.tipo,
          categoria: i.categoria,
          grupo: i.tipo === 'ser' && i.categoria === 'base' ? 'Serviço Base' : i.tipo === 'ser' ? 'Serviço Extra' : 'Produto',
          quantidade: Number(i.quantidade),
          total: r(Number(i.total)),
          pct: totalItens > 0 ? Math.round((Number(i.total) / totalItens) * 1000) / 10 : 0,
        })),
        composicao: composicao.map(c => ({
          grupo: c.grupo,
          total: r(Number(c.total)),
          quantidade: Number(c.quantidade),
          pct: atual.fatTotal > 0 ? Math.round((Number(c.total) / atual.fatTotal) * 1000) / 10 : 0,
        })),
      };
      } catch (err) { handleExternalDbError(err); }
    }),

  // ── Comissões por colaborador ──────────────────────────────────────────────────────────────────────────────────
  comissoes: sysUserProcedure  .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      periodo: z.string().optional(),
      dataInicio: z.string().optional(), // YYYY-MM-DD — filtro livre
      dataFim: z.string().optional(),    // YYYY-MM-DD — filtro livre
    }))
    .query(async ({ ctx, input }) => {
      const { extIds, orgFilter } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );
      const now = new Date();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Busca nomesBase da tabela servico_categorias para classificar base vs extra
      let nomesBase: string[] = [];
      if (orgFilter) {
        const [catRows] = await db.execute(sql`
          SELECT nomeServico FROM servico_categorias WHERE orgId = ${orgFilter} AND categoria = 'base'
        `) as any;
        nomesBase = (catRows as any[]).map((r: any) => r.nomeServico);
      }
      // Sempre usa tempo real com breakdown correto (base/extra/produtos)
      let dataInicio: string;
      let dataFim: string;
      if (input.dataInicio && input.dataFim) {
        dataInicio = input.dataInicio;
        dataFim = input.dataFim;
      } else {
        const periodo = input.periodo || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const [ano, mes] = periodo.split("-").map(Number);
        dataInicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
        const proximoMes = mes === 12 ? 1 : mes + 1;
        const anoProximo = mes === 12 ? ano + 1 : ano;
        // dataFim inclusivo (getColaboradoresComissoes adiciona +1 dia internamente)
        const dataFimExcl = `${anoProximo}-${String(proximoMes).padStart(2, "0")}-01`;
        const d = new Date(dataFimExcl + "T12:00:00Z");
        d.setDate(d.getDate() - 1);
        dataFim = d.toISOString().slice(0, 10);
      }
      const colabs = await getColaboradoresComissoes(extIds, dataInicio, dataFim, nomesBase);
      let rWhere = sql`ativo = 1`;
      if (orgFilter) rWhere = sql`${rWhere} AND orgId = ${orgFilter}`;
      const [regras] = await db.execute(sql`SELECT * FROM regras_comissao WHERE ${rWhere}`) as any;

      // Busca faixas de meta da unidade (ou org) para calcular bônus
      let faixasMeta: any[] = [];
      if (input.unitId) {
        const [fRows] = await db.execute(sql`
          SELECT valorMinServicos, pctComissao FROM meta_faixas
          WHERE unitId = ${input.unitId} AND orgId = ${orgFilter ?? 0}
          ORDER BY valorMinServicos ASC
        `) as any;
        faixasMeta = (fRows as any[]).map((f: any) => ({
          valorMinServicos: Number(f.valorMinServicos),
          pctComissao: Number(f.pctComissao),
        }));
      }

      // Função para encontrar a faixa atingida com base no faturamento total
      function getFaixaAtingida(fatTotal: number): { pctFaixa: number } | null {
        if (faixasMeta.length === 0) return null;
        const sorted = [...faixasMeta].sort((a, b) => b.valorMinServicos - a.valorMinServicos);
        const faixa = sorted.find(f => fatTotal >= f.valorMinServicos);
        return faixa ? { pctFaixa: faixa.pctComissao } : null;
      }

      return colabs.map(c => {
        const regra = (regras as any[]).find((r: any) => r.colaboradorId === String(c.colaborador_id));
        // Usa regra manual (override) se existir; caso contrário usa percentuais nativos do sync_usuarios
        const pctServicoNativo = Number((c as any).pct_servico_nativo ?? 0);
        const pctProdutoNativo = Number((c as any).pct_produto_nativo ?? 0);
        const pctServicos = regra ? Number(regra.percentual) : pctServicoNativo;
        const pctProdutos = regra ? Number(regra.pctComissaoProdutos ?? 0) : pctProdutoNativo;
        const fatTotal = Number(c.faturamento ?? 0);
        const atend = Number(c.atendimentos ?? 0);
        // Breakdown direto da query (getColaboradoresComissoes retorna campos separados)
        const servicosBaseValor = Number((c as any).servicos_base_valor ?? 0);
        const extraValor = Number(c.extra_valor ?? 0);
        const produtosValor = Number(c.produtos_valor ?? 0);
        const totalServicos = servicosBaseValor + extraValor;
        // Calcular comissões separadas
        const comissaoServicosBase = Math.round(servicosBaseValor * (pctServicos / 100) * 100) / 100;
        const comissaoServicosExtra = Math.round(extraValor * (pctServicos / 100) * 100) / 100;
        const comissaoProdutos = Math.round(produtosValor * (pctProdutos / 100) * 100) / 100;
        // Calcular bônus de meta: diferença entre % da faixa e % base, aplicada sobre total de serviços
        const faixaAtingida = getFaixaAtingida(fatTotal);
        const pctFaixa = faixaAtingida ? faixaAtingida.pctFaixa : 0;
        const pctBonus = Math.max(0, pctFaixa - pctServicos); // diferença positiva
        const bonusMeta = Math.round(totalServicos * (pctBonus / 100) * 100) / 100;
        const comissaoTotal = Math.round((comissaoServicosBase + comissaoServicosExtra + comissaoProdutos + bonusMeta) * 100) / 100;
        return {
          colaboradorId: String(c.colaborador_id),
          colaboradorNome: c.colaborador_nome,
          faturamento: fatTotal,
          atendimentos: atend,
          diasTrabalhados: Number((c as any).dias_trabalhados ?? 0),
          faturamentoDia: Math.round(Number((c as any).faturamento_dia ?? 0) * 100) / 100,
          // Breakdown faturamento
          servicosBaseValor,
          extraValor,
          produtosValor,
          totalServicos,
          // Percentuais
          percentual: pctServicos,
          pctComissaoProdutos: pctProdutos,
          // Faixa de meta atingida
          pctFaixaMeta: pctFaixa,
          pctBonus,
          bonusMeta,
          // Comissões calculadas
          comissaoServicosBase,
          comissaoServicosExtra,
          comissaoProdutos,
          comissao: comissaoTotal,
        };
      });
    }),

  saveRegrasComissao: sysUserProcedure
    .input(z.object({
      orgId: z.number(),
      colaboradorId: z.string(),
      percentual: z.number().min(0).max(100),
      pctComissaoProdutos: z.number().min(0).max(100).optional().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      if ((ctx.user?.role ?? "user") !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.execute(sql`
        INSERT INTO regras_comissao (orgId, colaboradorId, percentual, pctComissaoProdutos, ativo)
        VALUES (${input.orgId}, ${input.colaboradorId}, ${input.percentual}, ${input.pctComissaoProdutos}, 1)
        ON DUPLICATE KEY UPDATE percentual = VALUES(percentual), pctComissaoProdutos = VALUES(pctComissaoProdutos), updatedAt = NOW()
      `);
      return { success: true };
    }),

  // ── Metas ────────────────────────────────────────────────────────────────────
  metas: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      ano: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { orgFilter, unitFilter } = await resolveUnitFilter(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );
      const ano = input.ano || new Date().getFullYear();
      let where = sql`periodo LIKE ${`${ano}-%`}`;
      if (orgFilter) where = sql`${where} AND orgId = ${orgFilter}`;
      if (unitFilter) where = sql`${where} AND unitId = ${unitFilter}`;
      const [metas] = await db.execute(sql`
        SELECT m.*, u.name as unitName, u.externalId FROM metas_vip m
        LEFT JOIN units u ON u.id = m.unitId WHERE ${where} ORDER BY periodo ASC
      `) as any;
      const { queryLocal } = await import("../db-local");
      const result = [];
      for (const meta of metas as any[]) {
        const [a, m] = meta.periodo.split("-").map(Number);
        let realizadoVal = 0;
        try {
          const extId = meta.externalId ? Number(meta.externalId) : null;
          if (extId) {
            const mesStr = `${a}-${String(m).padStart(2, '0')}`;
            const rows = await queryLocal<{ t: number }>(`
              SELECT COALESCE(SUM(v.valor_total), 0) as t
              FROM sync_vendas v
              WHERE v.unidade_id = ${extId}
                AND DATE_FORMAT(v.data_criacao, '%Y-%m') = '${mesStr}'
                AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
            `);
            realizadoVal = Number(rows[0]?.t ?? 0);
          }
        } catch { /* banco local pode estar indisponível */ }
        const metaVal = Number(meta.metaFaturamento);
        result.push({
          ...meta,
          metaFaturamento: metaVal,
          realizado: realizadoVal,
          percentual: metaVal > 0 ? Math.round((realizadoVal / metaVal) * 100) : 0,
        });
      }
      return result;
    }),

  saveMeta: sysUserProcedure
    .input(z.object({
      orgId: z.number(),
      unitId: z.number().optional(),
      periodo: z.string(),
      metaFaturamento: z.number(),
      alertaAbaixoPercent: z.number().default(80),
    }))
    .mutation(async ({ ctx, input }) => {
      // Admin pode editar tudo; sysUser pode editar apenas sua(s) unidade(s)
      const isAdmin = (ctx.user?.role ?? "user") === "admin";
      if (!isAdmin && !ctx.sysUser) throw new TRPCError({ code: "FORBIDDEN" });
      if (!isAdmin && ctx.sysUser && input.unitId && !ctx.sysUser.allowedUnitIds.includes(input.unitId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para editar esta unidade" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.execute(sql`
        INSERT INTO metas_vip (orgId, unitId, periodo, metaFaturamento, alertaAbaixoPercent)
        VALUES (${input.orgId}, ${input.unitId || null}, ${input.periodo}, ${input.metaFaturamento}, ${input.alertaAbaixoPercent})
        ON DUPLICATE KEY UPDATE metaFaturamento = VALUES(metaFaturamento),
          alertaAbaixoPercent = VALUES(alertaAbaixoPercent), updatedAt = NOW()
      `);
      return { success: true };
    }),

  deleteMeta: sysUserProcedure
    .input(z.object({ id: z.number(), unitId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = (ctx.user?.role ?? "user") === "admin";
      if (!isAdmin && !ctx.sysUser) throw new TRPCError({ code: "FORBIDDEN" });
      if (!isAdmin && ctx.sysUser && input.unitId && !ctx.sysUser.allowedUnitIds.includes(input.unitId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para editar esta unidade" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.execute(sql`DELETE FROM metas_vip WHERE id = ${input.id}`);
      return { success: true };
    }),

  // ── Serviços ─────────────────────────────────────────────────────────────────
  servicos: sysUserProcedure
    .input(z.object({ orgId: z.number().optional(), unitId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { orgFilter, unitFilter } = await resolveUnitFilter(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );
      let where = sql`ativo = 1`;
      if (orgFilter) where = sql`${where} AND orgId = ${orgFilter}`;
      if (unitFilter) where = sql`${where} AND unitId = ${unitFilter}`;
      const [rows] = await db.execute(sql`SELECT * FROM servicos_vip WHERE ${where} ORDER BY nome ASC`) as any;
      return rows as any[];
    }),

  // ── Folgas/Feriados ──────────────────────────────────────────────────────────
  folgas: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      mes: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { orgFilter, unitFilter } = await resolveUnitFilter(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );
      const mes = input.mes || new Date().toISOString().substring(0, 7);
      let where = sql`DATE_FORMAT(data,'%Y-%m') = ${mes}`;
      if (orgFilter) where = sql`${where} AND orgId = ${orgFilter}`;
      if (unitFilter) where = sql`${where} AND unitId = ${unitFilter}`;
      const [rows] = await db.execute(sql`SELECT * FROM folgas WHERE ${where} ORDER BY data ASC`) as any;
      return rows as any[];
    }),

  saveFolga: sysUserProcedure
    .input(z.object({
      orgId: z.number(),
      unitId: z.number().optional(),
      colaboradorId: z.string().optional(),
      colaboradorNome: z.string().optional(),
      data: z.string(),
      tipo: z.enum(["folga", "feriado", "ferias"]).default("folga"),
      observacao: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.execute(sql`
        INSERT INTO folgas (orgId, unitId, colaboradorId, colaboradorNome, data, tipo, observacao)
        VALUES (${input.orgId}, ${input.unitId || null}, ${input.colaboradorId || null},
                ${input.colaboradorNome || null}, ${input.data}, ${input.tipo}, ${input.observacao || null})
      `);
      return { success: true };
    }),

  deleteFolga: sysUserProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.execute(sql`DELETE FROM folgas WHERE id = ${input.id}`);
      return { success: true };
    }),

  // ── Sync (mantido para compatibilidade) ──────────────────────────────────────
  syncStatus: sysUserProcedure
    .input(z.object({ orgId: z.number().optional(), unitId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      if (input.unitId) return getSyncStatus(input.unitId) || null;
      if (input.orgId) return getSyncStatus(input.orgId) || null;
      return getAllSyncStatuses();
    }),

  syncLogs: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      limit: z.number().default(20),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      let where = sql`1=1`;
      if (input.unitId) where = sql`unitId = ${input.unitId}`;
      const [rows] = await db.execute(sql`
        SELECT * FROM sync_log WHERE ${where} ORDER BY iniciadoEm DESC LIMIT ${input.limit}
      `) as any;
      return rows as any[];
    }),

  startSync: sysUserProcedure
    .input(z.object({ unitId: z.number(), inicio: z.string().optional(), fim: z.string().optional(), orgId: z.number().optional(), modo: z.string().optional(), dataInicio: z.string().optional(), dataFim: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if ((ctx.user?.role ?? "user") !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return { success: true, message: "Sincronização via API externa desativada — usando banco direto" };
    }),

  sync: sysUserProcedure
    .input(z.object({ unitId: z.number(), inicio: z.string().optional(), fim: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if ((ctx.user?.role ?? "user") !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return { success: true, message: "Sincronização via API externa desativada — usando banco direto" };
    }),

  syncHistory: sysUserProcedure
    .input(z.object({ unitId: z.number().optional(), limit: z.number().default(10) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      let where = sql`1=1`;
      if (input.unitId) where = sql`unitId = ${input.unitId}`;
      const [rows] = await db.execute(sql`
        SELECT * FROM sync_log WHERE ${where} ORDER BY iniciadoEm DESC LIMIT ${input.limit}
      `) as any;
      return rows as any[];
    }),

  // ── KPIs por período ─────────────────────────────────────────────────────────
  kpis: sysUserProcedure
    .input(z.object({
      unitId: z.number().int().positive().optional(),
      inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), undefined, input.unitId, ctx.sysUser
      );
      const rows = await getFaturamentoDiario(extIds, input.inicio, input.fim);
      const totalFat = rows.reduce((s, r) => s + Number(r.faturamento), 0);
      const totalAtend = rows.reduce((s, r) => s + Number(r.atendimentos), 0);
      return {
        totalFaturamento: totalFat,
        totalAtendimentos: totalAtend,
        ticketMedio: totalAtend > 0 ? Math.round((totalFat / totalAtend) * 100) / 100 : 0,
        porDia: rows,
      };
    }),

  // ── Configuração de unidades ──────────────────────────────────────────────────
  unitsConfig: sysUserProcedure
    .input(z.object({ orgId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const [unitsList] = await db.execute(sql`SELECT * FROM units WHERE orgId = ${input.orgId}`) as any;
      const [configs] = await db.execute(sql`
        SELECT unitId, config FROM module_configs
        WHERE module = 'data_vip' AND unitId IN (SELECT id FROM units WHERE orgId = ${input.orgId})
      `) as any;
      const configMap: Record<number, Record<string, string>> = {};
      for (const c of configs as any[]) {
        configMap[c.unitId] = c.config ?? {};
      }
      return (unitsList as any[]).map(u => {
        const cfg = configMap[u.id] ?? {};
        const hasApiKeys = !!(
          (cfg.apiUnidadeId || cfg.unitExternalId) &&
          (cfg.apiHash || cfg.apiKey)
        );
        return {
          ...u,
          dataVipConfig: cfg,
          hasApiKeys,
          hasExternalData: !!u.externalId,
        };
      });
    }),

  startSyncAll: sysUserProcedure
    .input(z.object({ orgId: z.number(), modo: z.enum(["auto", "manual_13m"]) }))
    .mutation(async ({ ctx, input }) => {
      if ((ctx.user?.role ?? "user") !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return {
        success: true,
        totalUnits: 0,
        unitNames: [],
        message: "Sincronização via API externa desativada — dados vêm diretamente do banco de produção",
      };
    }),

  syncAllStatus: sysUserProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { units: [] };
      const [unitsList] = await db.execute(sql`SELECT id, name, externalId FROM units WHERE orgId = ${input.orgId}`) as any;
      return {
        units: (unitsList as any[]).map(u => ({
          unitId: u.id,
          name: u.name,
          hasCredentials: !!u.externalId,
          currentStatus: "live",
          lastSyncAt: new Date(),
          lastRecords: null,
          lastError: null,
        })),
      };
    }),

  // ── Relatórios semanais ───────────────────────────────────────────────────────
  relatoriosSemanais: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      limit: z.number().default(12),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { orgFilter, unitFilter } = await resolveUnitFilter(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );
      let where = sql`1=1`;
      if (orgFilter) where = sql`${where} AND rs.orgId = ${orgFilter}`;
      if (unitFilter) where = sql`${where} AND rs.unitId = ${unitFilter}`;
      const [rows] = await db.execute(sql`
        SELECT rs.*, u.name as unitName FROM relatorios_semanais rs
        LEFT JOIN units u ON u.id = rs.unitId
        WHERE ${where} ORDER BY rs.semanaInicio DESC LIMIT ${input.limit}
      `) as any;
      return rows as any[];
    }),

  // ── Serviços do banco externo (para configuração de categorias) ──────────────────────────────────────────────
  /** Lista todos os serviços distintos do banco externo + categoria salva no banco local */
  listServicosExterno: sysUserProcedure
    .input(z.object({ orgId: z.number().optional(), unitId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const { extIds, orgFilter } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );
      const { queryLocal } = await import("../db-local");
      const unitCond2 = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `vp.unidade_id = ${extIds[0]}`
        : `vp.unidade_id IN (${extIds.join(",")})`;
      // Busca todos os nomes de serviços distintos do banco local
      const extServicos = await queryLocal<{ nome: string; qtd: number }>(`
        SELECT p.nome, COUNT(*) as qtd
        FROM sync_produtos p
        JOIN sync_vendas_produtos vp ON vp.produto = p.id
        JOIN sync_vendas v ON vp.venda = v.id
        WHERE ${unitCond2}
          AND p.tipo = 'ser'
          AND v.comanda_temp = 0
          AND v.status = 1
        GROUP BY p.nome
        ORDER BY qtd DESC
      `);

      // Busca categorias salvas no banco local (case-insensitive)
      const db = await getDb();
      let catMap: Record<string, string> = {};
      if (db && orgFilter) {
        const [catRows] = await db.execute(sql`
          SELECT nomeServico, categoria FROM servico_categorias WHERE orgId = ${orgFilter}
        `) as any;
        for (const r of catRows as any[]) {
          // Normaliza para lowercase para match case-insensitive
          catMap[r.nomeServico.toLowerCase()] = r.categoria;
        }
      }
      return extServicos.map(s => ({
        nome: s.nome,
        qtd: Number(s.qtd),
        categoria: (catMap[s.nome.toLowerCase()] as "base" | "extra" | null) ?? null,
      }));
    }),

  /** Salva (upsert) a categoria de um ou mais serviços */
  saveServicoCategorias: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      servicos: z.array(z.object({
        nome: z.string(),
        categoria: z.enum(["base", "extra"]),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      // Resolve orgId correto via sysUser (mesmo padrão da listagem)
      const { orgFilter } = await resolveUnitFilter(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, undefined, ctx.sysUser
      );
      const resolvedOrgId = orgFilter ?? input.orgId;
      if (!resolvedOrgId) throw new TRPCError({ code: "BAD_REQUEST", message: "orgId não encontrado" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      for (const s of input.servicos) {
        await db.execute(sql`
          INSERT INTO servico_categorias (orgId, nomeServico, categoria)
          VALUES (${resolvedOrgId}, ${s.nome}, ${s.categoria})
          ON DUPLICATE KEY UPDATE categoria = ${s.categoria}
        `);
      }
      return { success: true, count: input.servicos.length };
    }),

  // ── Aberturas: Por barbeiro ──────────────────────────────────────────────────────────────────────────────────
  aberturasBarbeiro: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      dataInicio: z.string(),
      dataFim: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { extIds } = await resolveExternalIds((ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser);
        const rows = await getTopBarbeiros(extIds, input.dataInicio, input.dataFim);
        const total = rows.reduce((s, r) => s + Number(r.faturamento), 0);
        const avg = rows.length > 0 ? total / rows.length : 0;
        const maxRow = rows.reduce((m, r) => Number(r.faturamento) > m.val ? { val: Number(r.faturamento), label: r.colaborador_nome } : m, { val: 0, label: '' });
        const minRow = rows.length > 0 ? rows.reduce((m, r) => Number(r.faturamento) < m.val ? { val: Number(r.faturamento), label: r.colaborador_nome } : m, { val: Number(rows[0].faturamento), label: rows[0].colaborador_nome }) : { val: 0, label: '' };
        return {
          acumulado: total, media: avg,
          maximo: { valor: maxRow.val, label: maxRow.label },
          minimo: { valor: minRow.val, label: minRow.label },
          items: rows.map(r => ({
            label: r.colaborador_nome, valor: Number(r.faturamento),
            atendimentos: Number(r.atendimentos),
            pct: total > 0 ? Math.round((Number(r.faturamento) / total) * 1000) / 10 : 0,
          })),
        };
      } catch (err) { handleExternalDbError(err); }
    }),

  // ── Aberturas: Por grupo ──────────────────────────────────────────────────────────────────────────────────
  aberturasGrupo: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      dataInicio: z.string(),
      dataFim: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { extIds } = await resolveExternalIds((ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser);
        const rows = await getComposicaoGrupo(extIds, input.dataInicio, input.dataFim);
        const total = rows.reduce((s, r) => s + Number(r.total), 0);
        const avg = rows.length > 0 ? total / rows.length : 0;
        const maxRow = rows.reduce((m, r) => Number(r.total) > m.val ? { val: Number(r.total), label: r.grupo } : m, { val: 0, label: '' });
        const minRow = rows.length > 0 ? rows.reduce((m, r) => Number(r.total) < m.val ? { val: Number(r.total), label: r.grupo } : m, { val: Number(rows[0].total), label: rows[0].grupo }) : { val: 0, label: '' };
        return {
          acumulado: total, media: avg,
          maximo: { valor: maxRow.val, label: maxRow.label },
          minimo: { valor: minRow.val, label: minRow.label },
          items: rows.map(r => ({
            label: r.grupo, valor: Number(r.total),
            quantidade: Number(r.quantidade),
            pct: total > 0 ? Math.round((Number(r.total) / total) * 1000) / 10 : 0,
          })),
        };
      } catch (err) { handleExternalDbError(err); }
    }),

  // ── Aberturas: Por item ──────────────────────────────────────────────────────────────────────────────────
  aberturasItem: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      dataInicio: z.string(),
      dataFim: z.string(),
      limit: z.number().default(20),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { extIds } = await resolveExternalIds((ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser);
        const allRows = await getTopItens(extIds, input.dataInicio, input.dataFim);
        const rows = input.limit === 0 ? allRows : allRows.slice(0, input.limit);
        const totalAll = allRows.reduce((s, r) => s + Number(r.total), 0);
        const avg = rows.length > 0 ? rows.reduce((s, r) => s + Number(r.total), 0) / rows.length : 0;
        const maxRow = rows.reduce((m, r) => Number(r.total) > m.val ? { val: Number(r.total), label: r.nome } : m, { val: 0, label: '' });
        const minRow = rows.length > 0 ? rows.reduce((m, r) => Number(r.total) < m.val ? { val: Number(r.total), label: r.nome } : m, { val: Number(rows[0].total), label: rows[0].nome }) : { val: 0, label: '' };
        return {
          acumulado: totalAll, media: avg,
          maximo: { valor: maxRow.val, label: maxRow.label },
          minimo: { valor: minRow.val, label: minRow.label },
          items: rows.map(r => ({
            label: r.nome,
            grupo: r.tipo === 'ser' && r.categoria === 'base' ? 'Serviço Base' : r.tipo === 'ser' ? 'Serviço Extra' : 'Produto',
            valor: Number(r.total), quantidade: Number(r.quantidade),
            pct: totalAll > 0 ? Math.round((Number(r.total) / totalAll) * 1000) / 10 : 0,
          })),
        };
      } catch (err) { handleExternalDbError(err); }
    }),

  // ── Aberturas: Por dia da semana ──────────────────────────────────────────────────────────────────────────────────
  aberturasDiaSemana: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      dataInicio: z.string(),
      dataFim: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { extIds } = await resolveExternalIds((ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser);
        const rows = await getFaturamentoPorDiaSemana(extIds, input.dataInicio, input.dataFim);
        const diasNomes = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        const mapped = diasNomes.map((nome, idx) => {
          const row = rows.find(r => Number(r.dia_semana) === idx + 1);
          return { label: nome, valor: row ? Number(row.total) : 0, atendimentos: row ? Number(row.atendimentos) : 0 };
        });
        const total = mapped.reduce((s, r) => s + r.valor, 0);
        const avg = total / 7;
        const maxRow = mapped.reduce((m, r) => r.valor > m.val ? { val: r.valor, label: r.label } : m, { val: 0, label: '' });
        const minRow = mapped.reduce((m, r) => r.valor < m.val ? { val: r.valor, label: r.label } : m, { val: mapped[0]?.valor ?? 0, label: mapped[0]?.label ?? '' });
        return {
          acumulado: total, media: avg,
          maximo: { valor: maxRow.val, label: maxRow.label },
          minimo: { valor: minRow.val, label: minRow.label },
          items: mapped,
        };
      } catch (err) { handleExternalDbError(err); }
    }),

  // ── Aberturas: Por pagamento ──────────────────────────────────────────────────────────────────────────────────
  aberturasPagamento: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      dataInicio: z.string(),
      dataFim: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { extIds } = await resolveExternalIds((ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser);
        const rows = await getFaturamentoPorPagamento(extIds, input.dataInicio, input.dataFim);
        const total = rows.reduce((s, r) => s + Number(r.total), 0);
        const avg = rows.length > 0 ? total / rows.length : 0;
        const maxRow = rows.reduce((m, r) => Number(r.total) > m.val ? { val: Number(r.total), label: r.forma } : m, { val: 0, label: '' });
        const minRow = rows.length > 0 ? rows.reduce((m, r) => Number(r.total) < m.val ? { val: Number(r.total), label: r.forma } : m, { val: Number(rows[0].total), label: rows[0].forma }) : { val: 0, label: '' };
        return {
          acumulado: total, media: avg,
          maximo: { valor: maxRow.val, label: maxRow.label },
          minimo: { valor: minRow.val, label: minRow.label },
          items: rows.map(r => ({
            label: r.forma, tipo: r.tipo, valor: Number(r.total),
            atendimentos: Number(r.qtd_vendas),
            pct: total > 0 ? Math.round((Number(r.total) / total) * 1000) / 10 : 0,
          })),
        };
      } catch (err) { handleExternalDbError(err); }
    }),

  // ── Aberturas: Faixa horária ──────────────────────────────────────────────────────────────────────────────────
  aberturasFaixaHoraria: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      dataInicio: z.string(),
      dataFim: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { extIds } = await resolveExternalIds((ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser);
        const rows = await getFaturamentoPorFaixaHoraria(extIds, input.dataInicio, input.dataFim);
        const total = rows.reduce((s, r) => s + Number(r.total), 0);
        const avg = rows.length > 0 ? total / rows.length : 0;
        const maxRow = rows.reduce((m, r) => Number(r.total) > m.val ? { val: Number(r.total), label: r.faixa } : m, { val: 0, label: '' });
        const minRow = rows.length > 0 ? rows.reduce((m, r) => Number(r.total) < m.val ? { val: Number(r.total), label: r.faixa } : m, { val: Number(rows[0].total), label: rows[0].faixa }) : { val: 0, label: '' };
        return {
          acumulado: total, media: avg,
          maximo: { valor: maxRow.val, label: maxRow.label },
          minimo: { valor: minRow.val, label: minRow.label },
          items: rows.map(r => ({
            label: r.faixa, valor: Number(r.total),
            atendimentos: Number(r.atendimentos),
            pct: total > 0 ? Math.round((Number(r.total) / total) * 1000) / 10 : 0,
          })),
        };
      } catch (err) { handleExternalDbError(err); }
    }),

  // ── Evolução diária (gráfico) ──────────────────────────────────────────────────────────────────────────────────
  evolucaoDiaria: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      dataInicio: z.string(), // YYYY-MM-DD
      dataFim: z.string(),    // YYYY-MM-DD (inclusivo)
    }))
    .query(async ({ ctx, input }) => {
      try {
      const { extIds } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );
      const rows = await getEvolucaoDiaria(extIds, input.dataInicio, input.dataFim);
      return rows.map(r => ({
        dia: String(r.dia).slice(0, 10),
        faturamento: Number(r.faturamento),
        atendimentos: Number(r.atendimentos),
        clientes: Number(r.clientes),
        clientesNovos: Number(r.clientes_novos),
        ticketMedio: Math.round(Number(r.ticket_medio) * 100) / 100,
        servicos: Number(r.servicos),
        produtos: Number(r.produtos),
        extraQtd: Number(r.extra_qtd),
         extraValor: Number(r.extra_valor),
      }));
      } catch (err) { handleExternalDbError(err); }
    }),

  // ── KPIs mensais com comparativos SPLY / MOM / M12 / M6 ────────────────────────────────────
  kpisMensais: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      periodo: z.string(), // "YYYY-MM"
    }))
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );
      const [ano, mes] = input.periodo.split("-").map(Number);
      // Helper: datas de um mês
      function mesRange(a: number, m: number) {
        const inicio = `${a}-${String(m).padStart(2,"0")}-01`;
        const fim = new Date(a, m, 0).toISOString().slice(0, 10);
        return { inicio, fim };
      }
      // Períodos
      const atual = mesRange(ano, mes);
      const mom = mes === 1 ? mesRange(ano - 1, 12) : mesRange(ano, mes - 1);
      const sply = mesRange(ano - 1, mes);
      // M6: míia dos 6 meses anteriores ao atual
      const m6Inicio = new Date(ano, mes - 7, 1);
      const m6Fim = new Date(ano, mes - 1, 0);
      // M12: míia dos 12 meses anteriores ao atual
      const m12Inicio = new Date(ano, mes - 13, 1);
      const m12Fim = new Date(ano, mes - 1, 0);
      // Busca KPIs em paralelo
      // dataFim exclusivo para getDiasTrabalhados: primeiro dia do mês seguinte
      const atualFimExcl = new Date(ano, mes, 1).toISOString().slice(0, 10);
      const momFimExcl = new Date(mes === 1 ? ano - 1 : ano, mes === 1 ? 12 : mes - 1, 1).toISOString().slice(0, 10);
      const splyFimExcl = new Date(ano - 1, mes, 1).toISOString().slice(0, 10);
      const m6InicioStr = m6Inicio.toISOString().slice(0, 10);
      const m6FimStr = new Date(ano, mes - 1, 1).toISOString().slice(0, 10); // exclusivo = 1º do mês atual
      const m12InicioStr = m12Inicio.toISOString().slice(0, 10);
      const m12FimStr = new Date(ano, mes - 1, 1).toISOString().slice(0, 10);
      const [kAtual, kMom, kSply, diasAtual, diasMom, diasSply, diasM6, diasM12] = await Promise.all([
        getKpisRealtimeByRange(extIds, atual.inicio, atual.fim),
        getKpisRealtimeByRange(extIds, mom.inicio, mom.fim),
        getKpisRealtimeByRange(extIds, sply.inicio, sply.fim),
        getDiasTrabalhados(extIds, atual.inicio, atualFimExcl),
        getDiasTrabalhados(extIds, mom.inicio, momFimExcl),
        getDiasTrabalhados(extIds, sply.inicio, splyFimExcl),
        getDiasTrabalhadosMedia(extIds, m6InicioStr, m6FimStr),
        getDiasTrabalhadosMedia(extIds, m12InicioStr, m12FimStr),
      ]);
      // M6 e M12: média dos KPIs mensais
      const m6Rows = await Promise.all(
        Array.from({ length: 6 }, (_, i) => {
          const d = new Date(ano, mes - 2 - i, 1);
          return getKpisRealtimeByRange(extIds, mesRange(d.getFullYear(), d.getMonth() + 1).inicio, mesRange(d.getFullYear(), d.getMonth() + 1).fim);
        })
      );
      const m12Rows = await Promise.all(
        Array.from({ length: 12 }, (_, i) => {
          const d = new Date(ano, mes - 2 - i, 1);
          return getKpisRealtimeByRange(extIds, mesRange(d.getFullYear(), d.getMonth() + 1).inicio, mesRange(d.getFullYear(), d.getMonth() + 1).fim);
        })
      );
      function avgKpi(rows: typeof m6Rows, key: keyof typeof m6Rows[0]) {
        const vals = rows.map(r => Number(r[key])).filter(v => v > 0);
        return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      }
      function pct(atual: number, ref: number): number | null {
        if (ref === 0) return null;
        return Math.round((atual - ref) / ref * 1000) / 10;
      }
      const fatAtual = kAtual.faturamento;
      const diasA = diasAtual.diasTrabalhados;
      const fatDiaAtual = diasA > 0 ? fatAtual / diasA : 0;
      const fatDiaMom = diasMom.diasTrabalhados > 0 ? kMom.faturamento / diasMom.diasTrabalhados : 0;
      const fatDiaSply = diasSply.diasTrabalhados > 0 ? kSply.faturamento / diasSply.diasTrabalhados : 0;
      const fatDiaM6 = diasM6.mediaDias > 0 ? avgKpi(m6Rows, "faturamento") / diasM6.mediaDias : 0;
      const fatDiaM12 = diasM12.mediaDias > 0 ? avgKpi(m12Rows, "faturamento") / diasM12.mediaDias : 0;
      return {
        periodo: input.periodo,
        kpis: [
          {
            key: "faturamento",
            label: "FATURAMENTO",
            tipo: "moeda",
            valor: fatAtual,
            sply: { valor: kSply.faturamento, pct: pct(fatAtual, kSply.faturamento) },
            mom: { valor: kMom.faturamento, pct: pct(fatAtual, kMom.faturamento) },
            m12: { valor: avgKpi(m12Rows, "faturamento"), pct: pct(fatAtual, avgKpi(m12Rows, "faturamento")) },
            m6: { valor: avgKpi(m6Rows, "faturamento"), pct: pct(fatAtual, avgKpi(m6Rows, "faturamento")) },
          },
          {
            key: "atendimentos",
            label: "ATENDIMENTOS",
            tipo: "numero",
            valor: kAtual.atendimentos,
            sply: { valor: kSply.atendimentos, pct: pct(kAtual.atendimentos, kSply.atendimentos) },
            mom: { valor: kMom.atendimentos, pct: pct(kAtual.atendimentos, kMom.atendimentos) },
            m12: { valor: avgKpi(m12Rows, "atendimentos"), pct: pct(kAtual.atendimentos, avgKpi(m12Rows, "atendimentos")) },
            m6: { valor: avgKpi(m6Rows, "atendimentos"), pct: pct(kAtual.atendimentos, avgKpi(m6Rows, "atendimentos")) },
          },
          {
            key: "ticketMedio",
            label: "TICKET MÉDIO",
            tipo: "moeda",
            valor: kAtual.ticketMedio,
            sply: { valor: kSply.ticketMedio, pct: pct(kAtual.ticketMedio, kSply.ticketMedio) },
            mom: { valor: kMom.ticketMedio, pct: pct(kAtual.ticketMedio, kMom.ticketMedio) },
            m12: { valor: avgKpi(m12Rows, "ticketMedio"), pct: pct(kAtual.ticketMedio, avgKpi(m12Rows, "ticketMedio")) },
            m6: { valor: avgKpi(m6Rows, "ticketMedio"), pct: pct(kAtual.ticketMedio, avgKpi(m6Rows, "ticketMedio")) },
          },
          {
            key: "clientes",
            label: "CLIENTES",
            tipo: "numero",
            valor: kAtual.totalClientes,
            sply: { valor: kSply.totalClientes, pct: pct(kAtual.totalClientes, kSply.totalClientes) },
            mom: { valor: kMom.totalClientes, pct: pct(kAtual.totalClientes, kMom.totalClientes) },
            m12: { valor: avgKpi(m12Rows, "totalClientes"), pct: pct(kAtual.totalClientes, avgKpi(m12Rows, "totalClientes")) },
            m6: { valor: avgKpi(m6Rows, "totalClientes"), pct: pct(kAtual.totalClientes, avgKpi(m6Rows, "totalClientes")) },
          },
          {
            key: "clientesNovos",
            label: "CLIENTES NOVOS",
            tipo: "numero",
            valor: kAtual.clientesNovos,
            sply: { valor: kSply.clientesNovos, pct: pct(kAtual.clientesNovos, kSply.clientesNovos) },
            mom: { valor: kMom.clientesNovos, pct: pct(kAtual.clientesNovos, kMom.clientesNovos) },
            m12: { valor: avgKpi(m12Rows, "clientesNovos"), pct: pct(kAtual.clientesNovos, avgKpi(m12Rows, "clientesNovos")) },
            m6: { valor: avgKpi(m6Rows, "clientesNovos"), pct: pct(kAtual.clientesNovos, avgKpi(m6Rows, "clientesNovos")) },
          },
          {
            key: "extrasQtd",
            label: "EXTRAS (QTD)",
            tipo: "numero",
            valor: kAtual.servicosExtra,
            sply: { valor: kSply.servicosExtra, pct: pct(kAtual.servicosExtra, kSply.servicosExtra) },
            mom: { valor: kMom.servicosExtra, pct: pct(kAtual.servicosExtra, kMom.servicosExtra) },
            m12: { valor: avgKpi(m12Rows, "servicosExtra"), pct: pct(kAtual.servicosExtra, avgKpi(m12Rows, "servicosExtra")) },
            m6: { valor: avgKpi(m6Rows, "servicosExtra"), pct: pct(kAtual.servicosExtra, avgKpi(m6Rows, "servicosExtra")) },
          },
          {
            key: "extrasValor",
            label: "EXTRAS (R$)",
            tipo: "moeda",
            valor: kAtual.servicosExtraTotal,
            sply: { valor: kSply.servicosExtraTotal, pct: pct(kAtual.servicosExtraTotal, kSply.servicosExtraTotal) },
            mom: { valor: kMom.servicosExtraTotal, pct: pct(kAtual.servicosExtraTotal, kMom.servicosExtraTotal) },
            m12: { valor: avgKpi(m12Rows, "servicosExtraTotal"), pct: pct(kAtual.servicosExtraTotal, avgKpi(m12Rows, "servicosExtraTotal")) },
            m6: { valor: avgKpi(m6Rows, "servicosExtraTotal"), pct: pct(kAtual.servicosExtraTotal, avgKpi(m6Rows, "servicosExtraTotal")) },
          },
          {
            key: "servicosTotais",
            label: "SERVIÇOS TOTAIS",
            tipo: "numero",
            valor: kAtual.servicosTotal,
            sply: { valor: kSply.servicosTotal, pct: pct(kAtual.servicosTotal, kSply.servicosTotal) },
            mom: { valor: kMom.servicosTotal, pct: pct(kAtual.servicosTotal, kMom.servicosTotal) },
            m12: { valor: avgKpi(m12Rows, "servicosTotal"), pct: pct(kAtual.servicosTotal, avgKpi(m12Rows, "servicosTotal")) },
            m6: { valor: avgKpi(m6Rows, "servicosTotal"), pct: pct(kAtual.servicosTotal, avgKpi(m6Rows, "servicosTotal")) },
          },
          {
            key: "diasTrabalhados",
            label: "DIAS TRABALHADOS",
            tipo: "numero",
            valor: diasA,
            sply: { valor: diasSply.diasTrabalhados, pct: pct(diasA, diasSply.diasTrabalhados) },
            mom: { valor: diasMom.diasTrabalhados, pct: pct(diasA, diasMom.diasTrabalhados) },
            m12: { valor: diasM12.mediaDias, pct: pct(diasA, diasM12.mediaDias) },
            m6: { valor: diasM6.mediaDias, pct: pct(diasA, diasM6.mediaDias) },
          },
          {
            key: "fatDia",
            label: "FAT./DIA TRABALHADO",
            tipo: "moeda",
            valor: fatDiaAtual,
            sply: { valor: fatDiaSply, pct: pct(fatDiaAtual, fatDiaSply) },
            mom: { valor: fatDiaMom, pct: pct(fatDiaAtual, fatDiaMom) },
            m12: { valor: fatDiaM12, pct: pct(fatDiaAtual, fatDiaM12) },
            m6: { valor: fatDiaM6, pct: pct(fatDiaAtual, fatDiaM6) },
          },
        ],
      };
    }),

  // Procedure que agrega KPIs de N meses completos (soma do período selecionado)
  // Comparativos: SPLY = mesmo período N meses um ano antes, MOM = N meses imediatamente anteriores
  // M12 = média mensal dos últimos 12 meses, M6 = média mensal dos últimos 6 meses
  kpisPeriodoMensal: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      meses: z.number().int().min(1).max(24),
      colaboradorId: z.number().optional(), // filtra KPIs por colaborador
    }))
    .query(async ({ ctx, input }) => {
      try {
      const { extIds } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );
      const N = input.meses;
      const colabId = input.colaboradorId;
      const now = new Date();
      // Período atual: últimos N meses completos
      // Ex: N=3, hoje=abr/2026 → período = jan/2026 a mar/2026
      const fimMes = new Date(now.getFullYear(), now.getMonth(), 0); // último dia do mês anterior
      const inicioMes = new Date(now.getFullYear(), now.getMonth() - N, 1); // 1º do mês N meses atrás
      const periodoAtualInicio = inicioMes.toISOString().slice(0, 10);
      const periodoAtualFim = fimMes.toISOString().slice(0, 10);
      // SPLY: mesmo período, um ano antes
      const splyInicio = new Date(inicioMes.getFullYear() - 1, inicioMes.getMonth(), 1).toISOString().slice(0, 10);
      const splyFim = new Date(fimMes.getFullYear() - 1, fimMes.getMonth() + 1, 0).toISOString().slice(0, 10);
      // MOM: N meses imediatamente anteriores ao período atual
      const momFim = new Date(inicioMes.getFullYear(), inicioMes.getMonth(), 0);
      const momInicio = new Date(momFim.getFullYear(), momFim.getMonth() - N + 1, 1);
      const momInicioStr = momInicio.toISOString().slice(0, 10);
      const momFimStr = momFim.toISOString().slice(0, 10);
      // M6 e M12: média mensal dos 6/12 meses anteriores ao período atual
      const m6FimExcl = periodoAtualInicio;
      const m6InicioStr = new Date(inicioMes.getFullYear(), inicioMes.getMonth() - 6, 1).toISOString().slice(0, 10);
      const m12FimExcl = periodoAtualInicio;
      const m12InicioStr = new Date(inicioMes.getFullYear(), inicioMes.getMonth() - 12, 1).toISOString().slice(0, 10);
      // Datas exclusivas para getDiasTrabalhados
      const atualFimExcl = new Date(fimMes.getFullYear(), fimMes.getMonth() + 1, 1).toISOString().slice(0, 10);
      const momFimExcl = new Date(momFim.getFullYear(), momFim.getMonth() + 1, 1).toISOString().slice(0, 10);
      const splyFimExcl = new Date(fimMes.getFullYear() - 1, fimMes.getMonth() + 1, 1).toISOString().slice(0, 10);
      const [kAtual, kMom, kSply, diasAtual, diasMom, diasSply, diasM6, diasM12] = await Promise.all([
        getKpisRealtimeByRange(extIds, periodoAtualInicio, periodoAtualFim, colabId),
        getKpisRealtimeByRange(extIds, momInicioStr, momFimStr, colabId),
        getKpisRealtimeByRange(extIds, splyInicio, splyFim, colabId),
        getDiasTrabalhados(extIds, periodoAtualInicio, atualFimExcl),
        getDiasTrabalhados(extIds, momInicioStr, momFimExcl),
        getDiasTrabalhados(extIds, splyInicio, splyFimExcl),
        getDiasTrabalhadosMedia(extIds, m6InicioStr, m6FimExcl),
        getDiasTrabalhadosMedia(extIds, m12InicioStr, m12FimExcl),
      ]);
      // M6 e M12: média mensal dos KPIs
      const m6Rows = await Promise.all(
        Array.from({ length: 6 }, (_, i) => {
          const d = new Date(inicioMes.getFullYear(), inicioMes.getMonth() - 1 - i, 1);
          const ini = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
          const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
          return getKpisRealtimeByRange(extIds, ini, fim, colabId);
        })
      );
      const m12Rows = await Promise.all(
        Array.from({ length: 12 }, (_, i) => {
          const d = new Date(inicioMes.getFullYear(), inicioMes.getMonth() - 1 - i, 1);
          const ini = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
          const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
          return getKpisRealtimeByRange(extIds, ini, fim, colabId);
        })
      );
      const avgKpiP = (rows: typeof m6Rows, key: keyof typeof m6Rows[0]) => {
        const vals = rows.map(r => Number(r[key])).filter(v => v > 0);
        return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      };
      const pctP = (atual: number, ref: number): number | null => {
        if (ref === 0) return null;
        return Math.round((atual - ref) / ref * 1000) / 10;
      };
      const fatAtual = kAtual.faturamento;
      const diasA = diasAtual.diasTrabalhados;
      const fatDiaAtual = diasA > 0 ? fatAtual / diasA : 0;
      const fatDiaMom = diasMom.diasTrabalhados > 0 ? kMom.faturamento / diasMom.diasTrabalhados : 0;
      const fatDiaSply = diasSply.diasTrabalhados > 0 ? kSply.faturamento / diasSply.diasTrabalhados : 0;
      const fatDiaM6 = diasM6.mediaDias > 0 ? avgKpiP(m6Rows, "faturamento") / diasM6.mediaDias : 0;
      const fatDiaM12 = diasM12.mediaDias > 0 ? avgKpiP(m12Rows, "faturamento") / diasM12.mediaDias : 0;
      const MESES_ABREV = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
      const periodoLabel = `${MESES_ABREV[inicioMes.getMonth()]}/${inicioMes.getFullYear()} – ${MESES_ABREV[fimMes.getMonth()]}/${fimMes.getFullYear()}`;
      return {
        periodoLabel,
        periodoAtualInicio,
        periodoAtualFim,
        kpis: [
          { key: "faturamento", label: "FATURAMENTO", tipo: "moeda",
            valor: fatAtual,
            sply: { valor: kSply.faturamento, pct: pctP(fatAtual, kSply.faturamento) },
            mom:  { valor: kMom.faturamento,  pct: pctP(fatAtual, kMom.faturamento) },
            m12:  { valor: avgKpiP(m12Rows, "faturamento"), pct: pctP(fatAtual, avgKpiP(m12Rows, "faturamento")) },
            m6:   { valor: avgKpiP(m6Rows,  "faturamento"), pct: pctP(fatAtual, avgKpiP(m6Rows,  "faturamento")) },
          },
          { key: "atendimentos", label: "ATENDIMENTOS", tipo: "numero",
            valor: kAtual.atendimentos,
            sply: { valor: kSply.atendimentos, pct: pctP(kAtual.atendimentos, kSply.atendimentos) },
            mom:  { valor: kMom.atendimentos,  pct: pctP(kAtual.atendimentos, kMom.atendimentos) },
            m12:  { valor: avgKpiP(m12Rows, "atendimentos"), pct: pctP(kAtual.atendimentos, avgKpiP(m12Rows, "atendimentos")) },
            m6:   { valor: avgKpiP(m6Rows,  "atendimentos"), pct: pctP(kAtual.atendimentos, avgKpiP(m6Rows,  "atendimentos")) },
          },
          { key: "ticketMedio", label: "TICKET MÉDIO", tipo: "moeda",
            valor: kAtual.ticketMedio,
            sply: { valor: kSply.ticketMedio, pct: pctP(kAtual.ticketMedio, kSply.ticketMedio) },
            mom:  { valor: kMom.ticketMedio,  pct: pctP(kAtual.ticketMedio, kMom.ticketMedio) },
            m12:  { valor: avgKpiP(m12Rows, "ticketMedio"), pct: pctP(kAtual.ticketMedio, avgKpiP(m12Rows, "ticketMedio")) },
            m6:   { valor: avgKpiP(m6Rows,  "ticketMedio"), pct: pctP(kAtual.ticketMedio, avgKpiP(m6Rows,  "ticketMedio")) },
          },
          { key: "clientes", label: "CLIENTES", tipo: "numero",
            valor: kAtual.totalClientes,
            sply: { valor: kSply.totalClientes, pct: pctP(kAtual.totalClientes, kSply.totalClientes) },
            mom:  { valor: kMom.totalClientes,  pct: pctP(kAtual.totalClientes, kMom.totalClientes) },
            m12:  { valor: avgKpiP(m12Rows, "totalClientes"), pct: pctP(kAtual.totalClientes, avgKpiP(m12Rows, "totalClientes")) },
            m6:   { valor: avgKpiP(m6Rows,  "totalClientes"), pct: pctP(kAtual.totalClientes, avgKpiP(m6Rows,  "totalClientes")) },
          },
          { key: "clientesNovos", label: "CLIENTES NOVOS", tipo: "numero",
            valor: kAtual.clientesNovos,
            sply: { valor: kSply.clientesNovos, pct: pctP(kAtual.clientesNovos, kSply.clientesNovos) },
            mom:  { valor: kMom.clientesNovos,  pct: pctP(kAtual.clientesNovos, kMom.clientesNovos) },
            m12:  { valor: avgKpiP(m12Rows, "clientesNovos"), pct: pctP(kAtual.clientesNovos, avgKpiP(m12Rows, "clientesNovos")) },
            m6:   { valor: avgKpiP(m6Rows,  "clientesNovos"), pct: pctP(kAtual.clientesNovos, avgKpiP(m6Rows,  "clientesNovos")) },
          },
          { key: "extrasQtd", label: "EXTRAS (QTD)", tipo: "numero",
            valor: kAtual.servicosExtra,
            sply: { valor: kSply.servicosExtra, pct: pctP(kAtual.servicosExtra, kSply.servicosExtra) },
            mom:  { valor: kMom.servicosExtra,  pct: pctP(kAtual.servicosExtra, kMom.servicosExtra) },
            m12:  { valor: avgKpiP(m12Rows, "servicosExtra"), pct: pctP(kAtual.servicosExtra, avgKpiP(m12Rows, "servicosExtra")) },
            m6:   { valor: avgKpiP(m6Rows,  "servicosExtra"), pct: pctP(kAtual.servicosExtra, avgKpiP(m6Rows,  "servicosExtra")) },
          },
          { key: "extrasValor", label: "EXTRAS (R$)", tipo: "moeda",
            valor: kAtual.servicosExtraTotal,
            sply: { valor: kSply.servicosExtraTotal, pct: pctP(kAtual.servicosExtraTotal, kSply.servicosExtraTotal) },
            mom:  { valor: kMom.servicosExtraTotal,  pct: pctP(kAtual.servicosExtraTotal, kMom.servicosExtraTotal) },
            m12:  { valor: avgKpiP(m12Rows, "servicosExtraTotal"), pct: pctP(kAtual.servicosExtraTotal, avgKpiP(m12Rows, "servicosExtraTotal")) },
            m6:   { valor: avgKpiP(m6Rows,  "servicosExtraTotal"), pct: pctP(kAtual.servicosExtraTotal, avgKpiP(m6Rows,  "servicosExtraTotal")) },
          },
          { key: "servicosTotais", label: "SERVIÇOS TOTAIS", tipo: "numero",
            valor: kAtual.servicosTotal,
            sply: { valor: kSply.servicosTotal, pct: pctP(kAtual.servicosTotal, kSply.servicosTotal) },
            mom:  { valor: kMom.servicosTotal,  pct: pctP(kAtual.servicosTotal, kMom.servicosTotal) },
            m12:  { valor: avgKpiP(m12Rows, "servicosTotal"), pct: pctP(kAtual.servicosTotal, avgKpiP(m12Rows, "servicosTotal")) },
            m6:   { valor: avgKpiP(m6Rows,  "servicosTotal"), pct: pctP(kAtual.servicosTotal, avgKpiP(m6Rows,  "servicosTotal")) },
          },
          { key: "diasTrabalhados", label: "DIAS TRABALHADOS", tipo: "numero",
            valor: diasA,
            sply: { valor: diasSply.diasTrabalhados, pct: pctP(diasA, diasSply.diasTrabalhados) },
            mom:  { valor: diasMom.diasTrabalhados,  pct: pctP(diasA, diasMom.diasTrabalhados) },
            m12:  { valor: diasM12.mediaDias, pct: pctP(diasA, diasM12.mediaDias) },
            m6:   { valor: diasM6.mediaDias,  pct: pctP(diasA, diasM6.mediaDias) },
          },
          { key: "fatDia", label: "FAT./DIA TRABALHADO", tipo: "moeda",
            valor: fatDiaAtual,
            sply: { valor: fatDiaSply, pct: pctP(fatDiaAtual, fatDiaSply) },
            mom:  { valor: fatDiaMom,  pct: pctP(fatDiaAtual, fatDiaMom) },
            m12:  { valor: fatDiaM12,  pct: pctP(fatDiaAtual, fatDiaM12) },
            m6:   { valor: fatDiaM6,   pct: pctP(fatDiaAtual, fatDiaM6) },
          },
        ],
      };
      } catch (err) { handleExternalDbError(err); }
    }),
  // ── Lista colaboradores para filtro mensal ──────────────────────────────────
  listarColaboradoresMensal: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      dataInicio: z.string().optional(), // 'YYYY-MM-DD' — filtra colaboradores com vendas no período
      dataFim: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );
      const rows = await getListaColaboradoresMensal(extIds, input.dataInicio, input.dataFim);
      return rows.map(r => ({
        id: Number(r.colaborador_id),
        nome: String(r.colaborador_nome),
        tipo: String(r.tipo),
      }));
    }),

  // ── Painel de Clientes ────────────────────────────────────────────────────────
  clientesKpis: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      dataInicio: z.string(), // 'YYYY-MM-DD'
      dataFim: z.string(),    // 'YYYY-MM-DD'
      colaboradorId: z.number().nullable().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { extIds } = await resolveExternalIds((ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser);
        return await getClientesKpis(extIds, input.dataInicio, input.dataFim, input.colaboradorId);
      } catch (err) { handleExternalDbError(err); }
    }),

  clientesDistribuicaoStatus: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      colaboradorId: z.number().nullable().optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { extIds } = await resolveExternalIds((ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser);
        return await getClientesDistribuicaoStatus(extIds, input.colaboradorId, input.dataInicio, input.dataFim);
      } catch (err) { handleExternalDbError(err); }
    }),

  clientesEvolucaoMensal: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      dataInicio: z.string(),
      dataFim: z.string(),
      colaboradorId: z.number().nullable().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { extIds } = await resolveExternalIds((ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser);
        return await getClientesEvolucaoMensal(extIds, input.dataInicio, input.dataFim, input.colaboradorId);
      } catch (err) { handleExternalDbError(err); }
    }),

  clientesDistribuicaoFrequencia: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      dataInicio: z.string(),
      dataFim: z.string(),
      colaboradorId: z.number().nullable().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { extIds } = await resolveExternalIds((ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser);
        return await getClientesDistribuicaoFrequencia(extIds, input.dataInicio, input.dataFim, input.colaboradorId);
      } catch (err) { handleExternalDbError(err); }
    }),

  clientesDistribuicaoDiasSemVir: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      dataInicio: z.string(),
      dataFim: z.string(),
      colaboradorId: z.number().nullable().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { extIds } = await resolveExternalIds((ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser);
        return await getClientesDistribuicaoDiasSemVir(extIds, input.dataInicio, input.dataFim, input.colaboradorId);
      } catch (err) { handleExternalDbError(err); }
    }),

  clientesTop: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      dataInicio: z.string(),
      dataFim: z.string(),
      limit: z.number().default(10),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { extIds } = await resolveExternalIds((ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser);
        return await getClientesTop(extIds, input.dataInicio, input.dataFim, input.limit);
      } catch (err) { handleExternalDbError(err); }
    }),
  // ── Churn & Risco ───────────────────────────────────────────────────────────────────
  clientesChurnRisco: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      dataInicio: z.string(),
      dataFim: z.string(),
      colaboradorId: z.number().nullable().optional(),
      statusFiltro: z.enum(["em_risco", "perdido"]).nullable().optional(),
      limit: z.number().default(200),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { extIds } = await resolveExternalIds((ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser);
        return await getClientesChurnRisco(extIds, input.dataInicio, input.dataFim, input.colaboradorId, input.statusFiltro, input.limit);
      } catch (err) { handleExternalDbError(err); }
    }),
  clientesTopExpandido: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      dataInicio: z.string(),
      dataFim: z.string(),
      limit: z.number().default(100),
      offset: z.number().default(0),
      search: z.string().default(""),
      colaboradorId: z.number().nullable().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { extIds } = await resolveExternalIds((ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser);
        return await getClientesTopExpandido(extIds, input.dataInicio, input.dataFim, input.limit, input.offset, input.search, input.colaboradorId);
      } catch (err) { handleExternalDbError(err); }
    }),
  listarColaboradoresClientes: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      dataInicio: z.string(),
      dataFim: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { extIds } = await resolveExternalIds((ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser);
        return await getListaColaboradoresClientes(extIds, input.dataInicio, input.dataFim);
      } catch (err) { handleExternalDbError(err); }
    }),
  // ── Detalhes de um cliente específico ────────────────────────────────────────────────
  clienteDetalhes: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      clienteId: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { extIds } = await resolveExternalIds((ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser);
        return await getClienteDetalhes(extIds, input.clienteId);
      } catch (err) { handleExternalDbError(err); }
    }),

  // ── Faturamento mensal com filtros avançados ────────────────────────────────────────────
  faturamentoMensalFiltrado: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      dataInicio: z.string(), // 'YYYY-MM-DD'
      dataFim: z.string(),    // 'YYYY-MM-DD' (exclusive)
      colaboradorId: z.number().optional(),
      tipo: z.enum(["todos", "colaborador", "caixa"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { extIds } = await resolveExternalIds(
          (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
        );
        const tipoFiltro = input.tipo === "todos" ? undefined : input.tipo;
        return await getFaturamentoMensalDetalhadoFiltrado(
          extIds,
          input.dataInicio,
          input.dataFim,
          input.colaboradorId,
          tipoFiltro,
        );
      } catch (err) { handleExternalDbError(err); }
    }),

  // ── Registrar contato WhatsApp com cliente ────────────────────────────────────────────
  registrarContatoCliente: sysUserProcedure
    .input(z.object({
      clienteExtId: z.number(),
      mensagem: z.string().optional(),
      orgId: z.number().optional(),
      unitId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const { getDb: getLocalDb } = await import("../db.js");
        const { clienteContatos } = await import("../../drizzle/schema.js");
        const localDb = await getLocalDb();
        if (!localDb) return { ok: false };
        await localDb.insert(clienteContatos).values({
          clienteExtId: input.clienteExtId,
          mensagem: input.mensagem ?? null,
          orgId: input.orgId ?? null,
          unitId: input.unitId ?? null,
        });
        return { ok: true };
      } catch (err) {
        console.error('[registrarContatoCliente]', err);
        return { ok: false };
      }
    }),

  // ── Buscar último contato WhatsApp de um cliente ────────────────────────────────────────
  buscarUltimoContato: sysUserProcedure
    .input(z.object({
      clienteExtId: z.number(),
      orgId: z.number().optional(),
      unitId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      try {
        const { getDb: getLocalDb } = await import("../db.js");
        const { clienteContatos } = await import("../../drizzle/schema.js");
        const { desc, eq, and } = await import("drizzle-orm");
        const localDb = await getLocalDb();
        if (!localDb) return null;
        const conditions: any[] = [eq(clienteContatos.clienteExtId, input.clienteExtId)];
        if (input.unitId) conditions.push(eq(clienteContatos.unitId, input.unitId));
        const rows = await localDb
          .select()
          .from(clienteContatos)
          .where(and(...conditions))
          .orderBy(desc(clienteContatos.criadoEm))
          .limit(1);
        return rows[0] ?? null;
      } catch (err) {
        console.error('[buscarUltimoContato]', err);
        return null;
      }
    }),

  // ── Listar todos os contatos WhatsApp de um cliente ────────────────────────────────────────
  listarContatosCliente: sysUserProcedure
    .input(z.object({
      clienteExtId: z.number(),
      orgId: z.number().optional(),
      unitId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      try {
        const { getDb: getLocalDb } = await import("../db.js");
        const { clienteContatos } = await import("../../drizzle/schema.js");
        const { desc, eq, and } = await import("drizzle-orm");
        const localDb = await getLocalDb();
        if (!localDb) return [];
        const conditions: any[] = [eq(clienteContatos.clienteExtId, input.clienteExtId)];
        if (input.unitId) conditions.push(eq(clienteContatos.unitId, input.unitId));
        return await localDb
          .select()
          .from(clienteContatos)
          .where(and(...conditions))
          .orderBy(desc(clienteContatos.criadoEm))
          .limit(20);
      } catch (err) {
        console.error('[listarContatosCliente]', err);
        return [];
      }
    }),


  // ── Churn & Saúde da Base ────────────────────────────────────────────────────────────────
  churnSaudeBase: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      dataInicio: z.string(),
      dataFim: z.string(),
      janelaDias: z.number().default(60),
      colaboradorId: z.number().nullable().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const { extIds } = await resolveExternalIds((ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser);
      return getChurnSaudeBase(extIds, input.dataInicio, input.dataFim, input.janelaDias, input.colaboradorId);
    }),

  // ── Churn por Barbeiro ───────────────────────────────────────────────────────────────────────────────────────
  churnPorBarbeiro: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      dataInicio: z.string(),
      dataFim: z.string(),
      janelaDias: z.number().default(60),
      colaboradorId: z.number().nullable().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const { extIds } = await resolveExternalIds((ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser);
      return getChurnPorBarbeiro(extIds, input.dataInicio, input.dataFim, input.janelaDias, input.colaboradorId);
    }),

  // ── Meta Faixas (comissão progressiva) ──────────────────────────────────────────────────────────────────
  // Lista todas as faixas de uma unidade
  metaFaixasList: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { orgFilter, unitFilter } = await resolveUnitFilter((ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser);
      const conditions = [];
      if (unitFilter) conditions.push(eq(metaFaixas.unitId, unitFilter));
      else if (orgFilter) conditions.push(eq(metaFaixas.orgId, orgFilter));
      const rows = conditions.length > 0
        ? await db.select().from(metaFaixas).where(and(...conditions)).orderBy(asc(metaFaixas.ordem))
        : await db.select().from(metaFaixas).orderBy(asc(metaFaixas.ordem));
      return rows.map(r => ({
        id: r.id,
        unitId: r.unitId,
        orgId: r.orgId,
        ordem: r.ordem,
        valorMinServicos: Number(r.valorMinServicos),
        pctComissao: Number(r.pctComissao),
        descricao: r.descricao ?? "",
        ativo: r.ativo === 1,
      }));
    }),

  // Salva (cria ou atualiza) uma faixa
  metaFaixaSave: sysUserProcedure
    .input(z.object({
      id: z.number().optional(),            // undefined = criar novo
      unitId: z.number(),
      orgId: z.number(),
      ordem: z.number().default(0),
      valorMinServicos: z.number().min(0),
      pctComissao: z.number().min(0).max(100),
      descricao: z.string().optional(),
      ativo: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = (ctx.user?.role ?? "user") === "admin";
      if (!isAdmin && !ctx.sysUser) throw new TRPCError({ code: "FORBIDDEN" });
      if (!isAdmin && ctx.sysUser && !ctx.sysUser.allowedUnitIds.includes(input.unitId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para editar esta unidade" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input.id) {
        await db.update(metaFaixas).set({
          ordem: input.ordem,
          valorMinServicos: String(input.valorMinServicos),
          pctComissao: String(input.pctComissao),
          descricao: input.descricao ?? null,
          ativo: input.ativo ? 1 : 0,
        }).where(eq(metaFaixas.id, input.id));
        return { id: input.id };
      } else {
        const [result] = await db.insert(metaFaixas).values({
          unitId: input.unitId,
          orgId: input.orgId,
          ordem: input.ordem,
          valorMinServicos: String(input.valorMinServicos),
          pctComissao: String(input.pctComissao),
          descricao: input.descricao ?? null,
          ativo: input.ativo ? 1 : 0,
        }) as any;
        return { id: (result as any).insertId };
      }
    }),

  // Salva todas as faixas de uma unidade de uma vez (substitui)
  metaFaixasSaveAll: sysUserProcedure
    .input(z.object({
      unitId: z.number(),
      orgId: z.number(),
      faixas: z.array(z.object({
        id: z.number().optional(),
        ordem: z.number(),
        valorMinServicos: z.number().min(0),
        pctComissao: z.number().min(0).max(100),
        descricao: z.string().optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = (ctx.user?.role ?? "user") === "admin";
      if (!isAdmin && !ctx.sysUser) throw new TRPCError({ code: "FORBIDDEN" });
      if (!isAdmin && ctx.sysUser && !ctx.sysUser.allowedUnitIds.includes(input.unitId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para editar esta unidade" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Deleta todas as faixas existentes da unidade
      await db.delete(metaFaixas).where(and(
        eq(metaFaixas.unitId, input.unitId),
        eq(metaFaixas.orgId, input.orgId),
      ));
      // Insere as novas faixas
      if (input.faixas.length > 0) {
        await db.insert(metaFaixas).values(
          input.faixas.map((f, i) => ({
            unitId: input.unitId,
            orgId: input.orgId,
            ordem: i,
            valorMinServicos: String(f.valorMinServicos),
            pctComissao: String(f.pctComissao),
            descricao: f.descricao ?? null,
            ativo: 1,
          }))
        );
      }
      return { success: true, count: input.faixas.length };
    }),

  // Deleta uma faixa
  metaFaixaDelete: sysUserProcedure
    .input(z.object({ id: z.number(), unitId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = (ctx.user?.role ?? "user") === "admin";
      if (!isAdmin && !ctx.sysUser) throw new TRPCError({ code: "FORBIDDEN" });
      if (!isAdmin && ctx.sysUser && input.unitId && !ctx.sysUser.allowedUnitIds.includes(input.unitId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para editar esta unidade" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(metaFaixas).where(eq(metaFaixas.id, input.id));
      return { success: true };
    }),

  // ── Metas Dinâmicas ──────────────────────────────────────────────────────────
  metaDinamicaList: sysUserProcedure
    .input(z.object({ unitId: z.number(), orgId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db.select().from(metasDinamicas).where(
        and(
          eq(metasDinamicas.unitId, input.unitId),
          eq(metasDinamicas.orgId, input.orgId),
          eq(metasDinamicas.ativo, 1),
        )
      ).orderBy(asc(metasDinamicas.createdAt));
      return rows.map(r => ({
        ...r,
        config: (() => { try { return JSON.parse(r.config); } catch { return {}; } })(),
        bonusValor: Number(r.bonusValor),
      }));
    }),

  metaDinamicaSave: sysUserProcedure
    .input(z.object({
      id: z.number().optional(),
      unitId: z.number(),
      orgId: z.number(),
      nome: z.string().min(1),
      tipo: z.enum(["produto", "servicos_multiplos"]),
      config: z.record(z.string(), z.any()),
      bonusTipo: z.enum(["fixo", "percentual"]),
      bonusValor: z.number().min(0),
      mesVigencia: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if ((ctx.user?.role ?? "user") !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const configStr = JSON.stringify(input.config);
      if (input.id) {
        await db.update(metasDinamicas).set({
          nome: input.nome,
          tipo: input.tipo,
          config: configStr,
          bonusTipo: input.bonusTipo,
          bonusValor: String(input.bonusValor),
          mesVigencia: input.mesVigencia ?? null,
          updatedAt: new Date(),
        }).where(eq(metasDinamicas.id, input.id));
        return { success: true, id: input.id };
      } else {
        const [result] = await db.insert(metasDinamicas).values({
          unitId: input.unitId,
          orgId: input.orgId,
          nome: input.nome,
          tipo: input.tipo,
          config: configStr,
          bonusTipo: input.bonusTipo,
          bonusValor: String(input.bonusValor),
          mesVigencia: input.mesVigencia ?? null,
          ativo: 1,
        });
        return { success: true, id: (result as any).insertId };
      }
    }),

  metaDinamicaDelete: sysUserProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if ((ctx.user?.role ?? "user") !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(metasDinamicas).set({ ativo: 0 }).where(eq(metasDinamicas.id, input.id));
      return { success: true };
    }),

  // Calcula o atingimento das metas dinâmicas para um período
  metaDinamicaCalc: sysUserProcedure
    .input(z.object({
      unitId: z.number(),
      orgId: z.number(),
      mes: z.number(),
      ano: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const mesStr = `${input.ano}-${String(input.mes).padStart(2, '0')}`;
      const metas = await db.select().from(metasDinamicas).where(
        and(
          eq(metasDinamicas.unitId, input.unitId),
          eq(metasDinamicas.orgId, input.orgId),
          eq(metasDinamicas.ativo, 1),
        )
      );
      const metasAtivas = metas.filter(m =>
        m.mesVigencia === null || m.mesVigencia === mesStr
      );
      if (metasAtivas.length === 0) return [];

      const extInfo = await resolveExternalIds((ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser);
      if (!extInfo || extInfo.extIds.length === 0) return [];
      const unitIds = extInfo.extIds;
      const { queryLocal } = await import("../db-local");

      const dataInicio = `${input.ano}-${String(input.mes).padStart(2, '0')}-01`;
      const dataFimExcl = input.mes === 12
        ? `${input.ano + 1}-01-01`
        : `${input.ano}-${String(input.mes + 1).padStart(2, '0')}-01`;

      const resultados: Record<string, { colaboradorId: string; colaboradorNome: string; bonusTotal: number; metasBatidas: { nome: string; bonus: number }[] }> = {};
      // Filtro de unidade direto em sync_vendas_produtos.unidade_id
      const unitCondBonus = unitIds.length === 0 ? "1=1"
        : unitIds.length === 1 ? `vp.unidade_id = ${unitIds[0]}`
        : `vp.unidade_id IN (${unitIds.join(',')})`;
      const unitCondBonus2 = unitIds.length === 0 ? "1=1"
        : unitIds.length === 1 ? `vp.unidade_id = ${unitIds[0]}`
        : `vp.unidade_id IN (${unitIds.join(',')})`;
      for (const meta of metasAtivas) {
        const config = (() => { try { return JSON.parse(meta.config); } catch { return {}; } })();
        const bonusValor = Number(meta.bonusValor);

        if (meta.tipo === "produto") {
          const criterio = config.criterio ?? "valor";

          if (criterio === "quantidade") {
            const qtdMin = Number(config.qtdMinProdutos ?? 1);
            const rows = await queryLocal(
              `SELECT uu.id AS colaboradorId, uu.nome AS colaboradorNome,
                 COALESCE(SUM(CASE WHEN p.tipo IN ('probar','proemp','proins') THEN vp.quantidade ELSE 0 END), 0) AS qtdProdutos,
                 COALESCE(SUM(CASE WHEN p.tipo IN ('probar','proemp','proins') THEN vp.valor_total ELSE 0 END), 0) AS totalProdutos
               FROM sync_vendas_produtos vp
               JOIN sync_usuarios uu ON uu.id = vp.colaborador
               JOIN sync_vendas v ON v.id = vp.venda
               JOIN sync_produtos p ON p.id = vp.produto
               WHERE ${unitCondBonus}
                 AND v.data_criacao >= ? AND v.data_criacao < ?
                 AND v.comanda_temp = 0 AND v.status = 1
               GROUP BY uu.id, uu.nome
               HAVING qtdProdutos >= ?`,
              [dataInicio, dataFimExcl, qtdMin]
            );
            for (const row of rows as any[]) {
              const key = String(row.colaboradorId);
              if (!resultados[key]) resultados[key] = { colaboradorId: key, colaboradorNome: row.colaboradorNome, bonusTotal: 0, metasBatidas: [] };
              const bonus = meta.bonusTipo === "percentual"
                ? (bonusValor / 100) * Number(row.totalProdutos)
                : bonusValor;
              resultados[key].bonusTotal += bonus;
              resultados[key].metasBatidas.push({ nome: meta.nome, bonus });
            }
          } else {
            const valorMin = Number(config.valorMinProdutos ?? 0);
            const rows = await queryLocal(
              `SELECT uu.id AS colaboradorId, uu.nome AS colaboradorNome,
                 COALESCE(SUM(CASE WHEN p.tipo IN ('probar','proemp','proins') THEN vp.valor_total ELSE 0 END), 0) AS totalProdutos
               FROM sync_vendas_produtos vp
               JOIN sync_usuarios uu ON uu.id = vp.colaborador
               JOIN sync_vendas v ON v.id = vp.venda
               JOIN sync_produtos p ON p.id = vp.produto
               WHERE ${unitCondBonus}
                 AND v.data_criacao >= ? AND v.data_criacao < ?
                 AND v.comanda_temp = 0 AND v.status = 1
               GROUP BY uu.id, uu.nome
               HAVING totalProdutos >= ?`,
              [dataInicio, dataFimExcl, valorMin]
            );
            for (const row of rows as any[]) {
              const key = String(row.colaboradorId);
              if (!resultados[key]) resultados[key] = { colaboradorId: key, colaboradorNome: row.colaboradorNome, bonusTotal: 0, metasBatidas: [] };
              const bonus = meta.bonusTipo === "percentual"
                ? (bonusValor / 100) * Number(row.totalProdutos)
                : bonusValor;
              resultados[key].bonusTotal += bonus;
              resultados[key].metasBatidas.push({ nome: meta.nome, bonus });
            }
          }
        } else if (meta.tipo === "servicos_multiplos") {
          const minServicos = Number(config.minServicosComanda ?? 2);
          const minComandas = Number(config.minComandas ?? 1);
          const rows = await queryLocal(
            `SELECT uu.id AS colaboradorId, uu.nome AS colaboradorNome, COUNT(*) AS totalComandas
             FROM (
               SELECT vp.colaborador, vp.venda
               FROM sync_vendas_produtos vp
               JOIN sync_vendas v ON v.id = vp.venda
               JOIN sync_produtos p ON p.id = vp.produto
               WHERE ${unitCondBonus2}
                 AND v.data_criacao >= ? AND v.data_criacao < ?
                 AND v.comanda_temp = 0 AND v.status = 1
                 AND p.tipo = 'ser'
               GROUP BY vp.colaborador, vp.venda
               HAVING COUNT(*) >= ?
             ) sub
             JOIN sync_usuarios uu ON uu.id = sub.colaborador
             GROUP BY sub.colaborador, uu.nome
             HAVING totalComandas >= ?`,
            [dataInicio, dataFimExcl, minServicos, minComandas]
          );
          for (const row of rows as any[]) {
            const key = String(row.colaboradorId);
            if (!resultados[key]) resultados[key] = { colaboradorId: key, colaboradorNome: row.colaboradorNome, bonusTotal: 0, metasBatidas: [] };
            resultados[key].bonusTotal += bonusValor;
            resultados[key].metasBatidas.push({ nome: meta.nome, bonus: bonusValor });
          }
        }
      }
        return Object.values(resultados);
    }),

  /** Lista produtos do banco externo com categorias salvas localmente */
  listProdutosExterno: sysUserProcedure
    .input(z.object({ orgId: z.number().optional(), unitId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const { extIds, orgFilter } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );
      const { queryLocal } = await import("../db-local");
      const unitCond3 = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `vp.unidade_id = ${extIds[0]}`
        : `vp.unidade_id IN (${extIds.join(",")})`;
      // Busca todos os produtos distintos do banco local (tipo != 'ser')
      const extProdutos = await queryLocal<{ nome: string; qtd: number; valorTotal: number }>(`
        SELECT p.nome, COUNT(*) as qtd, COALESCE(SUM(vp.valor_total), 0) as valorTotal
        FROM sync_produtos p
        JOIN sync_vendas_produtos vp ON vp.produto = p.id
        JOIN sync_vendas v ON vp.venda = v.id
        WHERE ${unitCond3}
          AND p.tipo != 'ser'
          AND v.comanda_temp = 0
          AND v.status = 1
        GROUP BY p.nome
        ORDER BY qtd DESC
      `);

       // Busca categorias salvas no banco local (case-insensitive)
      const db = await getDb();
      let catMap: Record<string, string> = {};
      if (db && orgFilter) {
        const [catRows] = await db.execute(sql`
          SELECT nomeProduto, categoria FROM produto_categorias WHERE orgId = ${orgFilter}
        `) as any;
        for (const r of catRows as any[]) {
          catMap[r.nomeProduto.toLowerCase()] = r.categoria;
        }
      }
      return extProdutos.map(p => ({
        nome: p.nome,
        qtd: Number(p.qtd),
        valorTotal: Number(p.valorTotal ?? 0),
        categoria: (catMap[p.nome.toLowerCase()] as "cabelo" | "barba" | "outros" | null) ?? null,
      }));
    }),

  /** Salva (upsert) a categoria de um ou mais produtos */
  saveProdutoCategorias: sysUserProcedure
    .input(z.object({
      orgId: z.number().optional(),
      produtos: z.array(z.object({
        nome: z.string(),
        categoria: z.enum(["cabelo", "barba", "outros"]),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      // Resolve orgId correto via sysUser (mesmo padrão da listagem)
      const { orgFilter } = await resolveUnitFilter(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, undefined, ctx.sysUser
      );
      const resolvedOrgId = orgFilter ?? input.orgId;
      if (!resolvedOrgId) throw new TRPCError({ code: "BAD_REQUEST", message: "orgId não encontrado" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      for (const p of input.produtos) {
        await db.execute(sql`
          INSERT INTO produto_categorias (orgId, nomeProduto, categoria)
          VALUES (${resolvedOrgId}, ${p.nome}, ${p.categoria})
          ON DUPLICATE KEY UPDATE categoria = ${p.categoria}
        `);
      }
      return { success: true, count: input.produtos.length };
    }),
});