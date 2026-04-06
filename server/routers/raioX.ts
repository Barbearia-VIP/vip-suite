/**
 * server/routers/raioX.ts
 * Router tRPC do módulo Raio X Clientes
 * Fonte de dados: banco externo franquia_producao (via SSH tunnel)
 *
 * Estrutura da tabela clientes:
 *   id, nome, telefone, data_criacao, ultima_visita, ultima_visita_unidade,
 *   ultima_visita_colaborador, consumo, status
 *   (NÃO tem coluna visitas — calcular via JOIN com vendas)
 *
 * Definições:
 * - Ativo (≤60d): última visita ≤ 60 dias
 * - Em risco (61-90d): última visita entre 61 e 90 dias
 * - Perdido (>90d): última visita > 90 dias
 * - One-Shot: total de vendas = 1
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { queryExternal } from "../db-external";
import {
  getChurnPorBarbeiro,
  getCadenciaVisitas,
  getDiagnosticoClientes,
  getCohortClientes,
} from "../dataVipQueries";

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

// ─── Helper: converte unitId interno → externalIds ───────────────────────────
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

// ─── Helpers de classificação ────────────────────────────────────────────────
function classificarStatus(dias: number): "ativo" | "em_risco" | "perdido" {
  if (dias <= 60) return "ativo";
  if (dias <= 90) return "em_risco";
  return "perdido";
}

// ─── Subquery de visitas por cliente ─────────────────────────────────────────
const visitasSubquery = `(
  SELECT cliente, COUNT(*) as total_visitas
  FROM vendas WHERE comanda_temp = 0 AND cancelado_motivo IS NULL AND status != 0
  GROUP BY cliente
)`;

// ─── Input base ──────────────────────────────────────────────────────────────
const baseInput = z.object({
  orgId: z.number().optional(),
  unitId: z.number().optional(),
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
});

// ─── Router ──────────────────────────────────────────────────────────────────
export const raioXRouter = router({
  // ── Visão Geral ──────────────────────────────────────────────────────────────
  visaoGeral: protectedProcedure
    .input(baseInput)
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );

      const dataInicio = input.dataInicio || new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
      const dataFim = input.dataFim || new Date().toISOString().split("T")[0];
      const dataInicio12m = new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];
      const dataInicio24m = new Date(Date.now() - 730 * 86400000).toISOString().split("T")[0];

      // Condição de unidade via JOIN com vendas (para filtrar pelo período)
      const unitCondV = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
        : `uu.unidade IN (${extIds.join(",")})`;

      // Subquery: clientes que visitaram no período selecionado
      const clientesPeriodoSubquery = `(
        SELECT DISTINCT v.cliente
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitCondV}
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
          AND v.cliente IS NOT NULL AND v.cliente != 2
          AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
      )`;

      // Subquery: visitas totais de cada cliente NO PERÍODO
      const visitasPeriodoSubquery = `(
        SELECT v.cliente, COUNT(*) as total_visitas
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitCondV}
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
          AND v.cliente IS NOT NULL AND v.cliente != 2
          AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
        GROUP BY v.cliente
      )`;

      const unitCondSimple = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `ultima_visita_unidade = ${extIds[0]}`
        : `ultima_visita_unidade IN (${extIds.join(",")})`;

      const [
        statusRows,
        perfilRows,
        status12mRows,
        oneShotDistRows,
        novosRows,
        novosRecorrentesRows,
        novosMensalRows,
        perdidosRecentesRows,
        ativosNaJanelaRows,
        resgatadosRows,
      ] = await Promise.all([
        // Base P (Corte 24m): clientes com visita nos últimos 24 meses — totalBase, ativos, em_risco, perdidos, one_shots
        queryExternal<{
          total: number; ativos: number; em_risco: number; perdidos: number; one_shots: number;
          one_shot_risco: number; one_shot_perdido: number;
        }>(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN DATEDIFF(NOW(), c.ultima_visita) <= 60 THEN 1 ELSE 0 END) as ativos,
            SUM(CASE WHEN DATEDIFF(NOW(), c.ultima_visita) BETWEEN 61 AND 90 THEN 1 ELSE 0 END) as em_risco,
            SUM(CASE WHEN DATEDIFF(NOW(), c.ultima_visita) > 90 THEN 1 ELSE 0 END) as perdidos,
            SUM(CASE WHEN vpc24.total_visitas = 1 THEN 1 ELSE 0 END) as one_shots,
            SUM(CASE WHEN vpc24.total_visitas = 1 AND DATEDIFF(NOW(), c.ultima_visita) BETWEEN 61 AND 90 THEN 1 ELSE 0 END) as one_shot_risco,
            SUM(CASE WHEN vpc24.total_visitas = 1 AND DATEDIFF(NOW(), c.ultima_visita) > 90 THEN 1 ELSE 0 END) as one_shot_perdido
          FROM clientes c
          JOIN (
            SELECT v.cliente, COUNT(*) as total_visitas
            FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
            WHERE ${unitCondV}
              AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
              AND v.cliente IS NOT NULL AND v.cliente != 2
              AND DATE(v.data_criacao) >= '${dataInicio24m}'
            GROUP BY v.cliente
          ) vpc24 ON vpc24.cliente = c.id
          WHERE c.status = 1 AND c.ultima_visita IS NOT NULL
            AND ${unitCondSimple} AND c.ultima_visita >= '${dataInicio24m}'
        `),
        // Perfil de visitas (Base P · 24m — visitas históricas de cada cliente)
        queryExternal<{ one_shot: number; ocasional: number; regular: number; fiel: number; recorrente: number }>(`
          SELECT 
            SUM(CASE WHEN vpc24.total_visitas = 1 THEN 1 ELSE 0 END) as one_shot,
            SUM(CASE WHEN vpc24.total_visitas BETWEEN 2 AND 3 THEN 1 ELSE 0 END) as ocasional,
            SUM(CASE WHEN vpc24.total_visitas BETWEEN 4 AND 6 THEN 1 ELSE 0 END) as regular,
            SUM(CASE WHEN vpc24.total_visitas BETWEEN 7 AND 12 THEN 1 ELSE 0 END) as fiel,
            SUM(CASE WHEN vpc24.total_visitas > 12 THEN 1 ELSE 0 END) as recorrente
          FROM clientes c
          JOIN (
            SELECT v.cliente, COUNT(*) as total_visitas
            FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
            WHERE ${unitCondV}
              AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
              AND v.cliente IS NOT NULL AND v.cliente != 2
              AND DATE(v.data_criacao) >= '${dataInicio24m}'
            GROUP BY v.cliente
          ) vpc24 ON vpc24.cliente = c.id
          WHERE c.status = 1
        `),
        // Status 12 meses (clientes que visitaram nos últimos 12m)
        queryExternal<{ perdido: number; em_risco: number; saudavel: number }>(`
          SELECT 
            SUM(CASE WHEN DATEDIFF(NOW(), c.ultima_visita) > 90 THEN 1 ELSE 0 END) as perdido,
            SUM(CASE WHEN DATEDIFF(NOW(), c.ultima_visita) BETWEEN 61 AND 90 THEN 1 ELSE 0 END) as em_risco,
            SUM(CASE WHEN DATEDIFF(NOW(), c.ultima_visita) <= 60 THEN 1 ELSE 0 END) as saudavel
          FROM clientes c
          WHERE ${unitCondSimple} AND c.status = 1 AND c.ultima_visita IS NOT NULL
            AND c.ultima_visita >= ?
        `, [dataInicio12m]),
        // One-shot no período (apenas 1 visita no período)
        queryExternal<{ total: number; aguardando: number; em_risco: number; perdido: number }>(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN DATEDIFF(NOW(), c.ultima_visita) <= 30 THEN 1 ELSE 0 END) as aguardando,
            SUM(CASE WHEN DATEDIFF(NOW(), c.ultima_visita) BETWEEN 31 AND 60 THEN 1 ELSE 0 END) as em_risco,
            SUM(CASE WHEN DATEDIFF(NOW(), c.ultima_visita) > 60 THEN 1 ELSE 0 END) as perdido
          FROM clientes c
          JOIN ${visitasPeriodoSubquery} vpc ON vpc.cliente = c.id
          WHERE c.status = 1 AND c.ultima_visita IS NOT NULL AND vpc.total_visitas = 1
        `),
        // Novos no período
        queryExternal<{ total: number }>(`
          SELECT COUNT(*) as total FROM clientes c
          WHERE ${unitCondSimple} AND c.status = 1
            AND DATE(c.data_criacao) >= ? AND DATE(c.data_criacao) <= ?
        `, [dataInicio, dataFim]),
        // Novos que voltaram (recorrentes)
        queryExternal<{ total: number }>(`
          SELECT COUNT(*) as total FROM clientes c
          WHERE ${unitCondSimple} AND c.status = 1
            AND DATE(c.data_criacao) >= ? AND DATE(c.data_criacao) <= ?
            AND (SELECT COUNT(*) FROM vendas v WHERE v.cliente = c.id AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0) > 1
        `, [dataInicio, dataFim]),
        // Novos por mês (período selecionado)
        queryExternal<{ mes: string; total: number }>(`
          SELECT DATE_FORMAT(data_criacao, '%Y-%m') as mes, COUNT(*) as total
          FROM clientes
          WHERE ${unitCondSimple} AND status = 1
            AND data_criacao >= ?
          GROUP BY mes ORDER BY mes
        `, [dataInicio12m]),
        // Perdidos recentes que visitaram no período (91-180 dias sem voltar)
        queryExternal<{
          id: number; nome: string; telefone: string;
          ultima_visita: Date; consumo: number; dias: number; total_visitas: number;
        }>(`
          SELECT c.id, c.nome, c.telefone, c.ultima_visita, c.consumo,
                 DATEDIFF(NOW(), c.ultima_visita) as dias,
                 COALESCE(vpc.total_visitas, 0) as total_visitas
          FROM clientes c
          JOIN ${visitasPeriodoSubquery} vpc ON vpc.cliente = c.id
          WHERE c.status = 1 AND c.ultima_visita IS NOT NULL
            AND DATEDIFF(NOW(), c.ultima_visita) BETWEEN 91 AND 180
          ORDER BY dias ASC LIMIT 50
        `),
        // Ativos na janela do período
        queryExternal<{ total: number }>(`
          SELECT COUNT(DISTINCT cliente) as total
          FROM ${clientesPeriodoSubquery} cp
        `),
        // Resgatados (perdidos que voltaram no período)
        queryExternal<{ total: number }>(`
          SELECT COUNT(DISTINCT c.id) as total
          FROM clientes c
          JOIN ${clientesPeriodoSubquery} cp ON cp.cliente = c.id
          WHERE c.status = 1
            AND (SELECT MIN(v2.data_criacao) FROM vendas v2
                 WHERE v2.cliente = c.id AND v2.comanda_temp = 0 AND v2.cancelado_motivo IS NULL AND v2.status != 0) < ?
            AND DATEDIFF(?, (SELECT MAX(v3.data_criacao) FROM vendas v3
                 WHERE v3.cliente = c.id AND v3.comanda_temp = 0 AND v3.cancelado_motivo IS NULL AND v3.status != 0
                 AND v3.data_criacao < ?)) > 90
        `, [dataInicio, dataInicio, dataInicio]),
      ]);

      const sr = statusRows[0] || { total: 0, ativos: 0, em_risco: 0, perdidos: 0, one_shots: 0, one_shot_risco: 0, one_shot_perdido: 0 };
      const totalBase = Number(sr.total);
      const ativos = Number(sr.ativos);
      const emRisco = Number(sr.em_risco);
      const perdidos = Number(sr.perdidos);
      const oneShots = Number(sr.one_shots);
      const oneShotRisco = Number(sr.one_shot_risco);
      const oneShotPerdido = Number(sr.one_shot_perdido);
      const novos = Number(novosRows[0]?.total ?? 0);
      const ativosNaJanela = Number(ativosNaJanelaRows[0]?.total ?? 0);
      const resgatados = Number(resgatadosRows[0]?.total ?? 0);
      const oneShotUrgente = oneShotRisco;

      const pr = perfilRows[0] || { one_shot: 0, ocasional: 0, regular: 0, fiel: 0, recorrente: 0 };
      const s12 = status12mRows[0] || { perdido: 0, em_risco: 0, saudavel: 0 };
      const osd = oneShotDistRows[0] || { total: 0, aguardando: 0, em_risco: 0, perdido: 0 };
      const novosRecorrentes = Number(novosRecorrentesRows[0]?.total ?? 0);
      const novosOneShotTotal = novos - novosRecorrentes;
      const saudeAquisicao = novos > 0 ? Math.round((novosRecorrentes / novos) * 100) : 0;

      return {
        sinais: {
          totalBase,
          ativos,
          perdidos,
          emRisco,
          novos,
          oneShots,
          oneShotUrgente,
          resgatados,
          pctAtivos: totalBase > 0 ? Math.round((ativos / totalBase) * 100) : 0,
          pctPerdidos: totalBase > 0 ? Math.round((perdidos / totalBase) * 100) : 0,
          pctEmRisco: totalBase > 0 ? Math.round((emRisco / totalBase) * 100) : 0,
          pctNovos: ativosNaJanela > 0 ? Math.round((novos / ativosNaJanela) * 100) : 0,
          pctOneShotUrgente: oneShots > 0 ? Math.round((oneShotUrgente / oneShots) * 100) : 0,
          pctResgatados: totalBase > 0 ? Math.round((resgatados / totalBase) * 100) : 0,
        },
        atividade: {
          clientesUnicos: ativosNaJanela,
          novosClientes: novos,
          ativosNaJanela,
          resgatados,
        },
        saude: {
          emRisco,
          perdidos,
          oneShotRisco,
          oneShotPerdido,
        },
        distribuicoes: {
          porPerfil: {
            one_shot: Number(pr.one_shot),
            ocasional: Number(pr.ocasional),
            regular: Number(pr.regular),
            fiel: Number(pr.fiel),
            recorrente: Number(pr.recorrente),
          },
          status12m: {
            perdido: Number(s12.perdido),
            emRisco: Number(s12.em_risco),
            saudavel: Number(s12.saudavel),
          },
          oneShot: {
            total: Number(osd.total),
            aguardando: Number(osd.aguardando),
            emRisco: Number(osd.em_risco),
            perdido: Number(osd.perdido),
          },
        },
        novosClientes: {
          total: novos,
          recorrentes: novosRecorrentes,
          oneShotTotal: novosOneShotTotal,
          saudeAquisicao,
          mensal: novosMensalRows.map(r => ({ mes: r.mes, total: Number(r.total) })),
        },
        perdidosRecentes: perdidosRecentesRows.map(pr => ({
          clienteId: String(pr.id),
          clienteNome: pr.nome,
          telefone: pr.telefone,
          ultimaVenda: pr.ultima_visita,
          totalVisitas: Number(pr.total_visitas),
          totalGasto: Number(pr.consumo),
          dias: Number(pr.dias),
        })),
        periodo: { dataInicio, dataFim },
      };
    }),

  // ── One-Shot ─────────────────────────────────────────────────────────────────
  oneShot: protectedProcedure
    .input(baseInput.extend({
      status: z.enum(["todos", "aguardando", "em_risco", "perdido"]).optional(),
      search: z.string().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );

      const unitCond = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `c.ultima_visita_unidade = ${extIds[0]}`
        : `c.ultima_visita_unidade IN (${extIds.join(",")})`;

      const rows = await queryExternal<{
        id: number; nome: string; telefone: string;
        data_criacao: Date; ultima_visita: Date; total_gasto: number;
      }>(`
        SELECT c.id, c.nome, c.telefone, c.data_criacao, c.ultima_visita,
          COALESCE((SELECT SUM(v.valor_total) FROM vendas v
               WHERE v.cliente = c.id AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0), 0) as total_gasto
        FROM clientes c
        WHERE ${unitCond} AND c.status = 1 AND c.ultima_visita IS NOT NULL
          AND (SELECT COUNT(*) FROM vendas v
               WHERE v.cliente = c.id AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0) = 1
        ORDER BY c.ultima_visita DESC
        LIMIT 2000
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
          totalVisitas: 1,
          totalGasto: Number(r.total_gasto),
          dias,
          status: classificarStatus(dias),
        };
      });

      const aguardando = clientes.filter(c => c.dias <= 30).length;
      const emRisco = clientes.filter(c => c.status === "em_risco").length;
      const perdido = clientes.filter(c => c.status === "perdido").length;
      // Filtrar por status e search
      let filtered = clientes;
      if (input.status && input.status !== "todos") {
        if (input.status === "aguardando") filtered = filtered.filter(c => c.dias <= 30);
        else if (input.status === "em_risco") filtered = filtered.filter(c => c.status === "em_risco");
        else if (input.status === "perdido") filtered = filtered.filter(c => c.status === "perdido");
      }
      if (input.search) {
        const s = input.search.toLowerCase();
        filtered = filtered.filter(c => c.clienteNome?.toLowerCase().includes(s) || c.telefone?.includes(s));
      }
      return {
        resumo: {
          total: clientes.length,
          aguardando,
          emRisco,
          perdido,
        },
        clientes: filtered,
      };
    }),

  // ── Cadência de visitas ───────────────────────────────────────────────────────
  cadencia: protectedProcedure
    .input(baseInput)
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );

      const dataInicio = input.dataInicio || new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
      const dataFim = input.dataFim || new Date().toISOString().split("T")[0];

      const unitCondV = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
        : `uu.unidade IN (${extIds.join(",")})`;

      // Faixas de visitas no período
      const cadenciaRows = await queryExternal<{ faixa: string; total: number }>(`
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
          WHERE ${unitCondV}
            AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
            AND v.cliente IS NOT NULL AND v.cliente != 2
            AND DATE(v.data_criacao) >= ? AND DATE(v.data_criacao) <= ?
          GROUP BY v.cliente
        ) sub
        GROUP BY faixa
        ORDER BY MIN(visitas)
      `, [dataInicio, dataFim]);

      const totalCadencia = cadenciaRows.reduce((s, r) => s + Number(r.total), 0);

      // Distribuição por dias de ausência (clientes do período)
      const distribuicao = { mto_frequente: 0, regular: 0, espacado: 0, em_risco: 0, perdido: 0 };
      const distRows = await queryExternal<{ faixa: string; total: number }>(`
        SELECT 
          CASE 
            WHEN DATEDIFF(NOW(), c.ultima_visita) <= 20 THEN 'mto_frequente'
            WHEN DATEDIFF(NOW(), c.ultima_visita) BETWEEN 21 AND 45 THEN 'regular'
            WHEN DATEDIFF(NOW(), c.ultima_visita) BETWEEN 46 AND 60 THEN 'espacado'
            WHEN DATEDIFF(NOW(), c.ultima_visita) BETWEEN 61 AND 90 THEN 'em_risco'
            ELSE 'perdido'
          END as faixa,
          COUNT(DISTINCT c.id) as total
        FROM clientes c
        JOIN (
          SELECT DISTINCT v.cliente
          FROM vendas v
          JOIN usuarios uu ON v.usuario = uu.id
          WHERE ${unitCondV}
            AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
            AND v.cliente IS NOT NULL AND v.cliente != 2
            AND DATE(v.data_criacao) >= ? AND DATE(v.data_criacao) <= ?
        ) cp ON cp.cliente = c.id
        WHERE c.status = 1 AND c.ultima_visita IS NOT NULL
        GROUP BY faixa
      `, [dataInicio, dataFim]);
      for (const r of distRows) {
        if (r.faixa in distribuicao) distribuicao[r.faixa as keyof typeof distribuicao] = Number(r.total);
      }

      // Top clientes por frequência no período
      const topClientesRows = await queryExternal<{
        id: number; nome: string; telefone: string;
        total_visitas: number; dias_medios: number;
      }>(`
        SELECT c.id, c.nome, c.telefone,
               vc.cnt as total_visitas,
               COALESCE(ROUND(DATEDIFF(MAX(v2.data_criacao), MIN(v2.data_criacao)) / NULLIF(vc.cnt - 1, 0)), 0) as dias_medios
        FROM clientes c
        JOIN (
          SELECT v.cliente, COUNT(*) as cnt
          FROM vendas v
          JOIN usuarios uu ON v.usuario = uu.id
          WHERE ${unitCondV}
            AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
            AND v.cliente IS NOT NULL AND v.cliente != 2
            AND DATE(v.data_criacao) >= ? AND DATE(v.data_criacao) <= ?
          GROUP BY v.cliente HAVING cnt >= 2
        ) vc ON vc.cliente = c.id
        JOIN vendas v2 ON v2.cliente = c.id
          AND v2.comanda_temp = 0 AND v2.cancelado_motivo IS NULL AND v2.status != 0
          AND DATE(v2.data_criacao) >= ? AND DATE(v2.data_criacao) <= ?
        WHERE c.status = 1
        GROUP BY c.id, c.nome, c.telefone, vc.cnt
        ORDER BY vc.cnt DESC LIMIT 15
      `, [dataInicio, dataFim, dataInicio, dataFim]);

      return {
        total: totalCadencia,
        mediaGeral: 45,
        distribuicao,
        faixas: cadenciaRows.map(r => ({
          faixa: r.faixa,
          total: Number(r.total),
          percentual: totalCadencia > 0 ? Math.round((Number(r.total) / totalCadencia) * 1000) / 10 : 0,
        })),
        clientes: topClientesRows.map(r => ({
          clienteId: String(r.id),
          clienteNome: r.nome,
          telefone: r.telefone,
          totalVisitas: Number(r.total_visitas),
          diasMedios: Number(r.dias_medios),
        })),
      };
    }),

  // ── Churn (visão geral) ───────────────────────────────────────────────────────
  churn: protectedProcedure
    .input(baseInput.extend({
      periodo: z.enum(["30d", "60d", "90d", "6m", "12m"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );

      const diasPeriodo = input.periodo === "30d" ? 30
        : input.periodo === "60d" ? 60
        : input.periodo === "6m" ? 180
        : input.periodo === "12m" ? 365
        : 90;

      const dataInicio = input.dataInicio || new Date(Date.now() - diasPeriodo * 86400000).toISOString().split("T")[0];
      const dataFim = input.dataFim || new Date().toISOString().split("T")[0];

      const unitCondV = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
        : `uu.unidade IN (${extIds.join(",")})`;

      // Subquery: clientes que visitaram no período
      const clientesPeriodo = `(
        SELECT DISTINCT v.cliente
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitCondV}
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
          AND v.cliente IS NOT NULL AND v.cliente != 2
          AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
      )`;

      const [churnResumoRows, perdidosRecentesRows, churnMensalRows] = await Promise.all([
        // Resumo de status dos clientes do período
        queryExternal<{
          total: number; ativos: number; em_risco: number; perdidos: number;
          one_shots: number; ticket_medio: number;
        }>(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN DATEDIFF(NOW(), c.ultima_visita) <= 60 THEN 1 ELSE 0 END) as ativos,
            SUM(CASE WHEN DATEDIFF(NOW(), c.ultima_visita) BETWEEN 61 AND 90 THEN 1 ELSE 0 END) as em_risco,
            SUM(CASE WHEN DATEDIFF(NOW(), c.ultima_visita) > 90 THEN 1 ELSE 0 END) as perdidos,
            0 as one_shots,
            AVG(c.consumo) as ticket_medio
          FROM clientes c
          JOIN ${clientesPeriodo} cp ON cp.cliente = c.id
          WHERE c.status = 1 AND c.ultima_visita IS NOT NULL
        `),
        // Perdidos recentes (visitaram no período, agora sem voltar 91-180d)
        queryExternal<{
          id: number; nome: string; telefone: string;
          ultima_visita: Date; consumo: number; total_visitas: number;
        }>(`
          SELECT c.id, c.nome, c.telefone, c.ultima_visita, c.consumo,
                 COALESCE(vc.total_visitas, 0) as total_visitas
          FROM clientes c
          JOIN ${clientesPeriodo} cp ON cp.cliente = c.id
          LEFT JOIN ${visitasSubquery} vc ON vc.cliente = c.id
          WHERE c.status = 1 AND c.ultima_visita IS NOT NULL
            AND DATEDIFF(NOW(), c.ultima_visita) BETWEEN 91 AND 180
          ORDER BY c.ultima_visita DESC LIMIT 100
        `),
        // Churn mensal (últimos 12 meses, baseado em última visita)
        queryExternal<{ mes: string; total: number }>(`
          SELECT DATE_FORMAT(c.ultima_visita, '%Y-%m') as mes, COUNT(*) as total
          FROM clientes c
          JOIN ${clientesPeriodo} cp ON cp.cliente = c.id
          WHERE c.status = 1 AND c.ultima_visita IS NOT NULL
            AND c.ultima_visita >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
          GROUP BY mes ORDER BY mes
        `),
      ]);

      const cr = churnResumoRows[0] || { total: 0, ativos: 0, em_risco: 0, perdidos: 0, one_shots: 0, media_visitas: 0, ticket_medio: 0 };
      const total = Number(cr.total);

      return {
        resumo: {
          total,
          ativos: Number(cr.ativos),
          emRisco: Number(cr.em_risco),
          perdidos: Number(cr.perdidos),
          oneShots: Number(cr.one_shots),
          taxaRetencao: total > 0 ? Math.round((Number(cr.ativos) / total) * 100) : 0,
          taxaChurn: total > 0 ? Math.round((Number(cr.perdidos) / total) * 100) : 0,
          mediaVisitas: 0,
          ticketMedio: Math.round(Number(cr.ticket_medio) * 100) / 100,
          receitaPerdida: Math.round(Number(cr.perdidos) * Number(cr.ticket_medio) * 100) / 100,
        },
        perdidosRecentes: perdidosRecentesRows.map(r => ({
          clienteId: String(r.id),
          clienteNome: r.nome,
          telefone: r.telefone,
          ultimaVenda: r.ultima_visita,
          totalVisitas: Number(r.total_visitas),
          totalGasto: Number(r.consumo),
          dias: r.ultima_visita ? Math.floor((Date.now() - new Date(r.ultima_visita).getTime()) / 86400000) : 999,
        })),
         churnMensal: churnMensalRows.map(r => ({ mes: r.mes, total: Number(r.total) })),
        periodo: { dataInicio, dataFim, diasPeriodo },
      };
    }),
  // ── Churn por barbeiro ────────────────────────────────────────────────────────
  churnPorBarbeiro: protectedProcedure
    .input(baseInput.extend({
      periodo: z.enum(["30d", "60d", "90d", "6m", "12m"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );

      const diasPeriodo = input.periodo === "30d" ? 30
        : input.periodo === "60d" ? 60
        : input.periodo === "6m" ? 180
        : input.periodo === "12m" ? 365
        : 90;

      const dataInicio = input.dataInicio || new Date(Date.now() - diasPeriodo * 86400000).toISOString().split("T")[0];
      const dataFim = input.dataFim || new Date().toISOString().split("T")[0];

      const rows = await getChurnPorBarbeiro(extIds, dataInicio, dataFim);
      const barbeiros = rows.map(r => ({
        colaboradorId: String(r.colaborador_id),
        colaboradorNome: r.colaborador_nome,
        totalClientes: Number(r.total_clientes),
        ativos: Number(r.ativos),
        emRisco: Number(r.em_risco),
        perdidos: Number(r.perdidos),
        oneShots: Number(r.one_shots),
        taxaRetencao: Number(r.total_clientes) > 0
          ? Math.round((Number(r.ativos) / Number(r.total_clientes)) * 100)
          : 0,
        taxaChurn: Number(r.total_clientes) > 0
          ? Math.round((Number(r.perdidos) / Number(r.total_clientes)) * 100)
          : 0,
        mediaVisitas: Math.round(Number(r.media_visitas) * 10) / 10,
        ticketMedio: Math.round(Number(r.media_gasto) * 100) / 100,
      }));
      return { barbeiros };
    }),

  // ── Cohort ───────────────────────────────────────────────────────────────────
  cohort: protectedProcedure
    .input(baseInput)
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );
      const rows = await getCohortClientes(extIds);
      return {
        cohorts: rows.map(r => ({
          cohort: r.cohort_mes,
          totalEntrada: Number(r.total_entrada),
          voltaram: Number(r.voltaram),
          taxaRetencao: Number(r.taxa_retencao),
          fidelizados: 0,
          taxaFidelizacao: 0,
          mediaVisitas: 0,
          mediaGasto: 0,
        })),
      };
    }),

  // ── Barbeiros ────────────────────────────────────────────────────────────────
  barbeiros: protectedProcedure
    .input(baseInput)
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );

      const unitCond = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
        : `uu.unidade IN (${extIds.join(",")})`;

      const dataInicio = input.dataInicio || new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
      const dataFim = input.dataFim || new Date().toISOString().split("T")[0];

      const rows = await queryExternal<{
        colaborador_id: number;
        colaborador_nome: string;
        totalAtendimentos: number;
        clientesUnicos: number;
        faturamento: number;
        ticketMedio: number;
      }>(`
        SELECT 
          uu.id as colaborador_id,
          uu.nome as colaborador_nome,
          COUNT(v.id) as totalAtendimentos,
          COUNT(DISTINCT v.cliente) as clientesUnicos,
          SUM(v.valor_total) as faturamento,
          AVG(v.valor_total) as ticketMedio
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitCond}
          AND uu.visivel_agenda != 'nenhuma'
          AND v.data_criacao >= ?
          AND v.data_criacao <= ?
          AND v.comanda_temp = 0
          AND v.cancelado_motivo IS NULL
          AND v.status != 0
          AND v.cliente IS NOT NULL
          AND v.cliente != 2
        GROUP BY uu.id, uu.nome
        ORDER BY totalAtendimentos DESC
      `, [dataInicio, dataFim + " 23:59:59"]);

      return {
        barbeiros: rows.map(r => ({
          colaboradorId: String(r.colaborador_id),
          colaboradorNome: r.colaborador_nome,
          totalAtendimentos: Number(r.totalAtendimentos),
          clientesUnicos: Number(r.clientesUnicos),
          faturamento: Number(r.faturamento || 0),
          ticketMedio: Math.round(Number(r.ticketMedio || 0)),
          novosClientes: 0,
        })),
        periodo: { dataInicio, dataFim },
      };
    }),

  // ── Diagnóstico ──────────────────────────────────────────────────────────────
  diagnostico: protectedProcedure
    .input(baseInput)
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );

      const dataInicio = input.dataInicio || new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
      const dataFim = input.dataFim || new Date().toISOString().split("T")[0];

      const unitCondV = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
        : `uu.unidade IN (${extIds.join(",")})`;

      // Subquery: clientes que visitaram no período
      const clientesPeriodo = `(
        SELECT DISTINCT v.cliente
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitCondV}
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
          AND v.cliente IS NOT NULL AND v.cliente != 2
          AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
      )`;

      const [totalRows, qualidadeRows, visitasDistRows, faixasDiasRows] = await Promise.all([
        queryExternal<{ total: number }>(`
          SELECT COUNT(DISTINCT c.id) as total
          FROM clientes c
          JOIN ${clientesPeriodo} cp ON cp.cliente = c.id
          WHERE c.status = 1
        `),
        queryExternal<{ semTelefone: number; semNome: number }>(`
          SELECT 
            SUM(CASE WHEN c.telefone IS NULL OR c.telefone = '' THEN 1 ELSE 0 END) as semTelefone,
            SUM(CASE WHEN c.nome IS NULL OR c.nome = '' OR c.nome = 'Sem Cadastro' THEN 1 ELSE 0 END) as semNome
          FROM clientes c
          JOIN ${clientesPeriodo} cp ON cp.cliente = c.id
          WHERE c.status = 1
        `),
        queryExternal<{ total_visitas: number; clientes: number }>(`
          SELECT vpc.total_visitas, COUNT(*) as clientes
          FROM clientes c
          JOIN (
            SELECT v.cliente, COUNT(*) as total_visitas
            FROM vendas v
            JOIN usuarios uu ON v.usuario = uu.id
            WHERE ${unitCondV}
              AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
              AND v.cliente IS NOT NULL AND v.cliente != 2
              AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
            GROUP BY v.cliente
          ) vpc ON vpc.cliente = c.id
          WHERE c.status = 1
          GROUP BY vpc.total_visitas ORDER BY vpc.total_visitas LIMIT 20
        `),
        // Distribuição por dias de ausência (clientes do período)
        queryExternal<{ faixa_dias: string; total: number; percentual: number }>(`
          SELECT 
            CASE 
              WHEN DATEDIFF(NOW(), c.ultima_visita) <= 30 THEN '0-30 dias'
              WHEN DATEDIFF(NOW(), c.ultima_visita) BETWEEN 31 AND 60 THEN '31-60 dias'
              WHEN DATEDIFF(NOW(), c.ultima_visita) BETWEEN 61 AND 90 THEN '61-90 dias'
              WHEN DATEDIFF(NOW(), c.ultima_visita) BETWEEN 91 AND 120 THEN '91-120 dias'
              WHEN DATEDIFF(NOW(), c.ultima_visita) BETWEEN 121 AND 180 THEN '121-180 dias'
              ELSE '180+ dias'
            END as faixa_dias,
            COUNT(*) as total,
            ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) as percentual
          FROM clientes c
          JOIN ${clientesPeriodo} cp ON cp.cliente = c.id
          WHERE c.status = 1 AND c.ultima_visita IS NOT NULL
          GROUP BY faixa_dias
          ORDER BY MIN(DATEDIFF(NOW(), c.ultima_visita))
        `),
      ]);

      const total = Number(totalRows[0]?.total ?? 0);
      const semTelefone = Number(qualidadeRows[0]?.semTelefone ?? 0);
      const semNome = Number(qualidadeRows[0]?.semNome ?? 0);
      const scoreQualidade = total > 0
        ? Math.round(100 - ((semTelefone + semNome) / (total * 2)) * 100)
        : 0;

      return {
        total,
        qualidade: {
          score: scoreQualidade,
          semTelefone,
          semNome,
          semCadastro: semNome,
          pctSemTelefone: total > 0 ? Math.round((semTelefone / total) * 100) : 0,
          pctSemNome: total > 0 ? Math.round((semNome / total) * 100) : 0,
          pctSemCadastro: total > 0 ? Math.round((semNome / total) * 100) : 0,
        },
        visitasDistribuicao: visitasDistRows.map(r => ({
          visitas: Number(r.total_visitas),
          clientes: Number(r.clientes),
        })),
        faixasDias: faixasDiasRows.map(r => ({
          faixa: r.faixa_dias,
          total: Number(r.total),
          percentual: Number(r.percentual),
        })),
        alertas: [
          ...(semTelefone > total * 0.3 ? [`${semTelefone} clientes sem telefone (${Math.round((semTelefone/total)*100)}%)`] : []),
          ...(semNome > total * 0.1 ? [`${semNome} clientes sem nome cadastrado`] : []),
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
      const { extIds } = await resolveExternalIds(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );

      const dataInicio = input.dataInicio || new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
      const dataFim = input.dataFim || new Date().toISOString().split("T")[0];

      const unitCondV = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
        : `uu.unidade IN (${extIds.join(",")})`;

      const tipo = input.tipo || "todos";
      let extraCond = "";
      if (tipo === "one_shot_risco") {
        extraCond = " AND vpc.total_visitas = 1 AND DATEDIFF(NOW(), c.ultima_visita) BETWEEN 31 AND 90";
      } else if (tipo === "perdidos_recentes") {
        extraCond = " AND DATEDIFF(NOW(), c.ultima_visita) BETWEEN 91 AND 180";
      } else if (tipo === "em_risco") {
        extraCond = " AND DATEDIFF(NOW(), c.ultima_visita) BETWEEN 61 AND 90";
      } else if (tipo === "sem_telefone") {
        extraCond = " AND (c.telefone IS NULL OR c.telefone = '')";
      } else {
        extraCond = " AND ((vpc.total_visitas = 1 AND DATEDIFF(NOW(), c.ultima_visita) BETWEEN 31 AND 90) OR DATEDIFF(NOW(), c.ultima_visita) BETWEEN 61 AND 180)";
      }

      const rows = await queryExternal<{
        id: number; nome: string; telefone: string;
        ultima_visita: Date; consumo: number; dias: number; total_visitas: number;
      }>(`
        SELECT c.id, c.nome, c.telefone, c.ultima_visita, c.consumo,
               DATEDIFF(NOW(), c.ultima_visita) as dias,
               COALESCE(vpc.total_visitas, 0) as total_visitas
        FROM clientes c
        JOIN (
          SELECT v.cliente, COUNT(*) as total_visitas
          FROM vendas v
          JOIN usuarios uu ON v.usuario = uu.id
          WHERE ${unitCondV}
            AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
            AND v.cliente IS NOT NULL AND v.cliente != 2
            AND DATE(v.data_criacao) >= ? AND DATE(v.data_criacao) <= ?
          GROUP BY v.cliente
        ) vpc ON vpc.cliente = c.id
        WHERE c.status = 1 AND c.ultima_visita IS NOT NULL${extraCond}
        ORDER BY dias ASC
        LIMIT 500
      `, [dataInicio, dataFim]);

      const clientes = rows.map(r => {
        const dias = Number(r.dias || 0);
        const totalVisitas = Number(r.total_visitas || 0);
        let prioridade: "alta" | "media" | "baixa" = "baixa";
        let tipoAcao = "reativacao";
        if (totalVisitas === 1 && dias <= 60) { prioridade = "alta"; tipoAcao = "one_shot"; }
        else if (dias <= 90) { prioridade = "alta"; tipoAcao = "risco"; }
        else if (dias <= 120) { prioridade = "media"; tipoAcao = "perdido_recente"; }
        else { prioridade = "baixa"; tipoAcao = "perdido"; }
        return {
          clienteId: String(r.id),
          clienteNome: r.nome,
          telefone: r.telefone,
          ultimaVenda: r.ultima_visita,
          totalVisitas,
          totalGasto: Number(r.consumo || 0),
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
