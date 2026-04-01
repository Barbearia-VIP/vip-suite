import { z } from "zod";
import { and, count, eq, gte, lte, sql, sum, avg, desc, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  vendas,
  tasks,
  camClientes,
  camMetricasDiarias,
  camSentimentTimeline,
  avaliacoes,
  repAvaliacoes,
  instagramMetricas,
  whatsappCampanhas,
  units,
  moduleConfigs,
  metas,
  gtTarefas,
  gtProblemas,
  gtReunioes,
  gtFinanceiro,
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
    .input(z.object({
      unitId: z.number().optional(),
      orgId: z.number(),
      // Filtro de período: dateFrom e dateTo em ISO string (YYYY-MM-DD)
      // Se não informados, usa o mês atual
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      // ── Período selecionado ──
      let mesStart: Date;
      let mesEnd: Date;
      if (input.dateFrom && input.dateTo) {
        mesStart = new Date(input.dateFrom + "T00:00:00");
        mesEnd = new Date(input.dateTo + "T23:59:59");
      } else {
        const range = getMonthRange(0);
        mesStart = range.start;
        mesEnd = range.end;
      }
      // Período anterior (mesmo número de dias, antes do período selecionado)
      const periodDays = Math.ceil((mesEnd.getTime() - mesStart.getTime()) / (1000 * 60 * 60 * 24));
      const mesAnteriorEnd = new Date(mesStart.getTime() - 1);
      const mesAnteriorStart = new Date(mesAnteriorEnd.getTime() - periodDays * 24 * 60 * 60 * 1000);

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

      // ── GESTÃO TOTAL: problemas abertos, reuniões hoje, financeiro ──
      const orgIdGt = input.orgId;
      const [problemasStats] = await db.select({ abertos: count(gtProblemas.id) })
        .from(gtProblemas)
        .where(and(
          eq(gtProblemas.orgId, orgIdGt),
          inArray(gtProblemas.status, ["aberto", "em_analise"]),
          ...(input.unitId ? [eq(gtProblemas.unitId, input.unitId)] : []),
        ));
      const hojeStr = hoje.toISOString().split("T")[0];
      const [reunioesHojeStats] = await db.select({ total: count(gtReunioes.id) })
        .from(gtReunioes)
        .where(and(
          eq(gtReunioes.orgId, orgIdGt),
          sql`DATE(${gtReunioes.data}) = ${hojeStr}`,
          ...(input.unitId ? [eq(gtReunioes.unitId, input.unitId)] : []),
        ));
      const refMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
      const finRows = await db.select({ tipo: gtFinanceiro.tipo, valor: gtFinanceiro.valor })
        .from(gtFinanceiro)
        .where(and(
          eq(gtFinanceiro.orgId, orgIdGt),
          eq(gtFinanceiro.referencia, refMes),
          ...(input.unitId ? [eq(gtFinanceiro.unitId, input.unitId)] : []),
        ));
      const receitasGt = finRows.filter(f => f.tipo === "receita").reduce((s, f) => s + Number(f.valor), 0);
      const despesasGt = finRows.filter(f => f.tipo === "despesa").reduce((s, f) => s + Number(f.valor), 0);

      // ── VIP CAM: reconhecimentos no período selecionado (via timeline) ──
      const camTimelineConditions = [
        gte(camSentimentTimeline.recordedAt, mesStart),
        lte(camSentimentTimeline.recordedAt, mesEnd),
        ...(input.unitId ? [eq(camSentimentTimeline.unitId, input.unitId)] : []),
      ];
      // Clientes únicos no período com a regra SenseVIP de prioridade
      const camTimelineRows = await db.select({
        clienteId: camSentimentTimeline.clienteId,
        satisfactionLevel: camSentimentTimeline.satisfactionLevel,
      }).from(camSentimentTimeline).where(and(...camTimelineConditions));

      // Agrupa por cliente e aplica regra SenseVIP
      const camClienteMap = new Map<number, { happy: number; neutral: number; angry: number }>();
      for (const row of camTimelineRows) {
        const c = camClienteMap.get(row.clienteId) ?? { happy: 0, neutral: 0, angry: 0 };
        if (row.satisfactionLevel === "satisfied") c.happy++;
        else if (row.satisfactionLevel === "neutral") c.neutral++;
        else c.angry++;
        camClienteMap.set(row.clienteId, c);
      }
      let camSatisfeitos = 0, camNeutros = 0, camInsatisfeitos = 0;
      for (const [, counts] of Array.from(camClienteMap.entries())) {
        if (counts.happy > 0) camSatisfeitos++;
        else if (counts.neutral >= counts.angry) camNeutros++;
        else camInsatisfeitos++;
      }
      const camTotal = camClienteMap.size;
      const camSatisfacaoPercent = camTotal > 0
        ? Math.round((camSatisfeitos / camTotal) * 100)
        : 0;

      // Também busca dados de hoje para compatibilidade
      const camWhere = input.unitId
        ? sql`${camMetricasDiarias.data} >= ${hoje.toISOString().split("T")[0]} AND ${camMetricasDiarias.data} <= ${hojeEnd.toISOString().split("T")[0]} AND ${camMetricasDiarias.unitId} = ${input.unitId}`
        : sql`${camMetricasDiarias.data} >= ${hoje.toISOString().split("T")[0]} AND ${camMetricasDiarias.data} <= ${hojeEnd.toISOString().split("T")[0]}`;
      const [camHoje] = await db.select({
        total: sql<string>`COALESCE(SUM(${camMetricasDiarias.totalDeteccoes}), 0)`,
        satisfeitos: sql<string>`COALESCE(SUM(${camMetricasDiarias.satisfeitos}), 0)`,
        insatisfeitos: sql<string>`COALESCE(SUM(${camMetricasDiarias.insatisfeitos}), 0)`,
      }).from(camMetricasDiarias).where(camWhere);

      // ── REPUTAÇÃO: avaliação média do período (repAvaliacoes — Google e outras plataformas) ──
      const repAvalConditions = [
        gte(repAvaliacoes.dataAvaliacao, mesStart),
        lte(repAvaliacoes.dataAvaliacao, mesEnd),
        ...(input.unitId ? [eq(repAvaliacoes.unitId, input.unitId)] : []),
      ];
      const [repStats] = await db.select({
        media: sql<string>`COALESCE(AVG(${repAvaliacoes.nota}), 0)`,
        total: count(repAvaliacoes.id),
        semResposta: sql<string>`COALESCE(SUM(CASE WHEN ${repAvaliacoes.resposta} IS NULL OR ${repAvaliacoes.resposta} = '' THEN 1 ELSE 0 END), 0)`,
        positivas: sql<string>`COALESCE(SUM(CASE WHEN ${repAvaliacoes.sentimento} = 'positivo' THEN 1 ELSE 0 END), 0)`,
        google: sql<string>`COALESCE(SUM(CASE WHEN ${repAvaliacoes.plataforma} = 'google' THEN 1 ELSE 0 END), 0)`,
        mediaGoogle: sql<string>`COALESCE(AVG(CASE WHEN ${repAvaliacoes.plataforma} = 'google' THEN ${repAvaliacoes.nota} END), 0)`,
        semRespostaGoogle: sql<string>`COALESCE(SUM(CASE WHEN ${repAvaliacoes.plataforma} = 'google' AND (${repAvaliacoes.resposta} IS NULL OR ${repAvaliacoes.resposta} = '') THEN 1 ELSE 0 END), 0)`,
      }).from(repAvaliacoes).where(and(...repAvalConditions));

      // Fallback para tabela antiga de avaliações
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

      // Usa repAvaliacoes se tiver dados, senão fallback para avaliacoes
      const totalRepAval = Number(repStats?.total ?? 0);
      const totalAval = Number(avalStats?.total ?? 0);
      const mediaFinal = totalRepAval > 0
        ? parseFloat(repStats?.media ?? "0")
        : parseFloat(avalStats?.media ?? "0");
      const totalFinal = totalRepAval > 0 ? totalRepAval : totalAval;
      const positivasFinal = totalRepAval > 0
        ? Number(repStats?.positivas ?? 0)
        : Number(avalStats?.positivas ?? 0);

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
          problemasAbertos: Number(problemasStats?.abertos ?? 0),
          reunioesHoje: Number(reunioesHojeStats?.total ?? 0),
          receitasMes: receitasGt,
          despesasMes: despesasGt,
          lucroMes: receitasGt - despesasGt,
          hasData: true,
        },
        vipCam: {
          // Dados do período selecionado (clientes únicos com regra SenseVIP)
          clientesNoPeriodo: camTotal,
          satisfeitosNoPeriodo: camSatisfeitos,
          neutrosNoPeriodo: camNeutros,
          insatisfeitosNoPeriodo: camInsatisfeitos,
          satisfacaoPercent: camSatisfacaoPercent,
          // Dados de hoje (compatibilidade)
          reconhecidosHoje: Number(camHoje?.total ?? 0),
          satisfeitos: Number(camHoje?.satisfeitos ?? 0),
          insatisfeitos: Number(camHoje?.insatisfeitos ?? 0),
          hasData: camTotal > 0 || Number(camHoje?.total ?? 0) > 0,
        },
        reputacao: {
          mediaAvaliacoes: mediaFinal,
          totalAvaliacoes: totalFinal,
          positivasPercent: totalFinal > 0
            ? Math.round((positivasFinal / totalFinal) * 100)
            : 0,
          // Google específico
          mediaGoogle: parseFloat(repStats?.mediaGoogle ?? "0"),
          totalGoogle: Number(repStats?.google ?? 0),
          semRespostaGoogle: Number(repStats?.semRespostaGoogle ?? 0),
          semResposta: Number(repStats?.semResposta ?? 0),
          hasData: totalFinal > 0,
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
