import { z } from "zod";
import { and, count, eq, gte, lte, sql, sum, avg, desc, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  vendas,
  tasks,
  camClientes,
  camMetricasDiarias,
  avaliacoes,
  instagramMetricas,
  whatsappCampanhas,
  units,
  moduleConfigs,
  metas,
} from "../../drizzle/schema";

// Importar whatsappCampanhas do schema (criado via SQL direto)
// A tabela existe no BD mas pode não estar no schema Drizzle — usamos sql raw se necessário

function getMonthRange(offsetMonths = 0) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + offsetMonths;
  const start = new Date(year, month, 1, 0, 0, 0);
  const end = new Date(year, month + 1, 0, 23, 59, 59);
  return { start, end };
}

function getToday() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  return { start, end };
}

export const dashboardRouter = router({

  // ─── KPIs CONSOLIDADOS ────────────────────────────────────────────────────
  kpis: protectedProcedure
    .input(z.object({ unitId: z.number().optional(), orgId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const { start: mesStart, end: mesEnd } = getMonthRange(0);
      const { start: mesAnteriorStart, end: mesAnteriorEnd } = getMonthRange(-1);
      const { start: hoje, end: hojeEnd } = getToday();

      // Filtro de unidade
      const unitFilter = input.unitId ? eq(vendas.unitId, input.unitId) : undefined;
      const unitFilterTasks = input.unitId ? eq(tasks.unitId, input.unitId) : undefined;
      const unitFilterCam = input.unitId ? eq(camMetricasDiarias.unitId, input.unitId) : undefined;
      const unitFilterAval = input.unitId ? eq(avaliacoes.unitId, input.unitId) : undefined;

      // ── DATA VIP: faturamento do mês atual e anterior ──
      const vendaConditions = [
        gte(vendas.dataVenda, mesStart),
        lte(vendas.dataVenda, mesEnd),
        ...(unitFilter ? [unitFilter] : []),
      ];
      const vendaConditionsAnterior = [
        gte(vendas.dataVenda, mesAnteriorStart),
        lte(vendas.dataVenda, mesAnteriorEnd),
        ...(unitFilter ? [unitFilter] : []),
      ];

      const [vendaMes] = await db.select({
        total: sql<string>`COALESCE(SUM(${vendas.valorLiquido}), 0)`,
        atendimentos: count(vendas.id),
        ticketMedio: sql<string>`COALESCE(AVG(${vendas.valorLiquido}), 0)`,
      }).from(vendas).where(and(...vendaConditions));

      const [vendaAnterior] = await db.select({
        total: sql<string>`COALESCE(SUM(${vendas.valorLiquido}), 0)`,
      }).from(vendas).where(and(...vendaConditionsAnterior));

      const faturamentoMes = parseFloat(vendaMes?.total ?? "0");
      const faturamentoAnterior = parseFloat(vendaAnterior?.total ?? "0");
      const trendFaturamento = faturamentoAnterior > 0
        ? Math.round(((faturamentoMes - faturamentoAnterior) / faturamentoAnterior) * 100)
        : null;

      // ── GESTÃO TOTAL: tarefas abertas e em andamento ──
      const taskConditions = [
        inArray(tasks.status, ["pendente", "em_andamento"]),
        ...(unitFilterTasks ? [unitFilterTasks] : []),
      ];
      const [taskStats] = await db.select({
        abertas: count(tasks.id),
      }).from(tasks).where(and(...taskConditions));

      const [taskCriticas] = await db.select({
        criticas: count(tasks.id),
      }).from(tasks).where(and(
        eq(tasks.prioridade, "critica"),
        inArray(tasks.status, ["pendente", "em_andamento"]),
        ...(unitFilterTasks ? [unitFilterTasks] : []),
      ));

      // ── VIP CAM: reconhecimentos hoje ──
      const camWhere = input.unitId
        ? sql`${camMetricasDiarias.data} >= ${hoje.toISOString().split("T")[0]} AND ${camMetricasDiarias.data} <= ${hojeEnd.toISOString().split("T")[0]} AND ${camMetricasDiarias.unitId} = ${input.unitId}`
        : sql`${camMetricasDiarias.data} >= ${hoje.toISOString().split("T")[0]} AND ${camMetricasDiarias.data} <= ${hojeEnd.toISOString().split("T")[0]}`;
      const [camHoje] = await db.select({
        total: sql<string>`COALESCE(SUM(${camMetricasDiarias.totalDeteccoes}), 0)`,
        satisfeitos: sql<string>`COALESCE(SUM(${camMetricasDiarias.satisfeitos}), 0)`,
        insatisfeitos: sql<string>`COALESCE(SUM(${camMetricasDiarias.insatisfeitos}), 0)`,
      }).from(camMetricasDiarias).where(camWhere);

      // ── REPUTAÇÃO: avaliação média do mês ──
      const avalConditions = [
        gte(avaliacoes.dataAvaliacao, mesStart),
        lte(avaliacoes.dataAvaliacao, mesEnd),
        ...(unitFilterAval ? [unitFilterAval] : []),
      ];
      const [avalStats] = await db.select({
        media: sql<string>`COALESCE(AVG(${avaliacoes.nota}), 0)`,
        total: count(avaliacoes.id),
        positivas: sql<string>`COALESCE(SUM(CASE WHEN ${avaliacoes.sentimento} = 'positivo' THEN 1 ELSE 0 END), 0)`,
      }).from(avaliacoes).where(and(...avalConditions));

      // ── AUTO INSTAGRAM: seguidores e engajamento ──
      const igWhere = input.unitId
        ? sql`${instagramMetricas.data} >= ${mesStart.toISOString().split("T")[0]} AND ${instagramMetricas.data} <= ${mesEnd.toISOString().split("T")[0]} AND ${instagramMetricas.unitId} = ${input.unitId}`
        : sql`${instagramMetricas.data} >= ${mesStart.toISOString().split("T")[0]} AND ${instagramMetricas.data} <= ${mesEnd.toISOString().split("T")[0]}`;
      const [igStats] = await db.select({
        seguidores: sql<string>`COALESCE(SUM(${instagramMetricas.seguidores}), 0)`,
        novosSeguidores: sql<string>`COALESCE(SUM(${instagramMetricas.novosSeguidores}), 0)`,
        comentariosRespondidos: sql<string>`COALESCE(SUM(${instagramMetricas.comentariosRespondidos}), 0)`,
      }).from(instagramMetricas).where(igWhere);

      // ── WE SEND: campanhas do mês ──
      const [wsStats] = await db.execute(
        sql`SELECT 
          COUNT(*) as total,
          COALESCE(SUM(enviados), 0) as enviados,
          COALESCE(SUM(totalContatos), 0) as totalContatos
        FROM whatsapp_campanhas 
        WHERE createdAt >= ${mesStart.toISOString()} 
          AND createdAt <= ${mesEnd.toISOString()}
          ${input.unitId ? sql`AND unitId = ${input.unitId}` : sql``}`
      ) as any;

      const wsRow = wsStats?.[0] ?? {};

      return {
        dataVip: {
          faturamentoMes,
          atendimentos: Number(vendaMes?.atendimentos ?? 0),
          ticketMedio: parseFloat(vendaMes?.ticketMedio ?? "0"),
          trendFaturamento,
          hasData: faturamentoMes > 0 || Number(vendaMes?.atendimentos ?? 0) > 0,
        },
        gestaoTotal: {
          tarefasAbertas: Number(taskStats?.abertas ?? 0),
          tarefasCriticas: Number(taskCriticas?.criticas ?? 0),
          hasData: true,
        },
        vipCam: {
          reconhecidosHoje: Number(camHoje?.total ?? 0),
          satisfeitos: Number(camHoje?.satisfeitos ?? 0),
          insatisfeitos: Number(camHoje?.insatisfeitos ?? 0),
          hasData: Number(camHoje?.total ?? 0) > 0,
        },
        reputacao: {
          mediaAvaliacoes: parseFloat(avalStats?.media ?? "0"),
          totalAvaliacoes: Number(avalStats?.total ?? 0),
          positivasPercent: Number(avalStats?.total ?? 0) > 0
            ? Math.round((Number(avalStats?.positivas ?? 0) / Number(avalStats?.total ?? 0)) * 100)
            : 0,
          hasData: Number(avalStats?.total ?? 0) > 0,
        },
        autoInstagram: {
          seguidores: Number(igStats?.seguidores ?? 0),
          novosSeguidores: Number(igStats?.novosSeguidores ?? 0),
          comentariosRespondidos: Number(igStats?.comentariosRespondidos ?? 0),
          hasData: Number(igStats?.seguidores ?? 0) > 0,
        },
        weSend: {
          campanhas: Number(wsRow?.total ?? 0),
          enviados: Number(wsRow?.enviados ?? 0),
          totalContatos: Number(wsRow?.totalContatos ?? 0),
          hasData: Number(wsRow?.total ?? 0) > 0,
        },
      };
    }),

  // ─── STATUS DE CONFIGURAÇÃO DOS MÓDULOS ──────────────────────────────────
  modulesStatus: protectedProcedure
    .input(z.object({ unitId: z.number().optional(), orgId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return {};

      // Buscar todas as configs de módulos para a unidade (ou todas as unidades da org)
      let configs: { module: string; unitId: number; active: boolean }[] = [];

      if (input.unitId) {
        configs = await db.select({
          module: moduleConfigs.module,
          unitId: moduleConfigs.unitId,
          active: moduleConfigs.active,
        }).from(moduleConfigs).where(
          and(eq(moduleConfigs.unitId, input.unitId), eq(moduleConfigs.active, true))
        );
      } else {
        // Todas as unidades da org
        const orgUnits = await db.select({ id: units.id }).from(units).where(eq(units.orgId, input.orgId));
        const unitIds = orgUnits.map(u => u.id);
        if (unitIds.length > 0) {
          configs = await db.select({
            module: moduleConfigs.module,
            unitId: moduleConfigs.unitId,
            active: moduleConfigs.active,
          }).from(moduleConfigs).where(
            and(inArray(moduleConfigs.unitId, unitIds), eq(moduleConfigs.active, true))
          );
        }
      }

      const configuredModules = new Set(configs.map(c => c.module));
      return {
        data_vip: configuredModules.has("data_vip"),
        gestao_total: configuredModules.has("gestao_total"),
        vip_cam: configuredModules.has("vip_cam"),
        reputacao: configuredModules.has("reputacao"),
        auto_instagram: configuredModules.has("auto_instagram"),
        we_send: configuredModules.has("we_send"),
      };
    }),

  // ─── GRÁFICO DE FATURAMENTO MENSAL (últimos 6 meses) ─────────────────────
  faturamentoMensal: protectedProcedure
    .input(z.object({ unitId: z.number().optional(), orgId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const meses = [];
      for (let i = 5; i >= 0; i--) {
        const { start, end } = getMonthRange(-i);
        const conditions = [
          gte(vendas.dataVenda, start),
          lte(vendas.dataVenda, end),
          ...(input.unitId ? [eq(vendas.unitId, input.unitId)] : []),
        ];
        const [result] = await db.select({
          total: sql<string>`COALESCE(SUM(${vendas.valorLiquido}), 0)`,
          atendimentos: count(vendas.id),
        }).from(vendas).where(and(...conditions) as any);

        meses.push({
          mes: start.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
          faturamento: parseFloat(result?.total ?? "0"),
          atendimentos: Number(result?.atendimentos ?? 0),
        });
      }
      return meses;
    }),

  // ─── RANKING DE UNIDADES (faturamento do mês) ────────────────────────────
  rankingUnidades: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const { start, end } = getMonthRange(0);
      const orgUnits = await db.select({ id: units.id, name: units.name, city: units.city }).from(units).where(eq(units.orgId, input.orgId));

      const ranking = await Promise.all(orgUnits.map(async (unit) => {
        const [result] = await db.select({
          total: sql<string>`COALESCE(SUM(${vendas.valorLiquido}), 0)`,
          atendimentos: count(vendas.id),
        }).from(vendas).where(and(
          eq(vendas.unitId, unit.id),
          gte(vendas.dataVenda, start),
          lte(vendas.dataVenda, end),
        ) as any);
        return {
          unitId: unit.id,
          name: unit.name,
          city: unit.city ?? null,
          faturamento: parseFloat(result?.total ?? "0"),
          atendimentos: Number(result?.atendimentos ?? 0),
        };
      }));

      return ranking.sort((a, b) => b.faturamento - a.faturamento).slice(0, 10);
    }),
});
