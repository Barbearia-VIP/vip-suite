/**
 * server/routers/dataVip.ts
 * Router tRPC completo do módulo Data VIP
 * Controle de acesso: dados por unidade, visão geral apenas para admin com "Todas as Unidades"
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { runSyncForOrg, getSyncStatus, getAllSyncStatuses, startAutoSyncScheduler } from "../vipDataSync";

// Inicializa scheduler automático (08:00 BRT)
startAutoSyncScheduler();

// ─── Helper: resolve filtro de unidades ──────────────────────────────────────
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

// ─── Router ──────────────────────────────────────────────────────────────────
export const dataVipRouter = router({

  // ── Dashboard KPIs ──────────────────────────────────────────────────────────
  dashboard: protectedProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      periodo: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { orgFilter, unitFilter, isAdmin } = await resolveUnitFilter(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );
      const now = new Date();
      const periodo = input.periodo || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [ano, mes] = periodo.split("-").map(Number);
      const inicioTs = new Date(ano, mes - 1, 1).getTime();
      const fimTs = new Date(ano, mes, 0, 23, 59, 59).getTime();
      const inicioAntTs = new Date(ano, mes - 2, 1).getTime();
      const fimAntTs = new Date(ano, mes - 1, 0, 23, 59, 59).getTime();

      let where = sql`vendaDataTs BETWEEN ${inicioTs} AND ${fimTs}`;
      if (orgFilter) where = sql`${where} AND orgId = ${orgFilter}`;
      if (unitFilter) where = sql`${where} AND unitId = ${unitFilter}`;

      let whereAnt = sql`vendaDataTs BETWEEN ${inicioAntTs} AND ${fimAntTs}`;
      if (orgFilter) whereAnt = sql`${whereAnt} AND orgId = ${orgFilter}`;
      if (unitFilter) whereAnt = sql`${whereAnt} AND unitId = ${unitFilter}`;

      const [kpis] = await db.execute(sql`
        SELECT COALESCE(SUM(valorLiquido),0) as fat, COUNT(*) as atend,
               COALESCE(AVG(valorLiquido),0) as ticket, COUNT(DISTINCT clienteId) as clientes
        FROM vendas_api_raw WHERE ${where}
      `) as any;
      const [kpisAnt] = await db.execute(sql`
        SELECT COALESCE(SUM(valorLiquido),0) as fat, COUNT(*) as atend
        FROM vendas_api_raw WHERE ${whereAnt}
      `) as any;

      const inicioMesStr = new Date(ano, mes - 1, 1).toISOString().split("T")[0];
      const fimMesStr = new Date(ano, mes, 0).toISOString().split("T")[0];
      let whereNovos = sql`primeiraVenda BETWEEN ${inicioMesStr} AND ${fimMesStr}
        AND (dataCadastro IS NULL OR dataCadastro != '2014-12-31')`;
      if (orgFilter) whereNovos = sql`${whereNovos} AND orgId = ${orgFilter}`;
      if (unitFilter) whereNovos = sql`${whereNovos} AND unitId = ${unitFilter}`;
      const [novos] = await db.execute(sql`SELECT COUNT(*) as n FROM dimensao_clientes WHERE ${whereNovos}`) as any;

      const k = (kpis as any[])[0] || {};
      const ka = (kpisAnt as any[])[0] || {};
      const fat = Number(k.fat || 0);
      const fatAnt = Number(ka.fat || 0);
      const atend = Number(k.atend || 0);
      const atendAnt = Number(ka.atend || 0);

      return {
        periodo,
        faturamento: fat,
        varFaturamento: fatAnt > 0 ? Math.round(((fat - fatAnt) / fatAnt) * 1000) / 10 : 0,
        atendimentos: atend,
        varAtendimentos: atendAnt > 0 ? Math.round(((atend - atendAnt) / atendAnt) * 1000) / 10 : 0,
        ticketMedio: Math.round(Number(k.ticket || 0) * 100) / 100,
        clientesAtendidos: Number(k.clientes || 0),
        clientesNovos: Number((novos as any[])[0]?.n || 0),
        isAdmin,
      };
    }),

  // ── Faturamento mensal ───────────────────────────────────────────────────────
  faturamentoMensal: protectedProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      meses: z.number().default(12),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { orgFilter, unitFilter } = await resolveUnitFilter(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );
      const now = new Date();
      const inicioTs = new Date(now.getFullYear(), now.getMonth() - input.meses + 1, 1).getTime();
      const fimTs = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).getTime();

      let where = sql`vendaDataTs BETWEEN ${inicioTs} AND ${fimTs}`;
      if (orgFilter) where = sql`${where} AND orgId = ${orgFilter}`;
      if (unitFilter) where = sql`${where} AND unitId = ${unitFilter}`;

      const [rows] = await db.execute(sql`
        SELECT DATE_FORMAT(vendaData,'%Y-%m') as periodo,
               COALESCE(SUM(valorLiquido),0) as faturamento,
               COUNT(*) as atendimentos,
               COALESCE(AVG(valorLiquido),0) as ticketMedio,
               COUNT(DISTINCT clienteId) as clientes
        FROM vendas_api_raw WHERE ${where}
        GROUP BY periodo ORDER BY periodo ASC
      `) as any;

      return (rows as any[]).map(r => ({
        periodo: r.periodo,
        faturamento: Number(r.faturamento),
        atendimentos: Number(r.atendimentos),
        ticketMedio: Math.round(Number(r.ticketMedio) * 100) / 100,
        clientes: Number(r.clientes),
      }));
    }),

  // ── Faturamento por produto e forma de pagamento ─────────────────────────────
  faturamentoPorProduto: protectedProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      periodo: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { orgFilter, unitFilter } = await resolveUnitFilter(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );
      const now = new Date();
      const periodo = input.periodo || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [ano, mes] = periodo.split("-").map(Number);
      const inicioTs = new Date(ano, mes - 1, 1).getTime();
      const fimTs = new Date(ano, mes, 0, 23, 59, 59).getTime();

      let where = sql`vendaDataTs BETWEEN ${inicioTs} AND ${fimTs}`;
      if (orgFilter) where = sql`${where} AND orgId = ${orgFilter}`;
      if (unitFilter) where = sql`${where} AND unitId = ${unitFilter}`;

      const [porProduto] = await db.execute(sql`
        SELECT produto, COUNT(*) as qtd, SUM(valorLiquido) as total
        FROM vendas_api_raw WHERE ${where} AND produto IS NOT NULL
        GROUP BY produto ORDER BY total DESC LIMIT 20
      `) as any;

      const [porPagamento] = await db.execute(sql`
        SELECT formaPagamento, COUNT(*) as qtd, SUM(valorLiquido) as total
        FROM vendas_api_raw WHERE ${where} AND formaPagamento IS NOT NULL
        GROUP BY formaPagamento ORDER BY total DESC
      `) as any;

      return {
        porProduto: (porProduto as any[]).map(r => ({ produto: r.produto, qtd: Number(r.qtd), total: Number(r.total) })),
        porPagamento: (porPagamento as any[]).map(r => ({ forma: r.formaPagamento, qtd: Number(r.qtd), total: Number(r.total) })),
      };
    }),

  // ── Ranking da rede ──────────────────────────────────────────────────────────
  ranking: protectedProcedure
    .input(z.object({ orgId: z.number().optional(), periodo: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { orgFilter, unitFilter, isAdmin } = await resolveUnitFilter(
        ctx.user.id, ctx.user.role, input.orgId
      );
      const now = new Date();
      const periodo = input.periodo || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [ano, mes] = periodo.split("-").map(Number);
      const inicioTs = new Date(ano, mes - 1, 1).getTime();
      const fimTs = new Date(ano, mes, 0, 23, 59, 59).getTime();

      let orgWhere = sql`u.status = 'active'`;
      if (orgFilter) orgWhere = sql`${orgWhere} AND u.orgId = ${orgFilter}`;

      const [rows] = await db.execute(sql`
        SELECT u.id as unitId, u.name as unitName,
               COALESCE(SUM(v.valorLiquido),0) as faturamento,
               COUNT(v.id) as atendimentos,
               COUNT(DISTINCT v.clienteId) as clientes,
               COALESCE(AVG(v.valorLiquido),0) as ticketMedio
        FROM units u
        LEFT JOIN vendas_api_raw v ON v.unitId = u.id
          AND v.vendaDataTs BETWEEN ${inicioTs} AND ${fimTs}
        WHERE ${orgWhere}
        GROUP BY u.id, u.name ORDER BY faturamento DESC
      `) as any;

      return {
        periodo,
        ranking: (rows as any[]).map((r, idx) => {
          const isMyUnit = unitFilter === r.unitId;
          const canSee = isAdmin || isMyUnit;
          return {
            posicao: idx + 1,
            unitId: r.unitId,
            unitName: r.unitName,
            faturamento: canSee ? Number(r.faturamento) : null,
            atendimentos: canSee ? Number(r.atendimentos) : null,
            clientes: canSee ? Number(r.clientes) : null,
            ticketMedio: isAdmin ? Math.round(Number(r.ticketMedio) * 100) / 100 : null,
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
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { orgFilter, unitFilter } = await resolveUnitFilter(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );
      let where = sql`1=1`;
      if (orgFilter) where = sql`${where} AND orgId = ${orgFilter}`;
      if (unitFilter) where = sql`${where} AND unitId = ${unitFilter}`;
      if (input.search) {
        const s = `%${input.search}%`;
        where = sql`${where} AND (clienteNome LIKE ${s} OR telefone LIKE ${s})`;
      }
      const offset = (input.page - 1) * input.pageSize;
      const [rows] = await db.execute(sql`
        SELECT id, clienteId, clienteNome, telefone, primeiraVenda, ultimaVenda,
               totalVisitas, totalGasto, dataCadastro
        FROM dimensao_clientes WHERE ${where}
        ORDER BY ultimaVenda DESC LIMIT ${input.pageSize} OFFSET ${offset}
      `) as any;
      const [cnt] = await db.execute(sql`SELECT COUNT(*) as total FROM dimensao_clientes WHERE ${where}`) as any;
      return {
        clientes: rows as any[],
        total: Number((cnt as any[])[0]?.total || 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  // ── Raio X de retenção ───────────────────────────────────────────────────────
  raioX: protectedProcedure
    .input(z.object({ orgId: z.number().optional(), unitId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { orgFilter, unitFilter } = await resolveUnitFilter(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );
      let where = sql`ultimaVenda IS NOT NULL AND (dataCadastro IS NULL OR dataCadastro != '2014-12-31')`;
      if (orgFilter) where = sql`${where} AND orgId = ${orgFilter}`;
      if (unitFilter) where = sql`${where} AND unitId = ${unitFilter}`;
      const hoje = new Date().toISOString().split("T")[0];
      const [rows] = await db.execute(sql`
        SELECT clienteId, clienteNome, telefone, ultimaVenda, primeiraVenda,
               totalVisitas, totalGasto,
               DATEDIFF(${hoje}, DATE(ultimaVenda)) as dias
        FROM dimensao_clientes WHERE ${where} ORDER BY dias ASC
      `) as any;
      const clientes = (rows as any[]).map(r => ({
        ...r,
        dias: Number(r.dias),
        totalVisitas: Number(r.totalVisitas),
        totalGasto: Number(r.totalGasto),
        categoria: Number(r.dias) <= 45 ? "ativo" : Number(r.dias) <= 90 ? "em_risco" : "perdido",
      }));
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
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { orgFilter, unitFilter } = await resolveUnitFilter(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );
      const now = new Date();
      const periodo = input.periodo || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [ano, mes] = periodo.split("-").map(Number);
      const inicioTs = new Date(ano, mes - 1, 1).getTime();
      const fimTs = new Date(ano, mes, 0, 23, 59, 59).getTime();

      let where = sql`dc.ativo = 1`;
      if (orgFilter) where = sql`${where} AND dc.orgId = ${orgFilter}`;
      if (unitFilter) where = sql`${where} AND dc.unitId = ${unitFilter}`;

      const [rows] = await db.execute(sql`
        SELECT dc.colaboradorId, dc.colaboradorNome, dc.tipoColaborador,
               COALESCE(SUM(v.valorLiquido),0) as faturamento,
               COUNT(v.id) as atendimentos,
               COUNT(DISTINCT v.clienteId) as clientes,
               COALESCE(AVG(v.valorLiquido),0) as ticketMedio
        FROM dimensao_colaboradores dc
        LEFT JOIN vendas_api_raw v ON v.colaboradorId = dc.colaboradorId
          AND v.orgId = dc.orgId
          AND v.vendaDataTs BETWEEN ${inicioTs} AND ${fimTs}
        WHERE ${where}
        GROUP BY dc.colaboradorId, dc.colaboradorNome, dc.tipoColaborador
        ORDER BY faturamento DESC
      `) as any;

      return (rows as any[]).map(r => ({
        colaboradorId: r.colaboradorId,
        colaboradorNome: r.colaboradorNome,
        tipoColaborador: r.tipoColaborador,
        faturamento: Number(r.faturamento),
        atendimentos: Number(r.atendimentos),
        clientes: Number(r.clientes),
        ticketMedio: Math.round(Number(r.ticketMedio) * 100) / 100,
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
        UPDATE dimensao_colaboradores SET tipoColaborador = ${input.tipoColaborador}
        WHERE colaboradorId = ${input.colaboradorId} AND orgId = ${input.orgId}
      `);
      return { success: true };
    }),

  // ── Comissões ────────────────────────────────────────────────────────────────
  comissoes: protectedProcedure
    .input(z.object({
      orgId: z.number().optional(),
      unitId: z.number().optional(),
      periodo: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { orgFilter, unitFilter } = await resolveUnitFilter(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );
      const now = new Date();
      const periodo = input.periodo || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [ano, mes] = periodo.split("-").map(Number);
      const inicioTs = new Date(ano, mes - 1, 1).getTime();
      const fimTs = new Date(ano, mes, 0, 23, 59, 59).getTime();

      let where = sql`dc.tipoColaborador = 'barbeiro' AND dc.ativo = 1`;
      if (orgFilter) where = sql`${where} AND dc.orgId = ${orgFilter}`;
      if (unitFilter) where = sql`${where} AND dc.unitId = ${unitFilter}`;

      const [colabs] = await db.execute(sql`
        SELECT dc.colaboradorId, dc.colaboradorNome,
               COALESCE(SUM(v.valorLiquido),0) as faturamento,
               COUNT(v.id) as atendimentos
        FROM dimensao_colaboradores dc
        LEFT JOIN vendas_api_raw v ON v.colaboradorId = dc.colaboradorId
          AND v.orgId = dc.orgId AND v.vendaDataTs BETWEEN ${inicioTs} AND ${fimTs}
        WHERE ${where}
        GROUP BY dc.colaboradorId, dc.colaboradorNome ORDER BY faturamento DESC
      `) as any;

      let rWhere = sql`ativo = 1`;
      if (orgFilter) rWhere = sql`${rWhere} AND orgId = ${orgFilter}`;
      const [regras] = await db.execute(sql`SELECT * FROM regras_comissao WHERE ${rWhere}`) as any;

      return (colabs as any[]).map(c => {
        const regra = (regras as any[]).find((r: any) => r.colaboradorId === c.colaboradorId);
        const pct = regra ? Number(regra.percentual) : 30;
        const fat = Number(c.faturamento);
        return {
          colaboradorId: c.colaboradorId,
          colaboradorNome: c.colaboradorNome,
          faturamento: fat,
          atendimentos: Number(c.atendimentos),
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
        SELECT m.*, u.name as unitName FROM metas_vip m
        LEFT JOIN units u ON u.id = m.unitId WHERE ${where} ORDER BY periodo ASC
      `) as any;

      const result = [];
      for (const meta of metas as any[]) {
        const [a, m] = meta.periodo.split("-").map(Number);
        const iTs = new Date(a, m - 1, 1).getTime();
        const fTs = new Date(a, m, 0, 23, 59, 59).getTime();
        let vWhere = sql`vendaDataTs BETWEEN ${iTs} AND ${fTs} AND orgId = ${meta.orgId}`;
        if (meta.unitId) vWhere = sql`${vWhere} AND unitId = ${meta.unitId}`;
        const [real] = await db.execute(sql`SELECT COALESCE(SUM(valorLiquido),0) as t FROM vendas_api_raw WHERE ${vWhere}`) as any;
        const metaVal = Number(meta.metaFaturamento);
        const realizadoVal = Number((real as any[])[0]?.t || 0);
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

  // ── Sync ─────────────────────────────────────────────────────────────────────
  syncStatus: protectedProcedure
    .input(z.object({ orgId: z.number().optional(), unitId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      if (input.unitId) return getSyncStatus(input.unitId) || null;
      if (input.orgId) return getSyncStatus(input.orgId) || null; // fallback legado
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
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      let where = sql`1=1`;
      if (input.orgId) where = sql`${where} AND sl.orgId = ${input.orgId}`;
      if (input.unitId) where = sql`${where} AND sl.unitId = ${input.unitId}`;
      const [rows] = await db.execute(sql`
        SELECT sl.*, u.name as unitName FROM sync_log_vip sl
        LEFT JOIN units u ON u.id = sl.unitId
        WHERE ${where} ORDER BY sl.iniciadoEm DESC LIMIT ${input.limit}
      `) as any;
      return rows as any[];
    }),

  startSync: protectedProcedure
    .input(z.object({
      orgId: z.number(),
      unitId: z.number(),
      modo: z.enum(["auto", "manual_13m", "historico"]),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [creds] = await db.execute(sql`
        SELECT config FROM module_configs
        WHERE unitId = ${input.unitId} AND module = 'data_vip'
        LIMIT 1
      `) as any;
      const cfg = (creds as any[])[0]?.config ?? {};
      // Compatibilidade: aceita tanto apiUnidadeId/apiHash quanto unitExternalId/apiKey (nomes legados)
      const credMap = {
        apiUnidadeId: (cfg.apiUnidadeId || cfg.unitExternalId) as string,
        apiHash: (cfg.apiHash || cfg.apiKey) as string,
      };

      if (!credMap.apiUnidadeId || !credMap.apiHash) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Credenciais da API não configuradas para esta unidade" });
      }

      runSyncForOrg(
        input.orgId, input.unitId,
        credMap.apiUnidadeId, credMap.apiHash,
        input.modo, input.dataInicio, input.dataFim
      ).catch(e => console.error(`[dataVip.startSync] Error:`, e.message));

      return { success: true, message: "Sincronização iniciada em background" };
    }),

  // Sync legado (compatibilidade com DataVipPage existente)
  sync: protectedProcedure
    .input(z.object({
      unitId: z.number().int().positive(),
      inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Busca orgId da unidade
      const [unitRows] = await db.execute(sql`SELECT orgId FROM units WHERE id = ${input.unitId} LIMIT 1`) as any;
      const orgId = (unitRows as any[])[0]?.orgId;
      if (!orgId) throw new TRPCError({ code: "NOT_FOUND", message: "Unidade não encontrada" });

      const [creds] = await db.execute(sql`
        SELECT config FROM module_configs
        WHERE unitId = ${input.unitId} AND module = 'data_vip'
        LIMIT 1
      `) as any;
      const cfg = (creds as any[])[0]?.config ?? {};
      // Compatibilidade: aceita tanto apiUnidadeId/apiHash quanto unitExternalId/apiKey (nomes legados)
      const credMap = {
        apiUnidadeId: (cfg.apiUnidadeId || cfg.unitExternalId) as string,
        apiHash: (cfg.apiHash || cfg.apiKey) as string,
      };

      if (!credMap.apiUnidadeId || !credMap.apiHash) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Credenciais da API não configuradas para esta unidade" });
      }

      runSyncForOrg(orgId, input.unitId, credMap.apiUnidadeId, credMap.apiHash, "auto", input.inicio, input.fim)
        .catch(e => console.error(`[dataVip.sync] Error:`, e.message));

      return { success: true, message: "Sincronização iniciada em background" };
    }),

  syncHistory: protectedProcedure
    .input(z.object({ unitId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const [rows] = await db.execute(sql`
        SELECT * FROM sync_log_vip WHERE unitId = ${input.unitId}
        ORDER BY iniciadoEm DESC LIMIT 20
      `) as any;
      return rows as any[];
    }),

  kpis: protectedProcedure
    .input(z.object({
      unitId: z.number().int().positive().optional(),
      inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      let where = sql`vendaData BETWEEN ${input.inicio} AND ${input.fim}`;
      if (input.unitId) where = sql`${where} AND unitId = ${input.unitId}`;
      const [rows] = await db.execute(sql`
        SELECT COALESCE(SUM(valorLiquido),0) as fat, COUNT(*) as atend, COALESCE(AVG(valorLiquido),0) as ticket
        FROM vendas_api_raw WHERE ${where}
      `) as any;
      const r = (rows as any[])[0] || {};
      return {
        totalFaturamento: Number(r.fat || 0),
        totalAtendimentos: Number(r.atend || 0),
        ticketMedio: Math.round(Number(r.ticket || 0) * 100) / 100,
      };
    }),

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
        };
      });
    }),

  // ── Sincronização em lote (todas as unidades) ─────────────────────────────────
  startSyncAll: protectedProcedure
    .input(z.object({
      orgId: z.number(),
      modo: z.enum(["auto", "manual_13m"]),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Busca todas as unidades com credenciais configuradas
      const [unitsList] = await db.execute(sql`SELECT * FROM units WHERE orgId = ${input.orgId}`) as any;
      const [configs] = await db.execute(sql`
        SELECT unitId, config FROM module_configs
        WHERE module = 'data_vip' AND unitId IN (SELECT id FROM units WHERE orgId = ${input.orgId})
      `) as any;

      const configMap: Record<number, any> = {};
      for (const c of configs as any[]) {
        configMap[c.unitId] = c.config ?? {};
      }

      const unitsWithCreds = (unitsList as any[]).filter(u => {
        const cfg = configMap[u.id] ?? {};
        return !!((cfg.apiUnidadeId || cfg.unitExternalId) && (cfg.apiHash || cfg.apiKey));
      });

      if (unitsWithCreds.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhuma unidade com credenciais configuradas" });
      }

      // Executa sequencialmente em background — uma unidade por vez
      const runSequential = async () => {
        for (const unit of unitsWithCreds) {
          const cfg = configMap[unit.id] ?? {};
          const apiUnidadeId = (cfg.apiUnidadeId || cfg.unitExternalId) as string;
          const apiHash = (cfg.apiHash || cfg.apiKey) as string;
          try {
            await runSyncForOrg(input.orgId, unit.id, apiUnidadeId, apiHash, input.modo);
          } catch (e: any) {
            console.error(`[syncAll] Erro na unidade ${unit.id} (${unit.name}):`, e.message);
          }
          // Pausa de 2s entre unidades para não sobrecarregar a API externa
          await new Promise(r => setTimeout(r, 2000));
        }
        console.log(`[syncAll] Concluído: ${unitsWithCreds.length} unidades processadas`);
      };

      runSequential().catch(e => console.error(`[syncAll] Erro geral:`, e.message));

      return {
        success: true,
        totalUnits: unitsWithCreds.length,
        unitNames: unitsWithCreds.map((u: any) => u.name),
        message: `Sincronização iniciada para ${unitsWithCreds.length} unidade(s) em sequência`,
      };
    }),

  // Status de progresso do syncAll (polling)
  syncAllStatus: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { units: [] };
      const [unitsList] = await db.execute(sql`SELECT id, name FROM units WHERE orgId = ${input.orgId}`) as any;
      const [configs] = await db.execute(sql`
        SELECT unitId, config FROM module_configs
        WHERE module = 'data_vip' AND unitId IN (SELECT id FROM units WHERE orgId = ${input.orgId})
      `) as any;
      const configMap: Record<number, any> = {};
      for (const c of configs as any[]) configMap[c.unitId] = c.config ?? {};

      // Busca o último log de sync por unidade
      const [logs] = await db.execute(sql`
        SELECT unitId, status, iniciadoEm, finalizadoEm, registrosInseridos, erro
        FROM sync_log_vip
        WHERE unitId IN (SELECT id FROM units WHERE orgId = ${input.orgId})
        AND iniciadoEm = (SELECT MAX(iniciadoEm) FROM sync_log_vip s2 WHERE s2.unitId = sync_log_vip.unitId)
      `) as any;

      const logMap: Record<number, any> = {};
      for (const l of logs as any[]) logMap[l.unitId] = l;

      return {
        units: (unitsList as any[]).map(u => {
          const cfg = configMap[u.id] ?? {};
          const hasCredentials = !!((cfg.apiUnidadeId || cfg.unitExternalId) && (cfg.apiHash || cfg.apiKey));
          const syncStatus = getSyncStatus(u.id);
          const lastLog = logMap[u.id];
          return {
            unitId: u.id,
            name: u.name,
            hasCredentials,
            currentStatus: syncStatus?.status ?? "idle",
            lastSyncAt: lastLog?.finalizadoEm ?? null,
            lastRecords: lastLog?.registrosInseridos ?? null,
            lastError: lastLog?.erro ?? null,
          };
        }),
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
});
