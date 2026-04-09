import { z } from "zod";
import { and, count, eq, gte, lte, sql, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { queryLocal } from "../db-local";
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
  // Usa fuso Brasil (UTC-3) para determinar o mês correto
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const year = brt.getUTCFullYear();
  const month = brt.getUTCMonth() + offsetMonths;
  // Início do mês em BRT → convertido para UTC (adiciona 3h)
  const startBRT = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const start = new Date(startBRT.getTime() + 3 * 60 * 60 * 1000);
  // Fim do mês em BRT → início do próximo mês BRT - 1ms → UTC
  const endBRT = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));
  const end = new Date(endBRT.getTime() + 3 * 60 * 60 * 1000 - 1);
  return { start, end };
}

function getToday() {
  // Usa fuso Brasil (UTC-3) para determinar o dia correto
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const year = brt.getUTCFullYear();
  const month = brt.getUTCMonth();
  const day = brt.getUTCDate();
  const startBRT = new Date(Date.UTC(year, month, day, 0, 0, 0));
  const start = new Date(startBRT.getTime() + 3 * 60 * 60 * 1000);
  const endBRT = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
  const end = new Date(endBRT.getTime() + 3 * 60 * 60 * 1000);
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

      // ── Resolver externalIds da unidade selecionada ──
      // Busca os IDs externos (sync_vendas.unidade_id) correspondentes à unidade interna
      let extIds: number[] = [];
      if (unitId) {
        const extRows = await db.execute(sql.raw(
          `SELECT externalId FROM units WHERE id = ${unitId} AND externalId IS NOT NULL`
        )) as any;
        const extId = (Array.isArray(extRows) && Array.isArray(extRows[0]) ? extRows[0] : [])[0]?.externalId;
        if (extId) extIds = [Number(extId)];
      } else {
        const extRows = await db.execute(sql.raw(
          `SELECT externalId FROM units WHERE orgId = ${orgId} AND externalId IS NOT NULL`
        )) as any;
        extIds = (Array.isArray(extRows) && Array.isArray(extRows[0]) ? extRows[0] : []).map((r: any) => Number(r.externalId)).filter(Boolean);
      }

      // ── DATA VIP: usa sync_vendas (banco local sincronizado em tempo real) ──
      // sync_vendas.valor_total = valor bruto da venda (equivalente ao valorLiquido do sistema)
      let faturamentoMes = 0;
      let atendimentos = 0;
      let ticketMedio = 0;
      let faturamentoAnterior = 0;
      let totalClientes = 0;

      if (extIds.length > 0) {
        const unitCond = extIds.length === 1
          ? `v.unidade_id = ${extIds[0]}`
          : `v.unidade_id IN (${extIds.join(",")})`;

        const [syncVendaRows] = await queryLocal<{
          total: number; atendimentos: number; ticketMedio: number;
        }>(`
          SELECT
            COALESCE(SUM(v.valor_total), 0) as total,
            COUNT(*) as atendimentos,
            COALESCE(AVG(v.valor_total), 0) as ticketMedio
          FROM sync_vendas v
          WHERE ${unitCond}
            AND v.data_criacao >= '${mesStartStr}'
            AND v.data_criacao <= '${mesEndStr}'
            AND v.comanda_temp = 0
            AND v.cancelado_motivo IS NULL
            AND v.status != 0
        `);
        faturamentoMes = parseFloat(String(syncVendaRows?.total ?? 0));
        atendimentos = Number(syncVendaRows?.atendimentos ?? 0);
        ticketMedio = parseFloat(String(syncVendaRows?.ticketMedio ?? 0));

        const [syncVendaAntRows] = await queryLocal<{ total: number }>(`
          SELECT COALESCE(SUM(v.valor_total), 0) as total
          FROM sync_vendas v
          WHERE ${unitCond}
            AND v.data_criacao >= '${mesAnteriorStartStr}'
            AND v.data_criacao <= '${mesAnteriorEndStr}'
            AND v.comanda_temp = 0
            AND v.cancelado_motivo IS NULL
            AND v.status != 0
        `);
        faturamentoAnterior = parseFloat(String(syncVendaAntRows?.total ?? 0));

        // Clientes únicos atendidos no período
        const [clientesRows] = await queryLocal<{ total: number }>(`
          SELECT COUNT(DISTINCT v.cliente) as total
          FROM sync_vendas v
          WHERE ${unitCond}
            AND v.data_criacao >= '${mesStartStr}'
            AND v.data_criacao <= '${mesEndStr}'
            AND v.comanda_temp = 0
            AND v.cancelado_motivo IS NULL
            AND v.status != 0
            AND v.cliente IS NOT NULL
            AND v.cliente != 2
        `);
        totalClientes = Number(clientesRows?.total ?? 0);
      }

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

      // Financeiro do período selecionado (usa todos os meses que se sobrepõem ao período)
      // A tabela gtFinanceiro usa campo 'referencia' no formato YYYY-MM
      // Busca todos os meses entre mesStart e mesEnd
      const mesRefs: string[] = [];
      const cursor = new Date(mesStart.getFullYear(), mesStart.getMonth(), 1);
      const mesEndRef = new Date(mesEnd.getFullYear(), mesEnd.getMonth(), 1);
      while (cursor <= mesEndRef) {
        mesRefs.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
        cursor.setMonth(cursor.getMonth() + 1);
      }

      const finRows = mesRefs.length > 0
        ? await db.select({ tipo: gtFinanceiro.tipo, valor: gtFinanceiro.valor })
            .from(gtFinanceiro)
            .where(and(
              eq(gtFinanceiro.orgId, orgId),
              inArray(gtFinanceiro.referencia, mesRefs),
              ...(unitId ? [eq(gtFinanceiro.unitId, unitId)] : []),
            ))
        : [];
      const receitasGt = finRows.filter(f => f.tipo === 'receita').reduce((s, f) => s + Number(f.valor), 0);
      const despesasGt = finRows.filter(f => f.tipo === 'despesa').reduce((s, f) => s + Number(f.valor), 0);

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

      // ── REPUTAÇÃO: nota média geral (histórico completo) + NPS calculado ──
      const [repStats] = await db.select({
        media: sql<string>`COALESCE(AVG(${repAvaliacoes.nota}), 0)`,
        total: count(repAvaliacoes.id),
        semResposta: sql<string>`COALESCE(SUM(CASE WHEN ${repAvaliacoes.resposta} IS NULL OR ${repAvaliacoes.resposta} = '' THEN 1 ELSE 0 END), 0)`,
        positivas: sql<string>`COALESCE(SUM(CASE WHEN ${repAvaliacoes.sentimento} = 'positivo' THEN 1 ELSE 0 END), 0)`,
        mediaGoogle: sql<string>`COALESCE(AVG(CASE WHEN ${repAvaliacoes.plataforma} = 'google' THEN ${repAvaliacoes.nota} END), 0)`,
        totalGoogle: sql<string>`COALESCE(SUM(CASE WHEN ${repAvaliacoes.plataforma} = 'google' THEN 1 ELSE 0 END), 0)`,
        semRespostaGoogle: sql<string>`COALESCE(SUM(CASE WHEN ${repAvaliacoes.plataforma} = 'google' AND (${repAvaliacoes.resposta} IS NULL OR ${repAvaliacoes.resposta} = '') THEN 1 ELSE 0 END), 0)`,
        // NPS: promotores (nota >= 9), detratores (nota <= 6), neutros (7-8)
        promotores: sql<string>`COALESCE(SUM(CASE WHEN ${repAvaliacoes.nota} >= 9 THEN 1 ELSE 0 END), 0)`,
        detratores: sql<string>`COALESCE(SUM(CASE WHEN ${repAvaliacoes.nota} <= 6 THEN 1 ELSE 0 END), 0)`,
      }).from(repAvaliacoes).where(
        unitId ? eq(repAvaliacoes.unitId, unitId) : undefined
      );

      const totalRep = Number(repStats?.total ?? 0);
      const mediaFinal = totalRep > 0 ? parseFloat(repStats?.media ?? "0") : 0;
      const positivasFinal = Number(repStats?.positivas ?? 0);
      const promotores = Number(repStats?.promotores ?? 0);
      const detratores = Number(repStats?.detratores ?? 0);
      // NPS = (promotores - detratores) / total * 100
      const nps = totalRep > 0 ? Math.round(((promotores - detratores) / totalRep) * 100) : 0;

      // ── AUTO INSTAGRAM: comentários e stories respondidos no período ──
      // ig_replied_comments usa timestamp UTC — converter período BRT para UTC adicionando 3h
      // Ex: 2026-04-01 00:00 BRT = 2026-04-01 03:00 UTC; 2026-04-07 23:59 BRT = 2026-04-08 02:59 UTC
      const igUtcStart = new Date(mesStart.getTime() + 3 * 60 * 60 * 1000);
      const igUtcEnd = new Date(mesEnd.getTime() + 3 * 60 * 60 * 1000);
      const igStartStr = igUtcStart.toISOString().replace('T', ' ').slice(0, 19);
      const igEndStr = igUtcEnd.toISOString().replace('T', ' ').slice(0, 19);
      const igUnitWhere = unitId ? `AND unitId = ${unitId}` : `AND unitId IN (SELECT id FROM units WHERE orgId = ${orgId})`;
      // Comentários respondidos: contar de ig_replied_comments (timestamp preciso)
      const igCommentsRaw = await db.execute(sql.raw(
        `SELECT COUNT(*) as comentariosRespondidos
         FROM ig_replied_comments
         WHERE repliedAt >= '${igStartStr}' AND repliedAt <= '${igEndStr}' ${igUnitWhere}`
      ));
      const igCommentsRow = execRow(igCommentsRaw);
      // Stories respondidos: contar de ig_story_reply_log (status=success)
      const igStoriesRaw = await db.execute(sql.raw(
        `SELECT COUNT(*) as storiesRespondidos
         FROM ig_story_reply_log
         WHERE createdAt >= '${igStartStr}' AND createdAt <= '${igEndStr}' AND status = 'success' ${igUnitWhere}`
      ));
      const igStoriesRow = execRow(igStoriesRaw);
      const igTotals = {
        comentariosRespondidos: Number(igCommentsRow.comentariosRespondidos ?? 0),
        storiesRespondidos: Number(igStoriesRow.storiesRespondidos ?? 0),
      };

      return {
        dataVip: {
          faturamentoMes,
          atendimentos,
          ticketMedio,
          trendFaturamento,
          totalClientes,
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
          nps,
          promotores,
          detratores,
          hasData: totalRep > 0,
        },
        autoInstagram: {
          seguidores: 0,
          novosSeguidores: 0,
          comentariosRespondidos: igTotals.comentariosRespondidos,
          storiesRespondidos: igTotals.storiesRespondidos,
          hasData: igTotals.comentariosRespondidos > 0 || igTotals.storiesRespondidos > 0,
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

  // ─── RANKING DE REPUTAÇÃO POR UNIDADE ───────────────────────────────────────────────────────────────────────────────────
  rankingReputacao: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      // Busca nota média, total de avaliações e sem resposta por unidade
      const rows = await db
        .select({
          unitId: repAvaliacoes.unitId,
          media: sql<string>`COALESCE(AVG(${repAvaliacoes.nota}), 0)`,
          total: count(repAvaliacoes.id),
          totalGoogle: sql<string>`COALESCE(SUM(CASE WHEN ${repAvaliacoes.plataforma} = 'google' THEN 1 ELSE 0 END), 0)`,
          mediaGoogle: sql<string>`COALESCE(AVG(CASE WHEN ${repAvaliacoes.plataforma} = 'google' THEN ${repAvaliacoes.nota} END), 0)`,
          semResposta: sql<string>`COALESCE(SUM(CASE WHEN ${repAvaliacoes.resposta} IS NULL OR ${repAvaliacoes.resposta} = '' THEN 1 ELSE 0 END), 0)`,
          positivas: sql<string>`COALESCE(SUM(CASE WHEN ${repAvaliacoes.sentimento} = 'positivo' THEN 1 ELSE 0 END), 0)`,
        })
        .from(repAvaliacoes)
        .innerJoin(units, eq(repAvaliacoes.unitId, units.id))
        .where(eq(units.orgId, input.orgId))
        .groupBy(repAvaliacoes.unitId);

      // Busca nomes das unidades
      const orgUnits = await db.select({ id: units.id, name: units.name })
        .from(units)
        .where(eq(units.orgId, input.orgId));
      const unitMap = new Map(orgUnits.map(u => [u.id, u.name]));

      return rows
        .filter(r => Number(r.total) > 0)
        .map(r => ({
          unitId: r.unitId,
          name: unitMap.get(r.unitId) ?? `Unidade ${r.unitId}`,
          media: parseFloat(r.media),
          total: Number(r.total),
          totalGoogle: Number(r.totalGoogle),
          mediaGoogle: parseFloat(r.mediaGoogle),
          semResposta: Number(r.semResposta),
          positivasPercent: Number(r.total) > 0
            ? Math.round((Number(r.positivas) / Number(r.total)) * 100)
            : 0,
        }))
        .sort((a, b) => b.mediaGoogle - a.mediaGoogle || b.media - a.media);
    }),
});
