import { z } from "zod";
import { and, count, eq, gte, lte, sql, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  vendas,
  camSentimentTimeline,
  repAvaliacoes,
  units,
  moduleConfigs,
  gtTarefas,
  gtProblemas,
  gtReunioes,
  gtFinanceiro,
} from "../../drizzle/schema";

// Helper: db.execute(sql.raw(...)) retorna [[rows], [metadata]] no MySQL2
// Usar execRow para pegar a primeira linha do resultado
function execRow(result: unknown): Record<string, unknown> {
  const r = result as unknown[][];
  if (Array.isArray(r) && Array.isArray(r[0]) && r[0].length > 0) {
    return r[0][0] as Record<string, unknown>;
  }
  return {};
}

function execRows(result: unknown): Record<string, unknown>[] {
  const r = result as unknown[][];
  if (Array.isArray(r) && Array.isArray(r[0])) {
    return r[0] as Record<string, unknown>[];
  }
  return [];
}

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

      // Período anterior (mesmo número de dias)
      const periodDays = Math.ceil((mesEnd.getTime() - mesStart.getTime()) / (1000 * 60 * 60 * 24));
      const mesAnteriorEnd = new Date(mesStart.getTime() - 1);
      const mesAnteriorStart = new Date(mesAnteriorEnd.getTime() - periodDays * 24 * 60 * 60 * 1000);

      const { start: hoje } = getToday();
      const hojeStr = hoje.toISOString().split("T")[0];

      const orgId = input.orgId;
      const unitId = input.unitId;

      // Formatar datas para SQL
      const pad = (n: number) => String(n).padStart(2, "0");
      const fmtDate = (d: Date) =>
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

      const mesStartStr = fmtDate(mesStart);
      const mesEndStr = fmtDate(mesEnd);
      const mesAnteriorStartStr = fmtDate(mesAnteriorStart);
      const mesAnteriorEndStr = fmtDate(mesAnteriorEnd);
      const unitWhere = unitId ? `AND unitId = ${unitId}` : "";

      // ── DATA VIP: usa vendas_api_raw (tabela principal do Data VIP) ──
      const vendaResult = await db.execute(sql.raw(
        `SELECT COALESCE(SUM(valorLiquido), 0) as total, COUNT(*) as atendimentos, COALESCE(AVG(valorLiquido), 0) as ticketMedio
         FROM vendas_api_raw
         WHERE vendaData >= '${mesStartStr}' AND vendaData <= '${mesEndStr}' ${unitWhere}`
      ));
      const vendaRaw = execRow(vendaResult);

      const vendaAnteriorResult = await db.execute(sql.raw(
        `SELECT COALESCE(SUM(valorLiquido), 0) as total
         FROM vendas_api_raw
         WHERE vendaData >= '${mesAnteriorStartStr}' AND vendaData <= '${mesAnteriorEndStr}' ${unitWhere}`
      ));
      const vendaAnteriorRaw = execRow(vendaAnteriorResult);

      let faturamentoMes = parseFloat(String(vendaRaw?.total ?? "0"));
      let atendimentos = Number(vendaRaw?.atendimentos ?? 0);
      let ticketMedio = parseFloat(String(vendaRaw?.ticketMedio ?? "0"));

      // Fallback para tabela vendas se vendas_api_raw não tiver dados no período
      if (faturamentoMes === 0 && atendimentos === 0) {
        const [vendaFallback] = await db.select({
          total: sql<string>`COALESCE(SUM(${vendas.valorLiquido}), 0)`,
          atendimentos: count(vendas.id),
          ticketMedio: sql<string>`COALESCE(AVG(${vendas.valorLiquido}), 0)`,
        }).from(vendas).where(and(
          gte(vendas.dataVenda, mesStart),
          lte(vendas.dataVenda, mesEnd),
          ...(unitId ? [eq(vendas.unitId, unitId)] : []),
        ));
        faturamentoMes = parseFloat(vendaFallback?.total ?? "0");
        atendimentos = Number(vendaFallback?.atendimentos ?? 0);
        ticketMedio = parseFloat(vendaFallback?.ticketMedio ?? "0");
      }

      const faturamentoAnterior = parseFloat(String(vendaAnteriorRaw?.total ?? "0"));
      const trendFaturamento = faturamentoAnterior > 0
        ? Math.round(((faturamentoMes - faturamentoAnterior) / faturamentoAnterior) * 100)
        : null;

      // ── GESTÃO TOTAL: usa gt_tarefas (tabela correta do módulo GT) ──
      const [gtTarefasStats] = await db.select({
        abertas: count(gtTarefas.id),
      }).from(gtTarefas).where(and(
        eq(gtTarefas.orgId, orgId),
        inArray(gtTarefas.status, ["pendente", "em_andamento"]),
        ...(unitId ? [eq(gtTarefas.unitId, unitId)] : []),
      ));

      const [gtTarefasCriticas] = await db.select({
        criticas: count(gtTarefas.id),
      }).from(gtTarefas).where(and(
        eq(gtTarefas.orgId, orgId),
        eq(gtTarefas.prioridade, "critica"),
        inArray(gtTarefas.status, ["pendente", "em_andamento"]),
        ...(unitId ? [eq(gtTarefas.unitId, unitId)] : []),
      ));

      const [problemasStats] = await db.select({ abertos: count(gtProblemas.id) })
        .from(gtProblemas)
        .where(and(
          eq(gtProblemas.orgId, orgId),
          inArray(gtProblemas.status, ["aberto", "em_analise"]),
          ...(unitId ? [eq(gtProblemas.unitId, unitId)] : []),
        ));

      const [reunioesHojeStats] = await db.select({ total: count(gtReunioes.id) })
        .from(gtReunioes)
        .where(and(
          eq(gtReunioes.orgId, orgId),
          sql`DATE(${gtReunioes.data}) = ${hojeStr}`,
          ...(unitId ? [eq(gtReunioes.unitId, unitId)] : []),
        ));

      // Financeiro do mês atual
      const refMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
      const finRows = await db.select({ tipo: gtFinanceiro.tipo, valor: gtFinanceiro.valor })
        .from(gtFinanceiro)
        .where(and(
          eq(gtFinanceiro.orgId, orgId),
          eq(gtFinanceiro.referencia, refMes),
          ...(unitId ? [eq(gtFinanceiro.unitId, unitId)] : []),
        ));
      const receitasGt = finRows.filter(f => f.tipo === "receita").reduce((s, f) => s + Number(f.valor), 0);
      const despesasGt = finRows.filter(f => f.tipo === "despesa").reduce((s, f) => s + Number(f.valor), 0);

      // ── VIP CAM: clientes únicos no período com regra SenseVIP ──
      const camTimelineRows = await db.select({
        clienteId: camSentimentTimeline.clienteId,
        satisfactionLevel: camSentimentTimeline.satisfactionLevel,
      }).from(camSentimentTimeline).where(and(
        gte(camSentimentTimeline.recordedAt, mesStart),
        lte(camSentimentTimeline.recordedAt, mesEnd),
        ...(unitId ? [eq(camSentimentTimeline.unitId, unitId)] : []),
      ));

      // Aplica regra SenseVIP: satisfeito é permanente > neutro > insatisfeito
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

      // ── REPUTAÇÃO: nota média geral (sem filtro de período — avaliações são históricas) ──
      const [repStats] = await db.select({
        media: sql<string>`COALESCE(AVG(${repAvaliacoes.nota}), 0)`,
        total: count(repAvaliacoes.id),
        semResposta: sql<string>`COALESCE(SUM(CASE WHEN ${repAvaliacoes.resposta} IS NULL OR ${repAvaliacoes.resposta} = '' THEN 1 ELSE 0 END), 0)`,
        positivas: sql<string>`COALESCE(SUM(CASE WHEN ${repAvaliacoes.sentimento} = 'positivo' THEN 1 ELSE 0 END), 0)`,
        mediaGoogle: sql<string>`COALESCE(AVG(CASE WHEN ${repAvaliacoes.plataforma} = 'google' THEN ${repAvaliacoes.nota} END), 0)`,
        totalGoogle: sql<string>`COALESCE(SUM(CASE WHEN ${repAvaliacoes.plataforma} = 'google' THEN 1 ELSE 0 END), 0)`,
        semRespostaGoogle: sql<string>`COALESCE(SUM(CASE WHEN ${repAvaliacoes.plataforma} = 'google' AND (${repAvaliacoes.resposta} IS NULL OR ${repAvaliacoes.resposta} = '') THEN 1 ELSE 0 END), 0)`,
      }).from(repAvaliacoes).where(
        unitId ? eq(repAvaliacoes.unitId, unitId) : undefined
      );

      const totalRep = Number(repStats?.total ?? 0);
      const mediaFinal = totalRep > 0 ? parseFloat(repStats?.media ?? "0") : 0;
      const positivasFinal = Number(repStats?.positivas ?? 0);

      return {
        dataVip: {
          faturamentoMes,
          atendimentos,
          ticketMedio,
          trendFaturamento,
          hasData: faturamentoMes > 0 || atendimentos > 0,
        },
        gestaoTotal: {
          tarefasAbertas: Number(gtTarefasStats?.abertas ?? 0),
          tarefasCriticas: Number(gtTarefasCriticas?.criticas ?? 0),
          problemasAbertos: Number(problemasStats?.abertos ?? 0),
          reunioesHoje: Number(reunioesHojeStats?.total ?? 0),
          receitasMes: receitasGt,
          despesasMes: despesasGt,
          lucroMes: receitasGt - despesasGt,
          hasData: true,
        },
        vipCam: {
          clientesNoPeriodo: camTotal,
          satisfeitosNoPeriodo: camSatisfeitos,
          neutrosNoPeriodo: camNeutros,
          insatisfeitosNoPeriodo: camInsatisfeitos,
          satisfacaoPercent: camSatisfacaoPercent,
          hasData: camTotal > 0,
        },
        reputacao: {
          mediaAvaliacoes: mediaFinal,
          totalAvaliacoes: totalRep,
          positivasPercent: totalRep > 0
            ? Math.round((positivasFinal / totalRep) * 100)
            : 0,
          mediaGoogle: parseFloat(repStats?.mediaGoogle ?? "0"),
          totalGoogle: Number(repStats?.totalGoogle ?? 0),
          semRespostaGoogle: Number(repStats?.semRespostaGoogle ?? 0),
          semResposta: Number(repStats?.semResposta ?? 0),
          hasData: totalRep > 0,
        },
        autoInstagram: {
          seguidores: 0,
          novosSeguidores: 0,
          comentariosRespondidos: 0,
          hasData: false,
        },
        weSend: {
          campanhas: 0,
          enviados: 0,
          totalContatos: 0,
          hasData: false,
        },
      };
    }),

  // ─── STATUS DE CONFIGURAÇÃO DOS MÓDULOS ──────────────────────────────────
  modulesStatus: protectedProcedure
    .input(z.object({ unitId: z.number().optional(), orgId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return {};

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

      // Verificar se há dados reais para cada módulo (mesmo sem configuração explícita)
      const unitId = input.unitId;

      // VIP Cam: verifica se há clientes reconhecidos
      const [camCount] = await db.select({ cnt: count(camSentimentTimeline.id) })
        .from(camSentimentTimeline)
        .where(unitId ? eq(camSentimentTimeline.unitId, unitId) : undefined);
      const hasVipCamData = Number(camCount?.cnt ?? 0) > 0;

      // Reputação: verifica se há avaliações
      const [repCount] = await db.select({ cnt: count(repAvaliacoes.id) })
        .from(repAvaliacoes)
        .where(unitId ? eq(repAvaliacoes.unitId, unitId) : undefined);
      const hasReputacaoData = Number(repCount?.cnt ?? 0) > 0;

      return {
        // data_vip: ativo se configurado OU se há dados na vendas_api_raw
        data_vip: configuredModules.has("data_vip"),
        // gestao_total: sempre ativo (módulo interno)
        gestao_total: true,
        // vip_cam: ativo se configurado OU se há dados reais
        vip_cam: configuredModules.has("vip_cam") || hasVipCamData,
        // reputacao: ativo se configurado OU se há avaliações
        reputacao: configuredModules.has("reputacao") || hasReputacaoData,
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

      const pad = (n: number) => String(n).padStart(2, "0");
      const fmtDate = (d: Date) =>
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

      const unitWhere = input.unitId ? `AND unitId = ${input.unitId}` : "";
      const meses = [];

      for (let i = 5; i >= 0; i--) {
        const { start, end } = getMonthRange(-i);
        const startStr = fmtDate(start);
        const endStr = fmtDate(end);

        // Tenta vendas_api_raw primeiro
        const rawResult = await db.execute(sql.raw(
          `SELECT COALESCE(SUM(valorLiquido), 0) as total, COUNT(*) as atendimentos
           FROM vendas_api_raw
           WHERE vendaData >= '${startStr}' AND vendaData <= '${endStr}' ${unitWhere}`
        ));
        const rawRow = execRow(rawResult);

        let faturamento = parseFloat(String(rawRow?.total ?? "0"));
        let atendimentos = Number(rawRow?.atendimentos ?? 0);

        // Fallback para tabela vendas
        if (faturamento === 0 && atendimentos === 0) {
          const [fallback] = await db.select({
            total: sql<string>`COALESCE(SUM(${vendas.valorLiquido}), 0)`,
            atendimentos: count(vendas.id),
          }).from(vendas).where(and(
            gte(vendas.dataVenda, start),
            lte(vendas.dataVenda, end),
            ...(input.unitId ? [eq(vendas.unitId, input.unitId)] : []),
          ));
          faturamento = parseFloat(fallback?.total ?? "0");
          atendimentos = Number(fallback?.atendimentos ?? 0);
        }

        meses.push({
          mes: start.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
          faturamento,
          atendimentos,
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

      const pad = (n: number) => String(n).padStart(2, "0");
      const fmtDate = (d: Date) =>
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

      const { start, end } = getMonthRange(0);
      const startStr = fmtDate(start);
      const endStr = fmtDate(end);

      const orgUnits = await db.select({ id: units.id, name: units.name })
        .from(units)
        .where(eq(units.orgId, input.orgId));

      const ranking = [];
      for (const unit of orgUnits) {
        const rawResult = await db.execute(sql.raw(
          `SELECT COALESCE(SUM(valorLiquido), 0) as total, COUNT(*) as atendimentos
           FROM vendas_api_raw
           WHERE vendaData >= '${startStr}' AND vendaData <= '${endStr}' AND unitId = ${unit.id}`
        ));
        const rawRow = execRow(rawResult);

        let faturamento = parseFloat(String(rawRow?.total ?? "0"));
        let atendimentos = Number(rawRow?.atendimentos ?? 0);

        // Fallback para tabela vendas
        if (faturamento === 0 && atendimentos === 0) {
          const [fallback] = await db.select({
            total: sql<string>`COALESCE(SUM(${vendas.valorLiquido}), 0)`,
            atendimentos: count(vendas.id),
          }).from(vendas).where(and(
            gte(vendas.dataVenda, start),
            lte(vendas.dataVenda, end),
            eq(vendas.unitId, unit.id),
          ));
          faturamento = parseFloat(fallback?.total ?? "0");
          atendimentos = Number(fallback?.atendimentos ?? 0);
        }

        ranking.push({ unitId: unit.id, name: unit.name, faturamento, atendimentos });
      }

      return ranking.sort((a, b) => b.faturamento - a.faturamento);
    }),
});
