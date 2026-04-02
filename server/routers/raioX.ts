/**
 * server/routers/raioX.ts
 * Router tRPC completo do módulo Raio X Clientes
 * Usa tabelas: dimensao_clientes, vendas, dimensao_colaboradores
 *
 * Definições:
 * - Ativo (60d): última visita ≤ 60 dias
 * - Em risco (61-90d): última visita entre 61 e 90 dias
 * - Perdido (>90d): última visita > 90 dias
 * - One-Shot: totalVisitas = 1
 * - Novo: primeiraVenda dentro do período selecionado
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";

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

// ─── Helper: classifica cliente por dias desde última visita ─────────────────
function classificarStatus(dias: number): "ativo" | "em_risco" | "perdido" {
  if (dias <= 60) return "ativo";
  if (dias <= 90) return "em_risco";
  return "perdido";
}

// ─── Helper: classifica perfil por volume histórico ──────────────────────────
function classificarPerfil(totalVisitas: number): "one_shot" | "ocasional" | "fiel" | "regular" | "recorrente" {
  if (totalVisitas === 1) return "one_shot";
  if (totalVisitas <= 3) return "ocasional";
  if (totalVisitas <= 6) return "fiel";
  if (totalVisitas <= 10) return "regular";
  return "recorrente";
}

// ─── Helper: classifica cadência por dias médios entre visitas ───────────────
function classificarCadencia(diasMedios: number): "perdido" | "regular" | "em_risco" | "espacado" | "mto_frequente" {
  if (diasMedios > 90) return "perdido";
  if (diasMedios > 60) return "em_risco";
  if (diasMedios > 45) return "espacado";
  if (diasMedios > 20) return "regular";
  return "mto_frequente";
}

// ─── Input base ──────────────────────────────────────────────────────────────
const baseInput = z.object({
  orgId: z.number().optional(),
  unitId: z.number().optional(),
  dataInicio: z.string().optional(), // YYYY-MM-DD
  dataFim: z.string().optional(),    // YYYY-MM-DD
});

export const raioXRouter = router({

  // ── Visão Geral ─────────────────────────────────────────────────────────────
  visaoGeral: protectedProcedure
    .input(baseInput)
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { orgFilter, unitFilter } = await resolveUnitFilter(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );

      const hoje = new Date().toISOString().split("T")[0];
      const dataInicio = input.dataInicio || new Date(Date.now() - 120 * 86400000).toISOString().split("T")[0];
      const dataFim = input.dataFim || hoje;

      // Filtro base dimensao_clientes
      let whereBase = sql`ultimaVenda IS NOT NULL AND (dataCadastro IS NULL OR dataCadastro != '2014-12-31') AND clienteId != '2'`;
      if (orgFilter) whereBase = sql`${whereBase} AND orgId = ${orgFilter}`;
      if (unitFilter) whereBase = sql`${whereBase} AND unitId = ${unitFilter}`;

      // Filtro base vendas (para novos clientes no período)
      let whereVendas = sql`dataVenda >= ${dataInicio} AND dataVenda <= ${dataFim + " 23:59:59"} AND clienteId != '2'`;
      // vendas table has no orgId column - filter by unitId only
      if (unitFilter) whereVendas = sql`${whereVendas} AND unitId = ${unitFilter}`;

      // Todos os clientes da dimensão
      const [clientesRows] = await db.execute(sql`
        SELECT clienteId, clienteNome, totalVisitas, primeiraVenda, ultimaVenda, totalGasto,
               DATEDIFF(${hoje}, DATE(ultimaVenda)) as diasUltimaVisita
        FROM dimensao_clientes
        WHERE ${whereBase}
      `) as any;

      const clientes = (clientesRows as any[]).map(r => ({
        clienteId: r.clienteId,
        clienteNome: r.clienteNome,
        totalVisitas: Number(r.totalVisitas || 0),
        primeiraVenda: r.primeiraVenda,
        ultimaVenda: r.ultimaVenda,
        totalGasto: Number(r.totalGasto || 0),
        dias: Number(r.diasUltimaVisita || 0),
        status: classificarStatus(Number(r.diasUltimaVisita || 0)),
        perfil: classificarPerfil(Number(r.totalVisitas || 0)),
      }));

      const totalBase = clientes.length;
      const ativos = clientes.filter(c => c.status === "ativo").length;
      const emRisco = clientes.filter(c => c.status === "em_risco").length;
      const perdidos = clientes.filter(c => c.status === "perdido").length;
      const oneShots = clientes.filter(c => c.totalVisitas === 1).length;
      const oneShotRisco = clientes.filter(c => c.totalVisitas === 1 && c.status === "em_risco").length;
      const oneShotPerdido = clientes.filter(c => c.totalVisitas === 1 && c.status === "perdido").length;

      // Novos no período (primeira visita dentro do período)
      const [novosRows] = await db.execute(sql`
        SELECT COUNT(DISTINCT clienteId) as total
        FROM dimensao_clientes
        WHERE ${whereBase}
          AND primeiraVenda >= ${dataInicio}
          AND primeiraVenda <= ${dataFim + " 23:59:59"}
      `) as any;
      const totalNovos = Number((novosRows as any[])[0]?.total || 0);

      // Novos que voltaram (vieram no período e têm >1 visita)
      const [novosRecorrentesRows] = await db.execute(sql`
        SELECT COUNT(DISTINCT clienteId) as total
        FROM dimensao_clientes
        WHERE ${whereBase}
          AND primeiraVenda >= ${dataInicio}
          AND primeiraVenda <= ${dataFim + " 23:59:59"}
          AND totalVisitas > 1
      `) as any;
      const novosRecorrentes = Number((novosRecorrentesRows as any[])[0]?.total || 0);

      // Resgatados: estavam perdidos e voltaram no período
      const [resgatadosRows] = await db.execute(sql`
        SELECT COUNT(DISTINCT clienteId) as total
        FROM dimensao_clientes
        WHERE ${whereBase}
          AND ultimaVenda >= ${dataInicio}
          AND ultimaVenda <= ${dataFim + " 23:59:59"}
          AND totalVisitas > 1
          AND DATEDIFF(${hoje}, DATE(ultimaVenda)) <= 60
      `) as any;
      const resgatados = Number((resgatadosRows as any[])[0]?.total || 0);

      // Distribuição por perfil
      const porPerfil = {
        one_shot: clientes.filter(c => c.perfil === "one_shot").length,
        ocasional: clientes.filter(c => c.perfil === "ocasional").length,
        fiel: clientes.filter(c => c.perfil === "fiel").length,
        regular: clientes.filter(c => c.perfil === "regular").length,
        recorrente: clientes.filter(c => c.perfil === "recorrente").length,
      };

      // Status 12m (baseado em dias)
      const status12m = {
        saudavel: clientes.filter(c => c.dias <= 45).length,
        emRisco: clientes.filter(c => c.dias > 45 && c.dias <= 90).length,
        perdido: clientes.filter(c => c.dias > 90).length,
      };

      // Saúde de aquisição: % de novos que voltaram
      const saudeAquisicao = totalNovos > 0 ? Math.round((novosRecorrentes / totalNovos) * 100) : 0;

      // Novos por mês (últimos 6 meses)
      const [novosMensalRows] = await db.execute(sql`
        SELECT DATE_FORMAT(primeiraVenda, '%Y-%m') as mes, COUNT(DISTINCT clienteId) as total
        FROM dimensao_clientes
        WHERE ${whereBase}
          AND primeiraVenda >= DATE_SUB(${dataFim}, INTERVAL 6 MONTH)
        GROUP BY mes
        ORDER BY mes
      `) as any;
      const novosMensal = (novosMensalRows as any[]).map(r => ({
        mes: r.mes,
        total: Number(r.total),
      }));

      return {
        periodo: { dataInicio, dataFim },
        sinais: {
          ativos,
          perdidos,
          emRisco,
          novos: totalNovos,
          oneShotUrgente: oneShotRisco + oneShotPerdido,
          resgatados,
          totalBase,
          pctAtivos: totalBase > 0 ? Math.round((ativos / totalBase) * 100) : 0,
          pctPerdidos: totalBase > 0 ? Math.round((perdidos / totalBase) * 100) : 0,
          pctEmRisco: totalBase > 0 ? Math.round((emRisco / totalBase) * 100) : 0,
          pctNovos: totalBase > 0 ? Math.round((totalNovos / totalBase) * 100) : 0,
          pctOneShotUrgente: oneShots > 0 ? Math.round(((oneShotRisco + oneShotPerdido) / oneShots) * 100) : 0,
          pctResgatados: totalBase > 0 ? Math.round((resgatados / totalBase) * 100) : 0,
        },
        atividade: {
          clientesUnicos: totalBase,
          novosClientes: totalNovos,
          ativosNaJanela: ativos,
          resgatados,
        },
        saude: {
          emRisco,
          perdidos,
          oneShotRisco,
          oneShotPerdido,
        },
        distribuicoes: {
          porPerfil,
          status12m,
          oneShot: {
            total: oneShots,
            aguardando: clientes.filter(c => c.totalVisitas === 1 && c.dias <= 30).length,
            emRisco: oneShotRisco,
            perdido: oneShotPerdido,
          },
        },
        novosClientes: {
          total: totalNovos,
          recorrentes: novosRecorrentes,
          oneShotTotal: totalNovos - novosRecorrentes,
          saudeAquisicao,
          mensal: novosMensal,
        },
      };
    }),

  // ── One-Shot ─────────────────────────────────────────────────────────────────
  oneShot: protectedProcedure
    .input(baseInput.extend({
      status: z.enum(["todos", "aguardando", "em_risco", "perdido"]).optional(),
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

      const hoje = new Date().toISOString().split("T")[0];

      let where = sql`totalVisitas = 1 AND ultimaVenda IS NOT NULL AND clienteId != '2'`;
      if (orgFilter) where = sql`${where} AND orgId = ${orgFilter}`;
      if (unitFilter) where = sql`${where} AND unitId = ${unitFilter}`;

      const [rows] = await db.execute(sql`
        SELECT clienteId, clienteNome, telefone, primeiraVenda, ultimaVenda, totalGasto,
               DATEDIFF(${hoje}, DATE(ultimaVenda)) as dias
        FROM dimensao_clientes
        WHERE ${where}
        ORDER BY ultimaVenda DESC
      `) as any;

      let clientes = (rows as any[]).map(r => ({
        clienteId: r.clienteId,
        clienteNome: r.clienteNome,
        telefone: r.telefone,
        primeiraVenda: r.primeiraVenda,
        ultimaVenda: r.ultimaVenda,
        totalGasto: Number(r.totalGasto || 0),
        dias: Number(r.dias || 0),
        status: Number(r.dias) <= 30 ? "aguardando" : Number(r.dias) <= 60 ? "em_risco" : "perdido",
      }));

      // Filtrar por status
      if (input.status && input.status !== "todos") {
        clientes = clientes.filter(c => c.status === input.status);
      }

      // Filtrar por busca
      if (input.search) {
        const s = input.search.toLowerCase();
        clientes = clientes.filter(c =>
          c.clienteNome?.toLowerCase().includes(s) ||
          c.telefone?.includes(s)
        );
      }

      const total = clientes.length;
      const offset = (input.page - 1) * input.pageSize;
      const paginated = clientes.slice(offset, offset + input.pageSize);

      return {
        clientes: paginated,
        total,
        resumo: {
          total: clientes.length,
          aguardando: clientes.filter(c => c.status === "aguardando").length,
          emRisco: clientes.filter(c => c.status === "em_risco").length,
          perdido: clientes.filter(c => c.status === "perdido").length,
        },
      };
    }),

  // ── Cadência ─────────────────────────────────────────────────────────────────
  cadencia: protectedProcedure
    .input(baseInput)
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { orgFilter, unitFilter } = await resolveUnitFilter(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );

      const hoje = new Date().toISOString().split("T")[0];

      // Clientes com mais de 1 visita (têm cadência calculável)
      let where = sql`totalVisitas > 1 AND ultimaVenda IS NOT NULL AND primeiraVenda IS NOT NULL AND clienteId != '2'`;
      if (orgFilter) where = sql`${where} AND orgId = ${orgFilter}`;
      if (unitFilter) where = sql`${where} AND unitId = ${unitFilter}`;

      const [rows] = await db.execute(sql`
        SELECT clienteId, clienteNome, telefone, primeiraVenda, ultimaVenda, totalVisitas, totalGasto,
               DATEDIFF(${hoje}, DATE(ultimaVenda)) as diasUltimaVisita,
               DATEDIFF(DATE(ultimaVenda), DATE(primeiraVenda)) as spanDias
        FROM dimensao_clientes
        WHERE ${where}
        ORDER BY totalVisitas DESC
      `) as any;

      const clientes = (rows as any[]).map(r => {
        const totalVisitas = Number(r.totalVisitas || 1);
        const spanDias = Number(r.spanDias || 0);
        // Dias médios entre visitas = span / (visitas - 1)
        const diasMedios = totalVisitas > 1 ? Math.round(spanDias / (totalVisitas - 1)) : spanDias;
        return {
          clienteId: r.clienteId,
          clienteNome: r.clienteNome,
          telefone: r.telefone,
          totalVisitas,
          diasMedios,
          diasUltimaVisita: Number(r.diasUltimaVisita || 0),
          totalGasto: Number(r.totalGasto || 0),
          cadencia: classificarCadencia(diasMedios),
        };
      });

      // Distribuição por cadência
      const distribuicao = {
        perdido: clientes.filter(c => c.cadencia === "perdido").length,
        em_risco: clientes.filter(c => c.cadencia === "em_risco").length,
        espacado: clientes.filter(c => c.cadencia === "espacado").length,
        regular: clientes.filter(c => c.cadencia === "regular").length,
        mto_frequente: clientes.filter(c => c.cadencia === "mto_frequente").length,
      };

      // Média geral
      const mediaGeral = clientes.length > 0
        ? Math.round(clientes.reduce((s, c) => s + c.diasMedios, 0) / clientes.length)
        : 0;

      return {
        clientes: clientes.slice(0, 200),
        total: clientes.length,
        distribuicao,
        mediaGeral,
      };
    }),

  // ── Churn ────────────────────────────────────────────────────────────────────
  churn: protectedProcedure
    .input(baseInput)
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { orgFilter, unitFilter } = await resolveUnitFilter(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );

      const hoje = new Date().toISOString().split("T")[0];

      let where = sql`ultimaVenda IS NOT NULL AND clienteId != '2'`;
      if (orgFilter) where = sql`${where} AND orgId = ${orgFilter}`;
      if (unitFilter) where = sql`${where} AND unitId = ${unitFilter}`;

      // Churn mensal: clientes que tiveram última visita em cada mês dos últimos 12 meses
      const [churnMensalRows] = await db.execute(sql`
        SELECT DATE_FORMAT(ultimaVenda, '%Y-%m') as mes,
               COUNT(*) as total
        FROM dimensao_clientes
        WHERE ${where}
          AND ultimaVenda >= DATE_SUB(${hoje}, INTERVAL 12 MONTH)
        GROUP BY mes
        ORDER BY mes
      `) as any;

      // Perdidos totais (>90 dias)
      const [perdidosRows] = await db.execute(sql`
        SELECT COUNT(*) as total,
               AVG(DATEDIFF(${hoje}, DATE(ultimaVenda))) as mediaDias,
               SUM(totalGasto) as totalGasto
        FROM dimensao_clientes
        WHERE ${where}
          AND DATEDIFF(${hoje}, DATE(ultimaVenda)) > 90
      `) as any;
      const perdidos = (perdidosRows as any[])[0];

      // Em risco (61-90 dias)
      const [emRiscoRows] = await db.execute(sql`
        SELECT COUNT(*) as total
        FROM dimensao_clientes
        WHERE ${where}
          AND DATEDIFF(${hoje}, DATE(ultimaVenda)) BETWEEN 61 AND 90
      `) as any;

      // Total da base
      const [totalRows] = await db.execute(sql`
        SELECT COUNT(*) as total FROM dimensao_clientes WHERE ${where}
      `) as any;
      const totalBase = Number((totalRows as any[])[0]?.total || 0);

      // Clientes perdidos recentes (últimos 30 dias de churn)
      const [perdidosRecentesRows] = await db.execute(sql`
        SELECT clienteId, clienteNome, telefone, ultimaVenda, totalVisitas, totalGasto,
               DATEDIFF(${hoje}, DATE(ultimaVenda)) as dias
        FROM dimensao_clientes
        WHERE ${where}
          AND DATEDIFF(${hoje}, DATE(ultimaVenda)) > 90
        ORDER BY ultimaVenda DESC
        LIMIT 100
      `) as any;

      const taxaChurn = totalBase > 0
        ? Math.round((Number(perdidos?.total || 0) / totalBase) * 100)
        : 0;

      return {
        resumo: {
          perdidos: Number(perdidos?.total || 0),
          emRisco: Number((emRiscoRows as any[])[0]?.total || 0),
          totalBase,
          taxaChurn,
          mediaDiasPerdidos: Math.round(Number(perdidos?.mediaDias || 0)),
          receitaPerdida: Number(perdidos?.totalGasto || 0),
        },
        churnMensal: (churnMensalRows as any[]).map(r => ({
          mes: r.mes,
          total: Number(r.total),
        })),
        perdidosRecentes: (perdidosRecentesRows as any[]).map(r => ({
          clienteId: r.clienteId,
          clienteNome: r.clienteNome,
          telefone: r.telefone,
          ultimaVenda: r.ultimaVenda,
          totalVisitas: Number(r.totalVisitas),
          totalGasto: Number(r.totalGasto),
          dias: Number(r.dias),
        })),
      };
    }),

  // ── Churn por Barbeiro ──────────────────────────────────────────────────────────
  churnPorBarbeiro: protectedProcedure
    .input(baseInput)
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { orgFilter, unitFilter } = await resolveUnitFilter(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );

      const hoje = new Date().toISOString().split("T")[0];
      const dataInicio = input.dataInicio || new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];
      const dataFim = input.dataFim || hoje;

      // Monta filtro de unidade/org dinamicamente
      let whereUnidade = sql`v.clienteId != '2'
          AND v.colaboradorId IS NOT NULL
          AND v.colaboradorNome IS NOT NULL
          AND v.colaboradorNome != ''
          AND dc.ultimaVenda IS NOT NULL`;
      if (unitFilter) whereUnidade = sql`${whereUnidade} AND v.unitId = ${unitFilter}`;
      else if (orgFilter) whereUnidade = sql`${whereUnidade} AND v.unitId IN (SELECT id FROM units WHERE orgId = ${orgFilter})`;

      // Estratégia de Retenção por Barbeiro:
      // - Clientes atendidos pelo barbeiro no período selecionado
      // - Status calculado com base na última visita ATUAL (de todos os tempos)
      // - Ativo: última visita <= 60 dias atrás
      // - Em Risco: última visita entre 61-90 dias
      // - Perdido: última visita > 90 dias
      // Nota: se o período for recente (ex: últimos 90 dias), clientes atendidos
      // nesse período terão status "ativo" por definição. Para ver churn real,
      // use períodos mais antigos (ex: 12 meses, ano passado).
      const [rows] = await db.execute(sql`
        SELECT
          bp.colaboradorId,
          bp.colaboradorNome,
          COUNT(DISTINCT bp.clienteId) as totalClientes,
          COUNT(DISTINCT CASE WHEN DATEDIFF(${hoje}, DATE(dc.ultimaVenda)) <= 60 THEN bp.clienteId END) as ativos,
          COUNT(DISTINCT CASE WHEN DATEDIFF(${hoje}, DATE(dc.ultimaVenda)) BETWEEN 61 AND 90 THEN bp.clienteId END) as emRisco,
          COUNT(DISTINCT CASE WHEN DATEDIFF(${hoje}, DATE(dc.ultimaVenda)) > 90 THEN bp.clienteId END) as perdidos,
          COUNT(DISTINCT CASE WHEN dc.totalVisitas = 1 THEN bp.clienteId END) as oneShots,
          AVG(dc.totalVisitas) as mediaVisitas,
          AVG(dc.totalGasto) as mediaGasto
        FROM (
          SELECT DISTINCT v.colaboradorId, v.colaboradorNome, v.clienteId, v.unitId
          FROM vendas v
          WHERE v.dataVenda >= ${dataInicio} AND v.dataVenda <= ${dataFim + " 23:59:59"}
            AND v.clienteId != '2'
            AND v.colaboradorId IS NOT NULL
            AND v.colaboradorNome IS NOT NULL
            AND v.colaboradorNome != ''
            ${unitFilter ? sql`AND v.unitId = ${unitFilter}` : orgFilter ? sql`AND v.unitId IN (SELECT id FROM units WHERE orgId = ${orgFilter})` : sql``}
        ) bp
        INNER JOIN dimensao_clientes dc ON dc.clienteId = bp.clienteId AND dc.unitId = bp.unitId
        WHERE dc.ultimaVenda IS NOT NULL
        GROUP BY bp.colaboradorId, bp.colaboradorNome
        ORDER BY totalClientes DESC
      `) as any;

      return {
        barbeiros: (rows as any[]).map(r => {
          const total = Number(r.totalClientes || 0);
          const ativos = Number(r.ativos || 0);
          const emRisco = Number(r.emRisco || 0);
          const perdidos = Number(r.perdidos || 0);
          return {
            colaboradorId: r.colaboradorId,
            colaboradorNome: r.colaboradorNome,
            totalClientes: total,
            ativos,
            emRisco,
            perdidos,
            oneShots: Number(r.oneShots || 0),
            taxaRetencao: total > 0 ? Math.round((ativos / total) * 100) : 0,
            taxaChurn: total > 0 ? Math.round((perdidos / total) * 100) : 0,
            mediaVisitas: Math.round(Number(r.mediaVisitas || 0) * 10) / 10,
            mediaGasto: Math.round(Number(r.mediaGasto || 0)),
          };
        }),
        periodo: { dataInicio, dataFim },
      };
    }),

  // ── Cohort ─────────────────────────────────────────────────────────────────────────────────
  cohort: protectedProcedure
    .input(baseInput)
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { orgFilter, unitFilter } = await resolveUnitFilter(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );

      let where = sql`ultimaVenda IS NOT NULL AND primeiraVenda IS NOT NULL AND clienteId != '2'`;
      if (orgFilter) where = sql`${where} AND orgId = ${orgFilter}`;
      if (unitFilter) where = sql`${where} AND unitId = ${unitFilter}`;

      // Cohort por mês de entrada (primeiraVenda)
      const [cohortRows] = await db.execute(sql`
        SELECT 
          DATE_FORMAT(primeiraVenda, '%Y-%m') as cohort,
          COUNT(*) as totalEntrada,
          SUM(CASE WHEN totalVisitas > 1 THEN 1 ELSE 0 END) as voltaram,
          SUM(CASE WHEN totalVisitas >= 3 THEN 1 ELSE 0 END) as fidelizados,
          AVG(totalVisitas) as mediaVisitas,
          AVG(totalGasto) as mediaGasto
        FROM dimensao_clientes
        WHERE ${where}
          AND primeiraVenda >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        GROUP BY cohort
        ORDER BY cohort
      `) as any;

      return {
        cohorts: (cohortRows as any[]).map(r => ({
          cohort: r.cohort,
          totalEntrada: Number(r.totalEntrada),
          voltaram: Number(r.voltaram),
          fidelizados: Number(r.fidelizados),
          taxaRetencao: r.totalEntrada > 0 ? Math.round((Number(r.voltaram) / Number(r.totalEntrada)) * 100) : 0,
          taxaFidelizacao: r.totalEntrada > 0 ? Math.round((Number(r.fidelizados) / Number(r.totalEntrada)) * 100) : 0,
          mediaVisitas: Math.round(Number(r.mediaVisitas) * 10) / 10,
          mediaGasto: Math.round(Number(r.mediaGasto)),
        })),
      };
    }),

  // ── Barbeiros ────────────────────────────────────────────────────────────────
  barbeiros: protectedProcedure
    .input(baseInput)
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { orgFilter, unitFilter } = await resolveUnitFilter(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );

      const dataInicio = input.dataInicio || new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
      const dataFim = input.dataFim || new Date().toISOString().split("T")[0];

      let where = sql`dataVenda >= ${dataInicio} AND dataVenda <= ${dataFim + " 23:59:59"} AND clienteId != '2'`;
      // vendas has no orgId - skip orgFilter for this query
      if (unitFilter) where = sql`${where} AND unitId = ${unitFilter}`;

      // Métricas por barbeiro no período
      const [rows] = await db.execute(sql`
        SELECT 
          colaboradorId,
          colaboradorNome,
          COUNT(*) as totalAtendimentos,
          COUNT(DISTINCT clienteId) as clientesUnicos,
          SUM(valorLiquido) as faturamento,
          AVG(valorLiquido) as ticketMedio
        FROM vendas
        WHERE ${where}
          AND colaboradorId IS NOT NULL
          AND colaboradorNome IS NOT NULL
          AND colaboradorNome != ''
        GROUP BY colaboradorId, colaboradorNome
        ORDER BY totalAtendimentos DESC
      `) as any;

      // Novos clientes por barbeiro (primeira visita no período)
      const [novosRows] = await db.execute(sql`
        SELECT v.colaboradorId, COUNT(DISTINCT v.clienteId) as novos
        FROM vendas v
        INNER JOIN dimensao_clientes dc ON dc.clienteId = v.clienteId AND dc.unitId = v.unitId
        WHERE v.dataVenda >= ${dataInicio} AND v.dataVenda <= ${dataFim + " 23:59:59"}
          AND v.clienteId != '2'
          AND v.unitId = ${unitFilter || 0}
          AND DATE(dc.primeiraVenda) >= ${dataInicio}
          AND DATE(dc.primeiraVenda) <= ${dataFim}
        GROUP BY v.colaboradorId
      `) as any;
      const novosMap = new Map((novosRows as any[]).map(r => [r.colaboradorId, Number(r.novos)]));

      return {
        barbeiros: (rows as any[]).map(r => ({
          colaboradorId: r.colaboradorId,
          colaboradorNome: r.colaboradorNome,
          totalAtendimentos: Number(r.totalAtendimentos),
          clientesUnicos: Number(r.clientesUnicos),
          faturamento: Number(r.faturamento || 0),
          ticketMedio: Math.round(Number(r.ticketMedio || 0)),
          novosClientes: novosMap.get(r.colaboradorId) || 0,
        })),
        periodo: { dataInicio, dataFim },
      };
    }),

  // ── Diagnóstico ──────────────────────────────────────────────────────────────
  diagnostico: protectedProcedure
    .input(baseInput)
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { orgFilter, unitFilter } = await resolveUnitFilter(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );

      let where = sql`clienteId != '2'`;
      if (orgFilter) where = sql`${where} AND orgId = ${orgFilter}`;
      if (unitFilter) where = sql`${where} AND unitId = ${unitFilter}`;

      const [rows] = await db.execute(sql`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN telefone IS NULL OR telefone = '' THEN 1 ELSE 0 END) as semTelefone,
          SUM(CASE WHEN clienteNome IS NULL OR clienteNome = '' OR clienteNome = 'Sem Cadastro' THEN 1 ELSE 0 END) as semNome,
          SUM(CASE WHEN ultimaVenda IS NULL THEN 1 ELSE 0 END) as semUltimaVenda,
          SUM(CASE WHEN primeiraVenda IS NULL THEN 1 ELSE 0 END) as semPrimeiraVenda,
          SUM(CASE WHEN totalVisitas = 0 OR totalVisitas IS NULL THEN 1 ELSE 0 END) as semVisitas
        FROM dimensao_clientes
        WHERE ${where}
      `) as any;

      const diag = (rows as any[])[0];
      const total = Number(diag?.total || 0);

      // Clientes sem cadastro (nome = "Sem Cadastro")
      const [semCadastroRows] = await db.execute(sql`
        SELECT COUNT(*) as total FROM dimensao_clientes
        WHERE ${where} AND (clienteNome = 'Sem Cadastro' OR clienteNome IS NULL OR clienteNome = '')
      `) as any;

      // Distribuição de visitas
      const [visitasDistRows] = await db.execute(sql`
        SELECT totalVisitas, COUNT(*) as qtd
        FROM dimensao_clientes
        WHERE ${where}
        GROUP BY totalVisitas
        ORDER BY totalVisitas
        LIMIT 20
      `) as any;

      const semTelefone = Number(diag?.semTelefone || 0);
      const semNome = Number(diag?.semNome || 0);
      const semCadastro = Number((semCadastroRows as any[])[0]?.total || 0);

      const scoreQualidade = total > 0
        ? Math.round(100 - ((semTelefone + semNome) / (total * 2)) * 100)
        : 0;

      return {
        total,
        qualidade: {
          score: scoreQualidade,
          semTelefone,
          semNome,
          semCadastro,
          pctSemTelefone: total > 0 ? Math.round((semTelefone / total) * 100) : 0,
          pctSemNome: total > 0 ? Math.round((semNome / total) * 100) : 0,
          pctSemCadastro: total > 0 ? Math.round((semCadastro / total) * 100) : 0,
        },
        visitasDistribuicao: (visitasDistRows as any[]).map(r => ({
          visitas: Number(r.totalVisitas),
          clientes: Number(r.qtd),
        })),
        alertas: [
          ...(semTelefone > total * 0.3 ? [`${semTelefone} clientes sem telefone (${Math.round((semTelefone/total)*100)}%)`] : []),
          ...(semCadastro > total * 0.1 ? [`${semCadastro} clientes sem nome cadastrado`] : []),
        ],
      };
    }),

  // ── Ações (fila CRM) ─────────────────────────────────────────────────────────
  acoes: protectedProcedure
    .input(baseInput.extend({
      tipo: z.enum(["todos", "one_shot_risco", "perdidos_recentes", "em_risco", "sem_telefone"]).optional(),
      page: z.number().default(1),
      pageSize: z.number().default(50),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { orgFilter, unitFilter } = await resolveUnitFilter(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );

      const hoje = new Date().toISOString().split("T")[0];

      let where = sql`ultimaVenda IS NOT NULL AND clienteId != '2'`;
      if (orgFilter) where = sql`${where} AND orgId = ${orgFilter}`;
      if (unitFilter) where = sql`${where} AND unitId = ${unitFilter}`;

      // Filtro por tipo de ação
      const tipo = input.tipo || "todos";
      if (tipo === "one_shot_risco") {
        where = sql`${where} AND totalVisitas = 1 AND DATEDIFF(${hoje}, DATE(ultimaVenda)) BETWEEN 31 AND 90`;
      } else if (tipo === "perdidos_recentes") {
        where = sql`${where} AND DATEDIFF(${hoje}, DATE(ultimaVenda)) BETWEEN 91 AND 180`;
      } else if (tipo === "em_risco") {
        where = sql`${where} AND DATEDIFF(${hoje}, DATE(ultimaVenda)) BETWEEN 61 AND 90`;
      } else if (tipo === "sem_telefone") {
        where = sql`${where} AND (telefone IS NULL OR telefone = '')`;
      } else {
        // Todos: one-shot em risco + perdidos recentes + em risco
        where = sql`${where} AND (
          (totalVisitas = 1 AND DATEDIFF(${hoje}, DATE(ultimaVenda)) BETWEEN 31 AND 90) OR
          (DATEDIFF(${hoje}, DATE(ultimaVenda)) BETWEEN 61 AND 180)
        )`;
      }

      const [rows] = await db.execute(sql`
        SELECT clienteId, clienteNome, telefone, ultimaVenda, totalVisitas, totalGasto,
               DATEDIFF(${hoje}, DATE(ultimaVenda)) as dias
        FROM dimensao_clientes
        WHERE ${where}
        ORDER BY dias ASC
        LIMIT 500
      `) as any;

      const clientes = (rows as any[]).map(r => {
        const dias = Number(r.dias || 0);
        const totalVisitas = Number(r.totalVisitas || 0);
        let prioridade: "alta" | "media" | "baixa" = "baixa";
        let tipoAcao = "reativacao";
        if (totalVisitas === 1 && dias <= 60) { prioridade = "alta"; tipoAcao = "one_shot"; }
        else if (dias <= 90) { prioridade = "alta"; tipoAcao = "risco"; }
        else if (dias <= 120) { prioridade = "media"; tipoAcao = "perdido_recente"; }
        else { prioridade = "baixa"; tipoAcao = "perdido"; }
        return {
          clienteId: r.clienteId,
          clienteNome: r.clienteNome,
          telefone: r.telefone,
          ultimaVenda: r.ultimaVenda,
          totalVisitas,
          totalGasto: Number(r.totalGasto || 0),
          dias,
          prioridade,
          tipoAcao,
        };
      });

      const total = clientes.length;
      const offset = (input.page - 1) * input.pageSize;
      const paginated = clientes.slice(offset, offset + input.pageSize);

      return {
        clientes: paginated,
        total,
        resumo: {
          alta: clientes.filter(c => c.prioridade === "alta").length,
          media: clientes.filter(c => c.prioridade === "media").length,
          baixa: clientes.filter(c => c.prioridade === "baixa").length,
        },
      };
    }),
});
