/**
 * server/routers/dataVip.ts
 * Router tRPC do módulo Data VIP
 * Dados operacionais: banco externo (franquia_producao via SSH tunnel)
 * Dados de configuração: banco interno (VIP Suite)
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
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
  getRankingUnidades,
  getDiasTrabalhados,
  getServicosExtra,
} from "../dataVipQueries";

// Inicializa scheduler automático (08:00 BRT)
startAutoSyncScheduler();

// ─── Helper: resolve filtro de unidades (banco interno) ──────────────────────
async function resolveUnitFilter(
  userId: number,
  userRole: string,
  orgId?: number,
  unitId?: number
): Promise<{ orgFilter: number | null; unitFilter: number | null; isAdmin: boolean }> {
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
  unitId?: number
): Promise<{ extIds: number[]; isAdmin: boolean; unitFilter: number | null; orgFilter: number | null }> {
  const { orgFilter, unitFilter, isAdmin } = await resolveUnitFilter(userId, userRole, orgId, unitId);
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
  // ── Dashboard KPIs ──────────────────────────────────────────────────────────
  dashboard: protectedProcedure
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
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
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
  faturamentoMensal: protectedProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      meses: z.number().default(12),
    }))
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
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

  // ── Faturamento por produto e forma de pagamento ─────────────────────────────
  faturamentoPorProduto: protectedProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      periodo: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
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
  ranking: protectedProcedure
    .input(z.object({ orgId: z.number().optional(), periodo: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const { extIds, isAdmin, unitFilter, orgFilter } = await resolveExternalIds(
        ctx.user.id, ctx.user.role, input.orgId
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
  clientes: protectedProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      search: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(50),
    }))
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );
      const { queryExternal } = await import("../db-external");
      const unitCond = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `ultima_visita_unidade = ${extIds[0]}`
        : `ultima_visita_unidade IN (${extIds.join(",")})`;
      let searchCond = "";
      const params: unknown[] = [];
      if (input.search) {
        searchCond = ` AND (nome LIKE ? OR telefone LIKE ?)`;
        params.push(`%${input.search}%`, `%${input.search}%`);
      }
      const offset = (input.page - 1) * input.pageSize;
      const rows = await queryExternal<{
        id: number; nome: string; telefone: string;
        data_criacao: Date; ultima_visita: Date; visitas: number; consumo: number;
      }>(`
        SELECT id, nome, telefone, data_criacao, ultima_visita, visitas, consumo
        FROM clientes
        WHERE ${unitCond} AND status = 1${searchCond}
        ORDER BY ultima_visita DESC
        LIMIT ${input.pageSize} OFFSET ${offset}
      `, params);
      const cntRows = await queryExternal<{ total: number }>(`
        SELECT COUNT(*) as total FROM clientes
        WHERE ${unitCond} AND status = 1${searchCond}
      `, params);
      return {
        clientes: rows.map(r => ({
          clienteId: String(r.id),
          clienteNome: r.nome,
          telefone: r.telefone,
          primeiraVenda: r.data_criacao,
          ultimaVenda: r.ultima_visita,
          totalVisitas: Number(r.visitas),
          totalGasto: Number(r.consumo),
          dias: r.ultima_visita ? Math.floor((Date.now() - new Date(r.ultima_visita).getTime()) / 86400000) : 999,
        })),
        total: Number(cntRows[0]?.total ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  // ── Raio X de retenção ───────────────────────────────────────────────────────
  raioX: protectedProcedure
    .input(z.object({ orgId: z.number().optional(), unitId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );
      const { queryExternal } = await import("../db-external");
      const unitCond = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `ultima_visita_unidade = ${extIds[0]}`
        : `ultima_visita_unidade IN (${extIds.join(",")})`;
      const rows = await queryExternal<{
        id: number; nome: string; telefone: string;
        data_criacao: Date; ultima_visita: Date; visitas: number; consumo: number;
      }>(`
        SELECT id, nome, telefone, data_criacao, ultima_visita, visitas, consumo
        FROM clientes
        WHERE ${unitCond} AND status = 1 AND ultima_visita IS NOT NULL
        ORDER BY ultima_visita DESC
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
  colaboradores: protectedProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      periodo: z.string().optional(),
      dataInicio: z.string().optional(), // YYYY-MM-DD — filtro livre
      dataFim: z.string().optional(),    // YYYY-MM-DD — filtro livre
    }))
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
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

  updateColaboradorTipo: protectedProcedure
    .input(z.object({
      colaboradorId: z.string(),
      orgId: z.number(),
      tipoColaborador: z.enum(["barbeiro", "recepcao", "nenhum"]),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.execute(sql`
        INSERT INTO dimensao_colaboradores (colaboradorId, orgId, tipoColaborador, ativo)
        VALUES (${input.colaboradorId}, ${input.orgId}, ${input.tipoColaborador}, 1)
        ON DUPLICATE KEY UPDATE tipoColaborador = VALUES(tipoColaborador), updatedAt = NOW()
      `);
      return { success: true };
    }),

  // ── Comissões ───────────────────────────────────────────────────────────────────────────────────
  comissoes: protectedProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      periodo: z.string().optional(),
      dataInicio: z.string().optional(), // YYYY-MM-DD — filtro livre
      dataFim: z.string().optional(),    // YYYY-MM-DD — filtro livre
    }))
    .query(async ({ ctx, input }) => {
      const { extIds, orgFilter } = await resolveExternalIds(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );
      const now = new Date();
      // Modo range livre
      const colabs = input.dataInicio && input.dataFim
        ? await getColaboradoresByRange(extIds, input.dataInicio, input.dataFim)
        : await (async () => {
            const periodo = input.periodo || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
            const [ano, mes] = periodo.split("-").map(Number);
            return getColaboradores(extIds, ano, mes);
          })();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      let rWhere = sql`ativo = 1`;
      if (orgFilter) rWhere = sql`${rWhere} AND orgId = ${orgFilter}`;
      const [regras] = await db.execute(sql`SELECT * FROM regras_comissao WHERE ${rWhere}`) as any;
      return colabs.map(c => {
        const regra = (regras as any[]).find((r: any) => r.colaboradorId === String(c.colaborador_id));
        const pct = regra ? Number(regra.percentual) : 30;
        // Suporta tanto o retorno de getColaboradoresByRange (faturamento) quanto getColaboradores (total_vendas)
        const fat = Number((c as any).faturamento ?? (c as any).total_vendas ?? 0);
        const atend = Number((c as any).atendimentos ?? (c as any).total_servicos_realizados ?? 0);
        return {
          colaboradorId: String(c.colaborador_id),
          colaboradorNome: c.colaborador_nome,
          faturamento: fat,
          atendimentos: atend,
          percentual: pct,
          comissao: Math.round(fat * (pct / 100) * 100) / 100,
        };
      });
    }),

  saveRegrasComissao: protectedProcedure
    .input(z.object({
      orgId: z.number(),
      colaboradorId: z.string(),
      percentual: z.number().min(0).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.execute(sql`
        INSERT INTO regras_comissao (orgId, colaboradorId, percentual, ativo)
        VALUES (${input.orgId}, ${input.colaboradorId}, ${input.percentual}, 1)
        ON DUPLICATE KEY UPDATE percentual = VALUES(percentual), updatedAt = NOW()
      `);
      return { success: true };
    }),

  // ── Metas ────────────────────────────────────────────────────────────────────
  metas: protectedProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      ano: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { orgFilter, unitFilter } = await resolveUnitFilter(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );
      const ano = input.ano || new Date().getFullYear();
      let where = sql`periodo LIKE ${`${ano}-%`}`;
      if (orgFilter) where = sql`${where} AND orgId = ${orgFilter}`;
      if (unitFilter) where = sql`${where} AND unitId = ${unitFilter}`;
      const [metas] = await db.execute(sql`
        SELECT m.*, u.name as unitName, u.externalId FROM metas_vip m
        LEFT JOIN units u ON u.id = m.unitId WHERE ${where} ORDER BY periodo ASC
      `) as any;
      const { queryExternal } = await import("../db-external");
      const result = [];
      for (const meta of metas as any[]) {
        const [a, m] = meta.periodo.split("-").map(Number);
        let realizadoVal = 0;
        try {
          const extId = meta.externalId ? Number(meta.externalId) : null;
          const unitCond = extId ? `unidade = ${extId}` : "1=1";
          const rows = await queryExternal<{ t: number }>(`
            SELECT COALESCE(SUM(total_vendas), 0) as t
            FROM dashboard_faturamento
            WHERE ${unitCond} AND ano = ? AND mes = ?
          `, [a, m]);
          realizadoVal = Number(rows[0]?.t ?? 0);
        } catch { /* banco externo pode estar indisponível */ }
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

  saveMeta: protectedProcedure
    .input(z.object({
      orgId: z.number(),
      unitId: z.number().optional(),
      periodo: z.string(),
      metaFaturamento: z.number(),
      alertaAbaixoPercent: z.number().default(80),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
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

  deleteMeta: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.execute(sql`DELETE FROM metas_vip WHERE id = ${input.id}`);
      return { success: true };
    }),

  // ── Serviços ─────────────────────────────────────────────────────────────────
  servicos: protectedProcedure
    .input(z.object({ orgId: z.number().optional(), unitId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { orgFilter, unitFilter } = await resolveUnitFilter(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );
      let where = sql`ativo = 1`;
      if (orgFilter) where = sql`${where} AND orgId = ${orgFilter}`;
      if (unitFilter) where = sql`${where} AND unitId = ${unitFilter}`;
      const [rows] = await db.execute(sql`SELECT * FROM servicos_vip WHERE ${where} ORDER BY nome ASC`) as any;
      return rows as any[];
    }),

  // ── Folgas/Feriados ──────────────────────────────────────────────────────────
  folgas: protectedProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      mes: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { orgFilter, unitFilter } = await resolveUnitFilter(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );
      const mes = input.mes || new Date().toISOString().substring(0, 7);
      let where = sql`DATE_FORMAT(data,'%Y-%m') = ${mes}`;
      if (orgFilter) where = sql`${where} AND orgId = ${orgFilter}`;
      if (unitFilter) where = sql`${where} AND unitId = ${unitFilter}`;
      const [rows] = await db.execute(sql`SELECT * FROM folgas WHERE ${where} ORDER BY data ASC`) as any;
      return rows as any[];
    }),

  saveFolga: protectedProcedure
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

  deleteFolga: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.execute(sql`DELETE FROM folgas WHERE id = ${input.id}`);
      return { success: true };
    }),

  // ── Sync (mantido para compatibilidade) ──────────────────────────────────────
  syncStatus: protectedProcedure
    .input(z.object({ orgId: z.number().optional(), unitId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      if (input.unitId) return getSyncStatus(input.unitId) || null;
      if (input.orgId) return getSyncStatus(input.orgId) || null;
      return getAllSyncStatuses();
    }),

  syncLogs: protectedProcedure
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

  startSync: protectedProcedure
    .input(z.object({ unitId: z.number(), inicio: z.string().optional(), fim: z.string().optional(), orgId: z.number().optional(), modo: z.string().optional(), dataInicio: z.string().optional(), dataFim: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return { success: true, message: "Sincronização via API externa desativada — usando banco direto" };
    }),

  sync: protectedProcedure
    .input(z.object({ unitId: z.number(), inicio: z.string().optional(), fim: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return { success: true, message: "Sincronização via API externa desativada — usando banco direto" };
    }),

  syncHistory: protectedProcedure
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
  kpis: protectedProcedure
    .input(z.object({
      unitId: z.number().int().positive().optional(),
      inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        ctx.user.id, ctx.user.role, undefined, input.unitId
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
  unitsConfig: protectedProcedure
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

  startSyncAll: protectedProcedure
    .input(z.object({ orgId: z.number(), modo: z.enum(["auto", "manual_13m"]) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return {
        success: true,
        totalUnits: 0,
        unitNames: [],
        message: "Sincronização via API externa desativada — dados vêm diretamente do banco de produção",
      };
    }),

  syncAllStatus: protectedProcedure
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
  relatoriosSemanais: protectedProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      limit: z.number().default(12),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { orgFilter, unitFilter } = await resolveUnitFilter(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
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
  listServicosExterno: protectedProcedure
    .input(z.object({ orgId: z.number().optional(), unitId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const { extIds, orgFilter } = await resolveExternalIds(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );
      const { queryExternal } = await import("../db-external");
      const unitCond = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
        : `uu.unidade IN (${extIds.join(",")})`;

      // Busca todos os nomes de serviços distintos do banco externo
      const extServicos = await queryExternal<{ nome: string; qtd: number }>(`
        SELECT p.nome, COUNT(*) as qtd
        FROM produtos p
        JOIN vendas_produtos vp ON vp.produto = p.id
        JOIN vendas v ON vp.venda = v.id
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitCond}
          AND p.tipo = 'ser'
          AND v.comanda_temp = 0
          AND v.status != 0
        GROUP BY p.nome
        ORDER BY qtd DESC
      `, []);

      // Busca categorias salvas no banco local
      const db = await getDb();
      let catMap: Record<string, string> = {};
      if (db && orgFilter) {
        const [catRows] = await db.execute(sql`
          SELECT nomeServico, categoria FROM servico_categorias WHERE orgId = ${orgFilter}
        `) as any;
        for (const r of catRows as any[]) {
          catMap[r.nomeServico] = r.categoria;
        }
      }

      return extServicos.map(s => ({
        nome: s.nome,
        qtd: Number(s.qtd),
        categoria: catMap[s.nome] as "base" | "extra" | null ?? null,
      }));
    }),

  /** Salva (upsert) a categoria de um ou mais serviços */
  saveServicoCategorias: protectedProcedure
    .input(z.object({
      orgId: z.number(),
      servicos: z.array(z.object({
        nome: z.string(),
        categoria: z.enum(["base", "extra"]),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      for (const s of input.servicos) {
        await db.execute(sql`
          INSERT INTO servico_categorias (orgId, nomeServico, categoria)
          VALUES (${input.orgId}, ${s.nome}, ${s.categoria})
          ON DUPLICATE KEY UPDATE categoria = ${s.categoria}, updatedAt = NOW()
        `);
      }
      return { success: true, count: input.servicos.length };
    }),

  // ── Evolução diária (gráfico) ──────────────────────────────────────────────────────────────────────────────────
  evolucaoDiaria: protectedProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      dataInicio: z.string(), // YYYY-MM-DD
      dataFim: z.string(),    // YYYY-MM-DD (inclusivo)
    }))
    .query(async ({ ctx, input }) => {
      try {
      const { extIds } = await resolveExternalIds(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
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
});
