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
      // Janelas de 12m e 24m calculadas a partir do dataFim (alinhado com o sistema de referencia)
      const dataFimDate = new Date(dataFim + "T00:00:00Z");
      const dataInicio12m = new Date(dataFimDate.getTime() - 365 * 86400000).toISOString().split("T")[0];
      const dataInicio24m = new Date(dataFimDate.getTime() - 730 * 86400000).toISOString().split("T")[0];

      const unitCondV = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
        : `uu.unidade IN (${extIds.join(",")})`;
      const unitCondSimple = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `ultima_visita_unidade = ${extIds[0]}`
        : `ultima_visita_unidade IN (${extIds.join(",")})`;

      // Subquery: ultima venda por cliente na unidade (usa dataFim como REF, igual ao sistema de referencia)
      // Isso alinha o universo com o sistema de referencia que usa MAX(vendas.data_criacao) por unidade
      const ultimaVendaSubquery = `(
        SELECT v.cliente, MAX(DATE(v.data_criacao)) as ultima_venda
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitCondV}
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
          AND v.cliente IS NOT NULL AND v.cliente != 2
        GROUP BY v.cliente
      )`;

      // Base S (12m rolling): clientes com ultima venda nos ultimos 12 meses antes de dataFim
      // Universo para: Sinais, Saude da Base, Por Perfil, Por Cadencia, Status 12m, One-Shot
      const baseS12mSubquery = `(
        SELECT uv.cliente, uv.ultima_venda
        FROM ${ultimaVendaSubquery} uv
        WHERE uv.ultima_venda >= '${dataInicio12m}' AND uv.ultima_venda <= '${dataFim}'
      )`;

      // Base P (24m rolling from TODAY): clientes com visita nos últimos 24 meses
      // Universo para: Cadência Individual (com >=3 visitas históricas)
      const baseP24mSubquery = `(
        SELECT DISTINCT v.cliente
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitCondV}
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
          AND v.cliente IS NOT NULL AND v.cliente != 2
          AND DATE(v.data_criacao) >= '${dataInicio24m}'
      )`;

      // Visitas históricas por cliente (total ever, para classificação de perfil)
      const visitasHistoricasSubquery = `(
        SELECT v.cliente, COUNT(*) as total_visitas
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitCondV}
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
          AND v.cliente IS NOT NULL AND v.cliente != 2
        GROUP BY v.cliente
      )`;

      // Clientes do período selecionado (para: clientes únicos, novos, resgatados)
      const clientesPeriodoSubquery = `(
        SELECT DISTINCT v.cliente
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitCondV}
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
          AND v.cliente IS NOT NULL AND v.cliente != 2
          AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
      )`;

      const [
        // Sinais + Saúde da Base (Base S 12m)
        sinaisRows,
        // Por Perfil: Base S 12m classificada por visitas históricas
        porPerfilRows,
        // Por Cadência: Base S 12m com >=3 visitas, por dias sem visitar
        porCadenciaRows,
        // Status 12m: Base S 12m por faixas de dias
        status12mRows,
        // One-Shot: Base S 12m com 1 visita histórica
        oneShotRows,
        // Clientes únicos no período selecionado
        clientesUnicosRows,
        // Novos no período (data_criacao no período)
        novosRows,
        // Resgatados no período
        resgatadosRows,
        // Cadência Individual: Base P 24m com >=3 visitas, por ritmo
        cadenciaIndividualRows,
        // Movimento mensal: atendidos por mês no período
        movimentoMensalRows,
        // Entradas mensais: novos por mês no período
        entradasMensaisRows,
        // Risco mensal
        riscoMensalRows,
        // Saúde por barbeiro
        saudeBarbeirosRows,
      ] = await Promise.all([
        // ── Sinais + Saúde da Base (Base S 12m rolling) ────────────────────────
        queryExternal<{
          total_base_s: number;
          ativos: number;
          em_risco: number;
          perdidos: number;
          one_shot_urgente: number;
          one_shot_risco: number;
          one_shot_perdido: number;
        }>(`
          -- Saúde da Base 12m:
          -- Ativos: ≤60d desde última visita
          -- Em risco: 61-90d (excluindo one-shots — tratados separadamente)
          -- Perdidos: >90d (excluindo one-shots — tratados separadamente)
          -- One-shot risco: 1 visita histórica + 46-90d sem retornar
          -- One-shot perdido: 1 visita histórica + >90d sem retornar
          SELECT
            COUNT(DISTINCT bs.cliente) as total_base_s,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) <= 60 THEN bs.cliente END) as ativos,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) BETWEEN 61 AND 90 AND COALESCE(vh.total_visitas, 0) > 1 THEN bs.cliente END) as em_risco,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) > 90 AND COALESCE(vh.total_visitas, 0) > 1 THEN bs.cliente END) as perdidos,
            COUNT(DISTINCT CASE WHEN vh.total_visitas = 1 AND DATEDIFF('${dataFim}', bs.ultima_venda) >= 46 THEN bs.cliente END) as one_shot_urgente,
            COUNT(DISTINCT CASE WHEN vh.total_visitas = 1 AND DATEDIFF('${dataFim}', bs.ultima_venda) BETWEEN 46 AND 90 THEN bs.cliente END) as one_shot_risco,
            COUNT(DISTINCT CASE WHEN vh.total_visitas = 1 AND DATEDIFF('${dataFim}', bs.ultima_venda) > 90 THEN bs.cliente END) as one_shot_perdido
          FROM ${baseS12mSubquery} bs
          JOIN clientes c ON c.id = bs.cliente
          LEFT JOIN ${visitasHistoricasSubquery} vh ON vh.cliente = bs.cliente
          WHERE c.status = 1
        `),
        // ── Por Perfil: Base S 12m, classificada por visitas históricas ─────────
        // Ocasional=2-3, Fiel=7-12, One-shot=1, Regular=4-6, Recorrente>12
        queryExternal<{ one_shot: number; ocasional: number; regular: number; fiel: number; recorrente: number; total: number }>(`
          SELECT
            COUNT(DISTINCT CASE WHEN vh.total_visitas = 1 THEN bs.cliente END) as one_shot,
            COUNT(DISTINCT CASE WHEN vh.total_visitas BETWEEN 2 AND 3 THEN bs.cliente END) as ocasional,
            COUNT(DISTINCT CASE WHEN vh.total_visitas BETWEEN 4 AND 6 THEN bs.cliente END) as regular,
            COUNT(DISTINCT CASE WHEN vh.total_visitas BETWEEN 7 AND 12 THEN bs.cliente END) as fiel,
            COUNT(DISTINCT CASE WHEN vh.total_visitas > 12 THEN bs.cliente END) as recorrente,
            COUNT(DISTINCT bs.cliente) as total
          FROM ${baseS12mSubquery} bs
          LEFT JOIN ${visitasHistoricasSubquery} vh ON vh.cliente = bs.cliente
          JOIN clientes c ON c.id = bs.cliente
          WHERE c.status = 1
        `),
        // ── Por Cadência: Base S 12m com >=3 visitas, por dias sem visitar (usando ultima_venda) ──
        // Perdido=>90d, Regular=31-60d, Em risco=61-90d, Espaçando=91-180d, Mto frequente=<=30d
        queryExternal<{ perdido: number; regular: number; em_risco: number; espacando: number; mto_frequente: number; total: number }>(`
          SELECT
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) > 90 THEN bs.cliente END) as perdido,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) BETWEEN 31 AND 60 THEN bs.cliente END) as regular,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) BETWEEN 61 AND 90 THEN bs.cliente END) as em_risco,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) BETWEEN 91 AND 180 THEN bs.cliente END) as espacando,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) <= 30 THEN bs.cliente END) as mto_frequente,
            COUNT(DISTINCT bs.cliente) as total
          FROM ${baseS12mSubquery} bs
          JOIN clientes c ON c.id = bs.cliente
          LEFT JOIN ${visitasHistoricasSubquery} vh ON vh.cliente = bs.cliente
          WHERE c.status = 1 AND vh.total_visitas >= 3
        `),
        // ── Status 12m: Base S 12m por faixas de dias (usando ultima_venda) ───────────────────────
        // ≤60d saudavel, 61-90d em risco (excl. one-shots), >90d perdido (excl. one-shots)
        queryExternal<{ perdido: number; em_risco: number; saudavel: number; total: number }>(`
          SELECT
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) > 90 AND COALESCE(vh.total_visitas, 0) > 1 THEN bs.cliente END) as perdido,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) BETWEEN 61 AND 90 AND COALESCE(vh.total_visitas, 0) > 1 THEN bs.cliente END) as em_risco,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) <= 60 THEN bs.cliente END) as saudavel,
            COUNT(DISTINCT bs.cliente) as total
          FROM ${baseS12mSubquery} bs
          JOIN clientes c ON c.id = bs.cliente
          LEFT JOIN ${visitasHistoricasSubquery} vh ON vh.cliente = bs.cliente
          WHERE c.status = 1
        `),
        // ── One-Shot: Base S 12m com 1 visita histórica (usando ultima_venda) ──────────────────────────────────
        queryExternal<{ total: number; aguardando: number; em_risco: number; perdido: number }>(`
          SELECT
            COUNT(DISTINCT bs.cliente) as total,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) <= 60 THEN bs.cliente END) as aguardando,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) BETWEEN 46 AND 90 THEN bs.cliente END) as em_risco,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) > 90 THEN bs.cliente END) as perdido
          FROM ${baseS12mSubquery} bs
          JOIN clientes c ON c.id = bs.cliente
          LEFT JOIN ${visitasHistoricasSubquery} vh ON vh.cliente = bs.cliente
          WHERE c.status = 1 AND vh.total_visitas = 1
        `),
        // ── Clientes únicos no período selecionado ──────────────────────────────
        queryExternal<{ total: number }>(`
          SELECT COUNT(DISTINCT cp.cliente) as total
          FROM ${clientesPeriodoSubquery} cp
        `),
        // ── Novos no período (data_criacao no período) ──────────────────────────
        queryExternal<{ total: number; recorrentes: number; one_shot_total: number }>(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN vh.total_visitas > 1 THEN 1 ELSE 0 END) as recorrentes,
            SUM(CASE WHEN vh.total_visitas = 1 OR vh.total_visitas IS NULL THEN 1 ELSE 0 END) as one_shot_total
          FROM clientes c
          LEFT JOIN ${visitasHistoricasSubquery} vh ON vh.cliente = c.id
          WHERE ${unitCondSimple} AND c.status = 1
            AND DATE(c.data_criacao) >= '${dataInicio}' AND DATE(c.data_criacao) <= '${dataFim}'
        `),
        // ── Resgatados no período ────────────────────────────────────────────────
        // Clientes que: existiam antes do período, tinham parado de vir (>90d antes do início),
        // e voltaram a visitar no período selecionado
        queryExternal<{ total: number }>(`
          SELECT COUNT(DISTINCT cp.cliente) as total
          FROM ${clientesPeriodoSubquery} cp
          JOIN clientes c ON c.id = cp.cliente
          JOIN (
            SELECT v2.cliente, MAX(DATE(v2.data_criacao)) as ultima_antes
            FROM vendas v2
            JOIN usuarios uu2 ON v2.usuario = uu2.id
            WHERE uu2.unidade IN (${extIds.length > 0 ? extIds.join(",") : "0"})
              AND v2.comanda_temp = 0 AND v2.cancelado_motivo IS NULL AND v2.status != 0
              AND v2.cliente IS NOT NULL AND v2.cliente != 2
              AND DATE(v2.data_criacao) < '${dataInicio}'
            GROUP BY v2.cliente
          ) ult ON ult.cliente = cp.cliente
          WHERE c.status = 1
            AND DATE(c.data_criacao) < '${dataInicio}'
            AND DATEDIFF('${dataInicio}', ult.ultima_antes) > 90
        `),
        // Cadencia Individual: Base P 24m com >=2 visitas historicas, logica de ratio
        // Universo: clientes que visitaram nos ultimos 24m E tem >=2 visitas historicas (exclui one-shots)
        // Cadencia habitual: media dos intervalos entre visitas (historico completo)
        // ratio = DATEDIFF(dataFim, ultima_venda) / cadencia_habitual
        // Assiduo: ratio <=0.8 | Regular: 0.8-1.2 | Espacando: 1.2-1.8 | Em Risco: 1.8-2.5 | Perdido: >2.5
        // 1a Vez: 1 visita historica (one-shot, sem cadencia calculavel)
        queryExternal<{ assiduo: number; regular: number; espacando: number; primeira_vez: number; em_risco: number; perdido: number; total: number }>(`
          SELECT
            COUNT(DISTINCT CASE WHEN ci.ratio IS NOT NULL AND ci.ratio <= 0.8 THEN ci.cliente END) as assiduo,
            COUNT(DISTINCT CASE WHEN ci.ratio IS NOT NULL AND ci.ratio > 0.8 AND ci.ratio <= 1.2 THEN ci.cliente END) as regular,
            COUNT(DISTINCT CASE WHEN ci.ratio IS NOT NULL AND ci.ratio > 1.2 AND ci.ratio <= 1.8 THEN ci.cliente END) as espacando,
            COUNT(DISTINCT CASE WHEN ci.total_visitas_hist = 1 THEN ci.cliente END) as primeira_vez,
            COUNT(DISTINCT CASE WHEN ci.ratio IS NOT NULL AND ci.ratio > 1.8 AND ci.ratio <= 2.5 THEN ci.cliente END) as em_risco,
            COUNT(DISTINCT CASE WHEN ci.ratio IS NOT NULL AND ci.ratio > 2.5 THEN ci.cliente END) as perdido,
            COUNT(DISTINCT ci.cliente) as total
          FROM (
            SELECT
              bs.cliente,
              COALESCE(vh_hist.total_visitas, 0) as total_visitas_hist,
              uvc.ultima_venda,
              DATEDIFF('${dataFim}', uvc.ultima_venda) as dias_sem_vir,
              iv.cadencia_habitual,
              CASE
                WHEN iv.cadencia_habitual IS NOT NULL AND iv.cadencia_habitual > 0
                THEN DATEDIFF('${dataFim}', uvc.ultima_venda) / iv.cadencia_habitual
                ELSE NULL
              END as ratio
            FROM (
              SELECT DISTINCT v.cliente
              FROM vendas v
              JOIN usuarios uu ON v.usuario = uu.id
              WHERE ${unitCondV}
                AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
                AND v.cliente IS NOT NULL AND v.cliente != 2
                AND DATE(v.data_criacao) >= '${dataInicio24m}' AND DATE(v.data_criacao) <= '${dataFim}'
            ) bs
            JOIN clientes c ON c.id = bs.cliente
            JOIN (
              SELECT v.cliente, COUNT(*) as total_visitas
              FROM vendas v
              JOIN usuarios uu ON v.usuario = uu.id
              WHERE ${unitCondV}
                AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
                AND v.cliente IS NOT NULL AND v.cliente != 2
              GROUP BY v.cliente
              HAVING COUNT(*) >= 2
            ) vh_hist ON vh_hist.cliente = bs.cliente
            LEFT JOIN (
              SELECT sub.cliente, AVG(sub.diff) as cadencia_habitual
              FROM (
                SELECT
                  v.cliente,
                  DATEDIFF(DATE(v.data_criacao), LAG(DATE(v.data_criacao)) OVER (PARTITION BY v.cliente ORDER BY v.data_criacao)) as diff
                FROM vendas v
                JOIN usuarios uu ON v.usuario = uu.id
                WHERE ${unitCondV}
                  AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
                  AND v.cliente IS NOT NULL AND v.cliente != 2
              ) sub
              WHERE sub.diff IS NOT NULL AND sub.diff > 0
              GROUP BY sub.cliente
            ) iv ON iv.cliente = bs.cliente
            LEFT JOIN (
              SELECT v.cliente, MAX(DATE(v.data_criacao)) as ultima_venda
              FROM vendas v
              JOIN usuarios uu ON v.usuario = uu.id
              WHERE ${unitCondV}
                AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
                AND v.cliente IS NOT NULL AND v.cliente != 2
              GROUP BY v.cliente
            ) uvc ON uvc.cliente = bs.cliente
            WHERE c.status = 1
          ) ci
        `),
        // ── Movimento mensal ─────────────────────────────────────────────────────
        queryExternal<{ mes: string; atendidos: number; em_risco: number; resgatados: number }>(`
          SELECT
            DATE_FORMAT(v.data_criacao, '%Y-%m') as mes,
            COUNT(DISTINCT v.cliente) as atendidos,
            COUNT(DISTINCT CASE
              WHEN DATEDIFF(LAST_DAY(v.data_criacao), uv_mes.ultima_venda) BETWEEN 61 AND 90
              THEN v.cliente END) as em_risco,
            COUNT(DISTINCT CASE
              WHEN DATE(c.data_criacao) < '${dataInicio}'
                AND DATEDIFF(DATE(v.data_criacao), ult_antes.ultima_antes) > 90
              THEN v.cliente END) as resgatados
          FROM vendas v
          JOIN usuarios uu ON v.usuario = uu.id
          JOIN clientes c ON c.id = v.cliente
          LEFT JOIN ${ultimaVendaSubquery} uv_mes ON uv_mes.cliente = v.cliente
          LEFT JOIN (
            SELECT v2.cliente, MAX(DATE(v2.data_criacao)) as ultima_antes
            FROM vendas v2
            JOIN usuarios uu2 ON v2.usuario = uu2.id
            WHERE ${unitCondV.replace(/\buu\./g, 'uu2.')}
              AND v2.comanda_temp = 0 AND v2.cancelado_motivo IS NULL AND v2.status != 0
              AND v2.cliente IS NOT NULL AND v2.cliente != 2
              AND DATE(v2.data_criacao) < '${dataInicio}'
            GROUP BY v2.cliente
          ) ult_antes ON ult_antes.cliente = v.cliente
          WHERE ${unitCondV}
            AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
            AND v.cliente IS NOT NULL AND v.cliente != 2
            AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
          GROUP BY mes ORDER BY mes
        `),
        // ── Entradas mensais ─────────────────────────────────────────────────────
        queryExternal<{ mes: string; novos: number; resgatados: number }>(`
          SELECT
            DATE_FORMAT(v.data_criacao, '%Y-%m') as mes,
            COUNT(DISTINCT CASE
              WHEN DATE(c.data_criacao) >= '${dataInicio}'
              THEN v.cliente END) as novos,
            COUNT(DISTINCT CASE
              WHEN DATE(c.data_criacao) < '${dataInicio}'
                AND DATEDIFF(DATE(v.data_criacao), ult_antes_em.ultima_antes) > 90
              THEN v.cliente END) as resgatados
          FROM vendas v
          JOIN usuarios uu ON v.usuario = uu.id
          JOIN clientes c ON c.id = v.cliente
          LEFT JOIN (
            SELECT v2.cliente, MAX(DATE(v2.data_criacao)) as ultima_antes
            FROM vendas v2
            JOIN usuarios uu2 ON v2.usuario = uu2.id
            WHERE ${unitCondV.replace(/\buu\./g, 'uu2.')}
              AND v2.comanda_temp = 0 AND v2.cancelado_motivo IS NULL AND v2.status != 0
              AND v2.cliente IS NOT NULL AND v2.cliente != 2
              AND DATE(v2.data_criacao) < '${dataInicio}'
            GROUP BY v2.cliente
          ) ult_antes_em ON ult_antes_em.cliente = v.cliente
          WHERE ${unitCondV}
            AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
            AND v.cliente IS NOT NULL AND v.cliente != 2
            AND c.status = 1
            AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
          GROUP BY mes ORDER BY mes
        `),
            // ── Risco mensal ─────────────────────────────────────────────────────
        // Para cada mês do período, calcula o estado dos clientes da base S
        // usando a última visita ATE o fim daquele mês (não a global).
        // Abordagem: para cada (cliente, mês), pega o MAX(data_criacao) <= LAST_DAY(mês)
        queryExternal<{ mes: string; em_risco: number; churn_novos: number; total_ativos_mes: number }>(`
          SELECT
            meses.mes,
            COUNT(DISTINCT CASE
              WHEN DATEDIFF(meses.fim_mes, uv_por_mes.ultima_ate_mes) BETWEEN 61 AND 90
                AND COALESCE(vh_rm.total_visitas, 0) > 1
              THEN bs.cliente END) as em_risco,
            COUNT(DISTINCT CASE
              WHEN DATEDIFF(meses.fim_mes, uv_por_mes.ultima_ate_mes) > 90
                AND COALESCE(vh_rm.total_visitas, 0) > 1
              THEN bs.cliente END) as churn_novos,
            COUNT(DISTINCT CASE
              WHEN DATEDIFF(meses.fim_mes, uv_por_mes.ultima_ate_mes) <= 60
              THEN bs.cliente END) as total_ativos_mes
          FROM (
            SELECT DISTINCT
              DATE_FORMAT(v.data_criacao, '%Y-%m') as mes,
              LAST_DAY(v.data_criacao) as fim_mes
            FROM vendas v
            JOIN usuarios uu ON v.usuario = uu.id
            WHERE ${unitCondV}
              AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
              AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
          ) meses
          JOIN ${baseS12mSubquery} bs ON 1=1
          -- Para cada cliente x mes: MAX(data_criacao) <= fim_mes (ultima visita ate aquele mes)
          LEFT JOIN (
            SELECT
              all_v.cliente,
              DATE_FORMAT(m2.data_criacao, '%Y-%m') as mes,
              MAX(DATE(all_v.data_criacao)) as ultima_ate_mes
            FROM vendas all_v
            JOIN usuarios uu_av ON all_v.usuario = uu_av.id
            JOIN (
              SELECT DISTINCT DATE_FORMAT(v3.data_criacao, '%Y-%m') as mes_ref,
                     LAST_DAY(v3.data_criacao) as fim_mes,
                     v3.data_criacao
              FROM vendas v3
              JOIN usuarios uu3 ON v3.usuario = uu3.id
              WHERE ${unitCondV.replace(/\buu\./g, 'uu3.')}
                AND v3.comanda_temp = 0 AND v3.cancelado_motivo IS NULL AND v3.status != 0
                AND DATE(v3.data_criacao) >= '${dataInicio}' AND DATE(v3.data_criacao) <= '${dataFim}'
            ) m2 ON DATE(all_v.data_criacao) <= m2.fim_mes
            WHERE ${unitCondV.replace(/\buu\./g, 'uu_av.')}
              AND all_v.comanda_temp = 0 AND all_v.cancelado_motivo IS NULL AND all_v.status != 0
              AND all_v.cliente IS NOT NULL AND all_v.cliente != 2
              AND DATE(all_v.data_criacao) >= '${dataInicio12m}'
            GROUP BY all_v.cliente, DATE_FORMAT(m2.data_criacao, '%Y-%m')
          ) uv_por_mes ON uv_por_mes.cliente = bs.cliente AND uv_por_mes.mes = meses.mes
          LEFT JOIN ${visitasHistoricasSubquery} vh_rm ON vh_rm.cliente = bs.cliente
          GROUP BY meses.mes, meses.fim_mes
          ORDER BY meses.mes
        `),
        // ── Saúde por barbeiro ────────────────────────────────────────────────────────────────────────────────────────────────────────────
        // Em Risco e Perdido excluem one-shots (visitas históricas = 1)
        queryExternal<{ colaborador_nome: string; total: number; saudavel: number; em_risco: number; perdido: number }>(`
          SELECT
            uu.nome as colaborador_nome,
            COUNT(DISTINCT v.cliente) as total,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', uv4.ultima_venda) <= 60 THEN v.cliente END) as saudavel,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', uv4.ultima_venda) BETWEEN 61 AND 90 AND COALESCE(vh4.total_visitas, 0) > 1 THEN v.cliente END) as em_risco,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', uv4.ultima_venda) > 90 AND COALESCE(vh4.total_visitas, 0) > 1 THEN v.cliente END) as perdido
          FROM vendas v
          JOIN usuarios uu ON v.usuario = uu.id
          LEFT JOIN ${ultimaVendaSubquery} uv4 ON uv4.cliente = v.cliente
          LEFT JOIN ${visitasHistoricasSubquery} vh4 ON vh4.cliente = v.cliente
          WHERE ${unitCondV}
            AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
            AND v.cliente IS NOT NULL AND v.cliente != 2
            AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
            AND (uu.visivel_agenda IS NULL OR uu.visivel_agenda != 'nenhuma')
          GROUP BY uu.id, uu.nome
          HAVING total >= 5
          ORDER BY (em_risco + perdido) / total DESC
          LIMIT 8
        `),
      ]);

      const sr = sinaisRows[0] || { total_base_s: 0, ativos: 0, em_risco: 0, perdidos: 0, one_shot_urgente: 0, one_shot_risco: 0, one_shot_perdido: 0 };
      const totalBaseS = Number(sr.total_base_s);
      const ativos = Number(sr.ativos);
      const emRisco = Number(sr.em_risco);
      const perdidos = Number(sr.perdidos);
      const oneShotUrgente = Number(sr.one_shot_urgente);
      const oneShotRisco = Number(sr.one_shot_risco);
      const oneShotPerdido = Number(sr.one_shot_perdido);
      const clientesUnicos = Number(clientesUnicosRows[0]?.total ?? 0);
      const novos = Number(novosRows[0]?.total ?? 0);
      const novosRecorrentes = Number(novosRows[0]?.recorrentes ?? 0);
      const novosOneShotTotal = Number(novosRows[0]?.one_shot_total ?? 0);
      const resgatados = Number(resgatadosRows[0]?.total ?? 0);
      const saudeAquisicao = novos > 0 ? Math.round((novosRecorrentes / novos) * 100) : 0;
      const pr = porPerfilRows[0] || { one_shot: 0, ocasional: 0, regular: 0, fiel: 0, recorrente: 0, total: 0 };
      const pc = porCadenciaRows[0] || { perdido: 0, regular: 0, em_risco: 0, espacando: 0, mto_frequente: 0, total: 0 };
      const s12 = status12mRows[0] || { perdido: 0, em_risco: 0, saudavel: 0, total: 0 };
      const os = oneShotRows[0] || { total: 0, aguardando: 0, em_risco: 0, perdido: 0 };
      const ci = cadenciaIndividualRows[0] || { assiduo: 0, regular: 0, espacando: 0, primeira_vez: 0, em_risco: 0, perdido: 0, total: 0 };

      return {
        sinais: {
          totalBase: totalBaseS,
          ativos,
          perdidos,
          emRisco,
          novos,
          oneShotUrgente,
          resgatados,
          pctAtivos: totalBaseS > 0 ? Math.round((ativos / totalBaseS) * 100) : 0,
          pctPerdidos: totalBaseS > 0 ? Math.round((perdidos / totalBaseS) * 100) : 0,
          pctEmRisco: totalBaseS > 0 ? Math.round((emRisco / totalBaseS) * 100) : 0,
          pctNovos: clientesUnicos > 0 ? Math.round((novos / clientesUnicos) * 100) : 0,
          pctOneShotUrgente: Number(os.total) > 0 ? Math.round((oneShotUrgente / Number(os.total)) * 100) : 0,
          pctResgatados: totalBaseS > 0 ? Math.round((resgatados / totalBaseS) * 100) : 0,
        },
        atividade: {
          clientesUnicos,
          novosClientes: novos,
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
          porPerfil: {
            one_shot: Number(pr.one_shot),
            ocasional: Number(pr.ocasional),
            regular: Number(pr.regular),
            fiel: Number(pr.fiel),
            recorrente: Number(pr.recorrente),
            total: Number(pr.total),
          },
          porCadencia: {
            perdido: Number(pc.perdido),
            regular: Number(pc.regular),
            emRisco: Number(pc.em_risco),
            espacando: Number(pc.espacando),
            mtoFrequente: Number(pc.mto_frequente),
            total: Number(pc.total),
          },
          status12m: {
            perdido: Number(s12.perdido),
            emRisco: Number(s12.em_risco),
            saudavel: Number(s12.saudavel),
            total: Number(s12.total),
          },
          oneShot: {
            total: Number(os.total),
            aguardando: Number(os.aguardando),
            emRisco: Number(os.em_risco),
            perdido: Number(os.perdido),
          },
        },
        novosClientes: {
          total: novos,
          recorrentes: novosRecorrentes,
          oneShotTotal: novosOneShotTotal,
          saudeAquisicao,
        },
        cadenciaIndividual: {
          assiduo: Number(ci.assiduo),
          regular: Number(ci.regular),
          espacando: Number(ci.espacando),
          primeiraVez: Number(ci.primeira_vez),
          emRisco: Number(ci.em_risco),
          perdido: Number(ci.perdido),
          total: Number(ci.total),
        },
        movimentoMensal: movimentoMensalRows.map(r => ({
          mes: r.mes,
          atendidos: Number(r.atendidos),
          emRisco: Number(r.em_risco),
          resgatados: Number(r.resgatados),
        })),
        entradasMensais: entradasMensaisRows.map(r => ({
          mes: r.mes,
          novos: Number(r.novos),
          resgatados: Number(r.resgatados),
        })),
        riscoMensal: riscoMensalRows.map(r => {
          const emRisco = Number(r.em_risco);
          const churnNovos = Number(r.churn_novos);
          const totalAtivos = Number(r.total_ativos_mes);
          const baseRef = totalAtivos + emRisco + churnNovos;
          return {
            mes: r.mes,
            emRisco,
            churnNovos,
            totalAtivos,
            // Churn %: perdidos novos / base ativa do mês
            churnPct: baseRef > 0 ? Math.round((churnNovos / baseRef) * 100) : 0,
            // Em Risco %: em risco / base ativa do mês
            emRiscoPct: baseRef > 0 ? Math.round((emRisco / baseRef) * 100) : 0,
          };
        }),
        saudeBarbeiros: saudeBarbeirosRows.map(b => {
          const total = Number(b.total);
          const saudavel = Number(b.saudavel);
          const emRiscoB = Number(b.em_risco);
          const perdidoB = Number(b.perdido);
          return {
            nome: b.colaborador_nome,
            total,
            saudavel,
            emRisco: emRiscoB,
            perdido: perdidoB,
            pctSaudavel: total > 0 ? Math.round((saudavel / total) * 100) : 0,
            pctEmRisco: total > 0 ? Math.round((emRiscoB / total) * 100) : 0,
            pctPerdido: total > 0 ? Math.round((perdidoB / total) * 100) : 0,
          };
        }),
        periodo: { dataInicio, dataFim },
        contexto: {
          periodoFiltrado: `${dataInicio} – ${dataFim}`,
          ref: dataFim,
          baseUsada: `${dataInicio12m} – ${dataFim}`,
          emRisco: {
            regra: "61d <= dias_sem_vir <= 90d E visitas > 1 (one-shots tratados separadamente)",
            usadaEm: "Em Risco - Score de saude (dim. risco) - Distribuicoes",
          },
          perdidos: {
            regra: "dias_sem_vir > 90d E visitas > 1 (one-shots tratados separadamente)",
            usadaEm: "Perdidos - Score de saude (dim. perdidos) - Distribuicoes",
          },
          oneShotRisco: {
            regra: "visitas=1 E 46d <= dias_sem_vir <= 90d",
            usadaEm: "One-shots (em risco + perdido) - Distribuicoes",
          },
          oneShotPerdido: {
            regra: "visitas=1 E dias_sem_vir > 90d",
            usadaEm: "One-shots (em risco + perdido) - Distribuicoes",
          },
          distribuicoes: {
            porPerfil: {
              descricao: "Volume historico + recencia na REF",
              universo: `${dataInicio12m} – ${dataFim}`,
              total: Number(pr.total),
              regras: "Fiel: >=12v E <=45d | Recorrente: >=6v E <=60d | Regular: >=3v E <=90d",
              nota: "Config -> Secao 3 para editar thresholds.",
            },
            porCadencia: {
              descricao: "Dias sem vir - recorrentes - REF: " + dataFim,
              universo: `${dataInicio12m} – ${dataFim}`,
              total: Number(pc.total),
              regras: "Perdido: >90d | Regular: 31-60d | Em risco: 61-90d | Espacando: 91-180d | Mto frequente: <=30d",
              nota: "Analise detalhada na aba Cadencia. Labels editaveis em Config -> Secao 4.",
            },
            status12m: {
              descricao: "Classificacao baseada apenas em recencia (dias desde ultima visita).",
              universo: `${dataInicio12m} – ${dataFim}`,
              total: Number(s12.total),
              regras: "Saudavel: <=60d | Em Risco: 61-90d (excl. one-shots) | Perdido: >90d (excl. one-shots)",
              nota: "One-shots (1 visita) sao contabilizados separadamente. Configure em Config -> Secao 5.",
            },
            oneShot: {
              descricao: "One-shot = cliente com exatamente 1 visita historica. Sem cadencia calculavel - monitorados por recencia.",
              universo: `${dataInicio12m} – ${dataFim}`,
              total: Number(os.total),
              regras: "Aguardando: visitas=1 E dias_sem_vir <= 60d | Em risco: visitas=1 E 46d <= dias <= 90d | Perdido: visitas=1 E dias_sem_vir > 90d",
              nota: "Em risco e Perdido tambem somam nos KPIs gerais.",
            },
          },
        },
      };
    }),

  // ── One-Shot ─────────────────────────────────────────────────────────────────────────────────
  // Lógica alinhada com sistema de referência:
  // - Universo: Base S 12m com exatamente 1 visita histórica
  // - Grupos por recência (dias desde última visita até dataFim):
  //   Aguardando ≤45d | Em Risco 46-90d | Provavelmente Perdido +91d
  // - KPIs: Total, % da base, Em risco+perdido, Aguardando
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
      const dataFim = input.dataFim || new Date().toISOString().split("T")[0];
      const dataFimDate = new Date(dataFim + "T00:00:00Z");
      const dataInicio12m = new Date(dataFimDate.getTime() - 365 * 86400000).toISOString().split("T")[0];
      const unitCondV = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
        : `uu.unidade IN (${extIds.join(",")})`;
      const unitCondSimple = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `ultima_visita_unidade = ${extIds[0]}`
        : `ultima_visita_unidade IN (${extIds.join(",")})`;

      // Universo Base S 12m: última venda nos 12m antes de dataFim
      const ultimaVendaSubquery = `(
        SELECT v.cliente, MAX(DATE(v.data_criacao)) as ultima_venda
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitCondV}
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
          AND v.cliente IS NOT NULL AND v.cliente != 2
        GROUP BY v.cliente
      )`;
      const baseS12mSubquery = `(
        SELECT uv.cliente, uv.ultima_venda
        FROM ${ultimaVendaSubquery} uv
        WHERE uv.ultima_venda >= '${dataInicio12m}' AND uv.ultima_venda <= '${dataFim}'
      )`;
      const visitasHistoricasSubquery = `(
        SELECT v.cliente, COUNT(*) as total_visitas
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitCondV}
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
          AND v.cliente IS NOT NULL AND v.cliente != 2
        GROUP BY v.cliente
      )`;

      const [totalBaseRows, oneShotRows] = await Promise.all([
        // Total da base S 12m (para calcular % da base)
        queryExternal<{ total: number }>(`
          SELECT COUNT(DISTINCT bs.cliente) as total
          FROM ${baseS12mSubquery} bs
          JOIN clientes c ON c.id = bs.cliente
          WHERE c.status = 1
        `),
        // One-shots: Base S 12m com 1 visita histórica
        queryExternal<{
          id: number; nome: string; telefone: string;
          data_criacao: string; ultima_venda_dt: string; total_gasto: number;
        }>(`
          SELECT c.id, c.nome, c.telefone,
                 DATE(c.data_criacao) as data_criacao,
                 bs.ultima_venda as ultima_venda_dt,
                 COALESCE((
                   SELECT SUM(v2.valor_total) FROM vendas v2
                   JOIN usuarios uu2 ON v2.usuario = uu2.id
                   WHERE uu2.unidade IN (${extIds.length > 0 ? extIds.join(",") : "0"})
                     AND v2.cliente = c.id AND v2.comanda_temp = 0
                     AND v2.cancelado_motivo IS NULL AND v2.status != 0
                 ), 0) as total_gasto
          FROM ${baseS12mSubquery} bs
          JOIN clientes c ON c.id = bs.cliente
          JOIN ${visitasHistoricasSubquery} vh ON vh.cliente = bs.cliente
          WHERE c.status = 1 AND vh.total_visitas = 1
          ORDER BY bs.ultima_venda DESC
          LIMIT 2000
        `),
      ]);

      const totalBase = Number(totalBaseRows[0]?.total ?? 0);
      const clientes = oneShotRows.map(r => {
        // ultima_venda_dt pode vir como Date object (mysql2) ou string — normalizar para string YYYY-MM-DD
        let ultimaVendaStr: string | null = null;
        if (r.ultima_venda_dt) {
          const raw = r.ultima_venda_dt as unknown;
          if (raw instanceof Date) {
            // Extrair YYYY-MM-DD ignorando timezone do objeto Date
            ultimaVendaStr = `${raw.getUTCFullYear()}-${String(raw.getUTCMonth()+1).padStart(2,'0')}-${String(raw.getUTCDate()).padStart(2,'0')}`;
          } else {
            // String: pegar só os primeiros 10 chars (YYYY-MM-DD)
            ultimaVendaStr = String(raw).substring(0, 10);
          }
        }
        const ultimaVisitaDate = ultimaVendaStr ? new Date(ultimaVendaStr + "T00:00:00Z") : null;
        const dias = ultimaVisitaDate
          ? Math.floor((dataFimDate.getTime() - ultimaVisitaDate.getTime()) / 86400000)
          : 999;
        // Grupos: Aguardando ≤45d | Em Risco 46-90d | Perdido +91d
        const grupo: "aguardando" | "em_risco" | "perdido" =
          dias <= 45 ? "aguardando" : dias <= 90 ? "em_risco" : "perdido";
        return {
          clienteId: String(r.id),
          clienteNome: r.nome,
          telefone: r.telefone,
          primeiraVenda: r.data_criacao,
          ultimaVenda: r.ultima_venda_dt,
          totalVisitas: 1,
          totalGasto: Number(r.total_gasto),
          dias,
          status: grupo,
        };
      });

      const aguardando = clientes.filter(c => c.status === "aguardando").length;
      const emRisco = clientes.filter(c => c.status === "em_risco").length;
      const perdido = clientes.filter(c => c.status === "perdido").length;
      const total = clientes.length;
      const pctDaBase = totalBase > 0 ? Math.round((total / totalBase) * 100) : 0;

      // Filtrar por status e search
      let filtered = clientes;
      if (input.status && input.status !== "todos") {
        filtered = filtered.filter(c => c.status === input.status);
      }
      if (input.search) {
        const s = input.search.toLowerCase();
        filtered = filtered.filter(c => c.clienteNome?.toLowerCase().includes(s) || c.telefone?.includes(s));
      }
      return {
        resumo: {
          total,
          pctDaBase,
          emRiscoPerdido: emRisco + perdido,
          aguardando,
          emRisco,
          perdido,
          totalBase,
          dataRef: dataFim,
        },
        clientes: filtered,
      };
    }),

  // ── Cadência de visitas (lógica ratio individual) ────────────────────────────
  cadencia: protectedProcedure
    .input(baseInput)
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );
      const dataFim = input.dataFim || new Date().toISOString().split("T")[0];
      // Base 12m: clientes com visita nos 12 meses anteriores a dataFim
      const dataInicio12m = (() => {
        const d = new Date(dataFim + "T12:00:00Z");
        d.setFullYear(d.getFullYear() - 1);
        return d.toISOString().split("T")[0];
      })();

      if (extIds.length === 0) {
        return {
          total: 0, totalComCadencia: 0, primeiraVez: 0, mediaCadencia: 0,
          grupos: { assiduo: 0, regular: 0, espacando: 0, em_risco: 0, perdido: 0 },
          evolucao: [], analises: [],
        };
      }

      // SQL base para calcular grupos por ratio
      // ratio = DATEDIFF(refDate, ultima_venda_historica) / cadencia_habitual_individual
      // Assíduo ≤0.8 | Regular 0.8-1.2 | Espaçando 1.2-1.8 | Em Risco 1.8-2.5 | Perdido >2.5
      const buildRatioSQL = (refDate: string, ref12m: string) => {
        const unitIn = extIds.length === 1 ? `uu.unidade = ${extIds[0]}` : `uu.unidade IN (${extIds.join(",")})`;
        return {
          sql: `
            SELECT
              SUM(CASE WHEN ratio <= 0.8 THEN 1 ELSE 0 END) as assiduo,
              SUM(CASE WHEN ratio > 0.8 AND ratio <= 1.2 THEN 1 ELSE 0 END) as regular,
              SUM(CASE WHEN ratio > 1.2 AND ratio <= 1.8 THEN 1 ELSE 0 END) as espacando,
              SUM(CASE WHEN ratio > 1.8 AND ratio <= 2.5 THEN 1 ELSE 0 END) as em_risco,
              SUM(CASE WHEN ratio > 2.5 THEN 1 ELSE 0 END) as perdido,
              ROUND(AVG(cadencia_habitual)) as media_cadencia,
              COUNT(*) as total
            FROM (
              SELECT iv.cliente, iv.cadencia_habitual,
                DATEDIFF(?, uvc.ultima_venda) / iv.cadencia_habitual as ratio
              FROM (
                SELECT v.cliente,
                  DATEDIFF(MAX(DATE(v.data_criacao)), MIN(DATE(v.data_criacao))) / NULLIF(COUNT(*) - 1, 0) as cadencia_habitual
                FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
                WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
                  AND v.cliente IS NOT NULL AND v.cliente!=2
                  AND DATE(v.data_criacao) <= ?
                GROUP BY v.cliente HAVING COUNT(*) >= 2
              ) iv
              JOIN (
                SELECT v.cliente, MAX(DATE(v.data_criacao)) as ultima_venda
                FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
                WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
                  AND v.cliente IS NOT NULL AND v.cliente!=2
                  AND DATE(v.data_criacao) <= ?
                GROUP BY v.cliente
              ) uvc ON uvc.cliente = iv.cliente
              JOIN (
                SELECT DISTINCT v.cliente
                FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
                WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
                  AND v.cliente IS NOT NULL AND v.cliente!=2
                  AND DATE(v.data_criacao) >= ? AND DATE(v.data_criacao) <= ?
              ) bs ON bs.cliente = iv.cliente
              JOIN clientes c ON c.id = iv.cliente
              WHERE c.status=1 AND iv.cadencia_habitual IS NOT NULL AND iv.cadencia_habitual > 0
            ) ratios
          `,
          params: [refDate, refDate, refDate, ref12m, refDate],
        };
      };

      // Grupos do período atual
      const { sql: sqlAtual, params: paramsAtual } = buildRatioSQL(dataFim, dataInicio12m);
      const gruposRows = await queryExternal<{
        assiduo: number; regular: number; espacando: number; em_risco: number; perdido: number;
        media_cadencia: number; total: number;
      }>(sqlAtual, paramsAtual);
      const g = gruposRows[0] || { assiduo: 0, regular: 0, espacando: 0, em_risco: 0, perdido: 0, media_cadencia: 0, total: 0 };

      // 1ª Vez (one-shots na base 12m)
      const unitIn = extIds.length === 1 ? `uu.unidade = ${extIds[0]}` : `uu.unidade IN (${extIds.join(",")})`;
      const primeiraVezRows = await queryExternal<{ total: number }>(`
        SELECT COUNT(*) as total
        FROM (
          SELECT v.cliente, COUNT(*) as tv
          FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
          WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
            AND v.cliente IS NOT NULL AND v.cliente!=2
          GROUP BY v.cliente HAVING tv = 1
        ) vh
        JOIN (
          SELECT DISTINCT v.cliente
          FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
          WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
            AND v.cliente IS NOT NULL AND v.cliente!=2
            AND DATE(v.data_criacao) >= ? AND DATE(v.data_criacao) <= ?
        ) bs ON bs.cliente = vh.cliente
        JOIN clientes c ON c.id = vh.cliente WHERE c.status=1
      `, [dataInicio12m, dataFim]);
      const primeiraVez = Number(primeiraVezRows[0]?.total ?? 0);

      // Evolução mensal dos últimos 12 meses
      const evolucao: Array<{
        mes: string; assiduo: number; regular: number; espacando: number;
        em_risco: number; perdido: number; total: number;
      }> = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(dataFim + "T12:00:00Z");
        d.setMonth(d.getMonth() - i);
        const ano = d.getUTCFullYear();
        const mes = d.getUTCMonth() + 1;
        const lastDay = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
        const refDate = `${ano}-${String(mes).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;
        const ref12m = new Date(Date.UTC(ano - 1, mes - 1, lastDay)).toISOString().split("T")[0];
        const { sql, params } = buildRatioSQL(refDate, ref12m);
        const rows = await queryExternal<{ assiduo: number; regular: number; espacando: number; em_risco: number; perdido: number; total: number }>(sql, params);
        const r = rows[0] || { assiduo: 0, regular: 0, espacando: 0, em_risco: 0, perdido: 0, total: 0 };
        evolucao.push({
          mes: `${String(mes).padStart(2,"0")}/${String(ano).slice(2)}`,
          assiduo: Number(r.assiduo),
          regular: Number(r.regular),
          espacando: Number(r.espacando),
          em_risco: Number(r.em_risco),
          perdido: Number(r.perdido),
          total: Number(r.total),
        });
      }

      // Análises automáticas
      const totalComCadencia = Number(g.total);
      const analises: Array<{ tipo: "positivo" | "negativo" | "neutro" | "alerta"; texto: string }> = [];
      if (evolucao.length >= 2) {
        const primeiro = evolucao[0];
        const ultimo = evolucao[evolucao.length - 1];
        const pctEmRiscoAntes = primeiro.total > 0 ? Math.round(primeiro.em_risco / primeiro.total * 100) : 0;
        const pctEmRiscoAgora = ultimo.total > 0 ? Math.round(ultimo.em_risco / ultimo.total * 100) : 0;
        const pctPerdidoAntes = primeiro.total > 0 ? Math.round(primeiro.perdido / primeiro.total * 100) : 0;
        const pctPerdidoAgora = ultimo.total > 0 ? Math.round(ultimo.perdido / ultimo.total * 100) : 0;
        const diffRisco = pctEmRiscoAgora - pctEmRiscoAntes;
        const diffPerdido = pctPerdidoAgora - pctPerdidoAntes;
        if (diffRisco < 0) analises.push({ tipo: "positivo", texto: `% Em Risco caiu de ${pctEmRiscoAntes}% para ${pctEmRiscoAgora}% (${diffRisco}pp). Melhora na retenção.` });
        else if (diffRisco > 0) analises.push({ tipo: "negativo", texto: `% Em Risco subiu de ${pctEmRiscoAntes}% para ${pctEmRiscoAgora}% (+${diffRisco}pp). Atenção na retenção.` });
        if (diffPerdido < 0) analises.push({ tipo: "positivo", texto: `% Perdido caiu de ${pctPerdidoAntes}% para ${pctPerdidoAgora}% (${diffPerdido}pp). Boa recuperação.` });
        else if (diffPerdido > 0) analises.push({ tipo: "negativo", texto: `% Perdido subiu de ${pctPerdidoAntes}% para ${pctPerdidoAgora}% (+${diffPerdido}pp). Avaliar estratégia de retenção.` });
        // Pior e melhor mês
        const sorted = [...evolucao].filter(e => e.total > 0);
        if (sorted.length > 0) {
          const piorMes = sorted.reduce((a, b) => (b.em_risco / b.total) > (a.em_risco / a.total) ? b : a);
          const melhorMes = sorted.reduce((a, b) => (b.assiduo / b.total) > (a.assiduo / a.total) ? b : a);
          analises.push({ tipo: "neutro", texto: `Pior mês: ${piorMes.mes} (${Math.round(piorMes.em_risco/piorMes.total*100)}% em risco). Melhor: ${melhorMes.mes} (${Math.round(melhorMes.assiduo/melhorMes.total*100)}% assíduo).` });
        }
        if (totalComCadencia > 0 && Number(g.perdido) > Number(g.assiduo)) {
          analises.push({ tipo: "alerta", texto: `Mais Perdido (${g.perdido}) que Assíduo (${g.assiduo}). Atenção na retenção.` });
        }
      }

      return {
        total: totalComCadencia + primeiraVez,
        totalComCadencia,
        primeiraVez,
        mediaCadencia: Number(g.media_cadencia) || 0,
        grupos: {
          assiduo: Number(g.assiduo),
          regular: Number(g.regular),
          espacando: Number(g.espacando),
          em_risco: Number(g.em_risco),
          perdido: Number(g.perdido),
        },
        evolucao,
        analises,
        // legado (compatibilidade com frontend antigo)
        mediaGeral: Number(g.media_cadencia) || 0,
        distribuicao: { mto_frequente: Number(g.assiduo), regular: Number(g.regular), espacado: Number(g.espacando), em_risco: Number(g.em_risco), perdido: Number(g.perdido) },
        faixas: [],
        clientes: [],
      };
    }),
    // ── Churn (visão geral) ────────────────────────────────────────────────────
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

      if (extIds.length === 0) {
        return {
          resumo: { total: 0, ativos: 0, emRisco: 0, perdidos: 0, oneShots: 0, taxaRetencao: 0, taxaChurn: 0, mediaVisitas: 0, ticketMedio: 0, receitaPerdida: 0 },
          kpis: { churnGeral: 0, churnGeralPct: 0, churnFidelizados: 0, churnFidelizadosPct: 0, baseFidelizados: 0, churnOneShot: 0, churnOneShotPct: 0, baseOneShot: 0, resgatados: 0, emRisco45_90: 0 },
          perdidos: [], emRisco: [], resgatados: [], churnMensal: [], perdidosRecentes: [],
          periodo: { dataInicio, dataFim, diasPeriodo },
        };
      }

      const unitIn = extIds.length === 1 ? `uu.unidade = ${extIds[0]}` : `uu.unidade IN (${extIds.join(",")})`;

      // ── Passo 1: Base de churn = clientes que visitaram nos últimos 620d ────────
      // Lógica alinhada ao sistema de referência:
      //   Base = visitaram nos últimos 620d (≈20 meses) antes de dataFim
      //   Perdido = sem visita nos últimos 45d (75% da janela de 60d)
      //   Fidelizados = ≥3 visitas históricas
      //   One-shot = 1 visita histórica
      const dataBase620 = new Date(new Date(dataFim + "T12:00:00Z").getTime() - 620 * 86400000)
        .toISOString().split("T")[0];
      const unitIn2 = extIds.length === 1 ? `uu2.unidade = ${extIds[0]}` : `uu2.unidade IN (${extIds.join(",")})`;

      const clientesBase = await queryExternal<{
        cliente_id: number; nome: string; telefone: string;
        ultima_visita: Date; tv_hist: number; ticket: number;
      }>(`
        SELECT
          c.id as cliente_id, c.nome, c.telefone, c.ultima_visita,
          COALESCE(tvh.tv, 0) as tv_hist,
          COALESCE(c.consumo, 0) as ticket
        FROM (
          SELECT DISTINCT v.cliente
          FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
          WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
            AND v.cliente IS NOT NULL AND v.cliente!=2
            AND DATE(v.data_criacao) >= '${dataBase620}' AND DATE(v.data_criacao) <= '${dataFim}'
        ) bp
        JOIN clientes c ON c.id = bp.cliente
        LEFT JOIN (
          SELECT v2.cliente, COUNT(*) as tv
          FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
          WHERE ${unitIn2} AND v2.comanda_temp=0
            AND v2.cancelado_motivo IS NULL AND v2.status!=0
            AND v2.cliente IS NOT NULL AND v2.cliente!=2
          GROUP BY v2.cliente
        ) tvh ON tvh.cliente = c.id
        WHERE c.status = 1
        LIMIT 6000
      `);

      // ── Passo 2: Resgatados — clientes do período cuja visita ANTERIOR ao período
      //    foi há ≥90d antes de dataInicio (usando MAX da última visita antes do período)
      const resgatadosIds = await queryExternal<{ cliente_id: number; ultima_antes: Date }>(`
        SELECT bp.cliente as cliente_id, MAX(DATE(v_ant.data_criacao)) as ultima_antes
        FROM (
          SELECT DISTINCT v.cliente
          FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
          WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
            AND v.cliente IS NOT NULL AND v.cliente!=2
            AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
        ) bp
        JOIN vendas v_ant ON v_ant.cliente = bp.cliente
        JOIN usuarios uu_ant ON v_ant.usuario = uu_ant.id
        WHERE ${extIds.length === 1 ? `uu_ant.unidade = ${extIds[0]}` : `uu_ant.unidade IN (${extIds.join(",")})`}
          AND v_ant.comanda_temp=0 AND v_ant.cancelado_motivo IS NULL AND v_ant.status!=0
          AND DATE(v_ant.data_criacao) < '${dataInicio}'
        GROUP BY bp.cliente
        HAVING DATEDIFF('${dataInicio}', ultima_antes) >= 90
        LIMIT 1000
      `);

      const resgatadosSet = new Set(resgatadosIds.map(r => r.cliente_id));

      // ── Classificação no Node.js (sem carga extra no banco) ─────────────────
      const dataFimMs = new Date(dataFim + "T12:00:00Z").getTime();

      const mapC = (c: typeof clientesBase[0]) => {
        const uv = c.ultima_visita instanceof Date ? c.ultima_visita : new Date(c.ultima_visita as unknown as string);
        const dias = Math.max(0, Math.floor((dataFimMs - uv.getTime()) / 86400000));
        return {
          clienteId: String(c.cliente_id),
          clienteNome: c.nome,
          telefone: c.telefone,
          ultimaVenda: c.ultima_visita,
          totalVisitas: Number(c.tv_hist),
          dias,
        };
      };

      // Threshold 45d alinhado ao sistema de referência (75% da janela de 60d)
      const CHURN_THRESHOLD = 45;
      const RISCO_MIN = 30; // Em risco: 30-45d

      const perdidosList = clientesBase.filter(c => {
        const uv = c.ultima_visita instanceof Date ? c.ultima_visita : new Date(c.ultima_visita as unknown as string);
        return Math.floor((dataFimMs - uv.getTime()) / 86400000) > CHURN_THRESHOLD;
      });

      const emRiscoList = clientesBase.filter(c => {
        const uv = c.ultima_visita instanceof Date ? c.ultima_visita : new Date(c.ultima_visita as unknown as string);
        const d = Math.floor((dataFimMs - uv.getTime()) / 86400000);
        return d >= RISCO_MIN && d <= CHURN_THRESHOLD;
      });

      const resgatadosList = clientesBase.filter(c => resgatadosSet.has(c.cliente_id));

      const total = clientesBase.length;
      const perdidosTotal = perdidosList.length;
      const emRisco4590 = emRiscoList.length;
      const resgatadosTotal = resgatadosList.length;
      const fidelizadosTotal = clientesBase.filter(c => Number(c.tv_hist) >= 3).length;
      const perdidosFidelizados = perdidosList.filter(c => Number(c.tv_hist) >= 3).length;
      const oneShotTotal = clientesBase.filter(c => Number(c.tv_hist) === 1).length;
      const perdidosOneShot = perdidosList.filter(c => Number(c.tv_hist) === 1).length;
      const ticketMedio = total > 0
        ? clientesBase.reduce((s, c) => s + Number(c.ticket), 0) / total
        : 0;

      // ── Evolução mensal: para cada um dos últimos 12 meses, calcular snapshot ──
      // Para cada mês M: base = visitaram nos 620d antes do último dia de M
      //                  perdidos = sem visita nos 45d antes do último dia de M
      //                  fidelizados = ≥3 visitas históricas
      const evolucaoMensal: { mes: string; churnPct: number; fidPct: number; total: number; perdidos: number; fidelizados: number; perdidosFid: number }[] = [];

      // Gerar os 12 meses anteriores a dataFim
      const dataFimDate = new Date(dataFim + "T12:00:00Z");
      for (let i = 11; i >= 0; i--) {
        const refDate = new Date(dataFimDate);
        refDate.setUTCMonth(refDate.getUTCMonth() - i);
        // Último dia do mês de referência
        const lastDay = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() + 1, 0));
        const refStr = lastDay.toISOString().split("T")[0];
        const base620Str = new Date(lastDay.getTime() - 620 * 86400000).toISOString().split("T")[0];
        const mesLabel = `${lastDay.getUTCFullYear()}-${String(lastDay.getUTCMonth() + 1).padStart(2, "0")}`;

        try {
          const [snap] = await queryExternal<{
            total: number; perdidos: number; fidelizados: number; perdidosFid: number;
          }>(`
            SELECT
              COUNT(*) as total,
              SUM(CASE WHEN DATEDIFF('${refStr}', c.ultima_visita) > 45 THEN 1 ELSE 0 END) as perdidos,
              SUM(CASE WHEN COALESCE(tvh.tv,0) >= 3 THEN 1 ELSE 0 END) as fidelizados,
              SUM(CASE WHEN COALESCE(tvh.tv,0) >= 3 AND DATEDIFF('${refStr}', c.ultima_visita) > 45 THEN 1 ELSE 0 END) as perdidosFid
            FROM (
              SELECT DISTINCT v.cliente FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
              WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
                AND v.cliente IS NOT NULL AND v.cliente!=2
                AND DATE(v.data_criacao) >= '${base620Str}' AND DATE(v.data_criacao) <= '${refStr}'
            ) bp
            JOIN clientes c ON c.id = bp.cliente
            LEFT JOIN (
              SELECT v2.cliente, COUNT(*) as tv FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
              WHERE ${unitIn2} AND v2.comanda_temp=0 AND v2.cancelado_motivo IS NULL AND v2.status!=0
                AND v2.cliente IS NOT NULL AND v2.cliente!=2
              GROUP BY v2.cliente
            ) tvh ON tvh.cliente = c.id
            WHERE c.status = 1
          `);
          const t = Number(snap?.total ?? 0);
          const p = Number(snap?.perdidos ?? 0);
          const f = Number(snap?.fidelizados ?? 0);
          const pf = Number(snap?.perdidosFid ?? 0);
          evolucaoMensal.push({
            mes: mesLabel,
            churnPct: t > 0 ? Math.round(p / t * 1000) / 10 : 0,
            fidPct: f > 0 ? Math.round(pf / f * 1000) / 10 : 0,
            total: t, perdidos: p, fidelizados: f, perdidosFid: pf,
          });
        } catch {
          evolucaoMensal.push({ mes: mesLabel, churnPct: 0, fidPct: 0, total: 0, perdidos: 0, fidelizados: 0, perdidosFid: 0 });
        }
      }

      const churnMensal = evolucaoMensal;

      return {
        resumo: {
          total,
          ativos: Math.max(0, total - perdidosTotal - emRisco4590),
          emRisco: emRisco4590,
          perdidos: perdidosTotal,
          oneShots: oneShotTotal,
          taxaRetencao: total > 0 ? Math.round(((total - perdidosTotal) / total) * 100) : 0,
          taxaChurn: total > 0 ? Math.round((perdidosTotal / total) * 100) : 0,
          mediaVisitas: 0,
          ticketMedio: Math.round(ticketMedio * 100) / 100,
          receitaPerdida: Math.round(perdidosTotal * ticketMedio * 100) / 100,
        },
        kpis: {
          churnGeral: perdidosTotal,
          churnGeralPct: total > 0 ? Math.round(perdidosTotal / total * 1000) / 10 : 0,
          churnFidelizados: perdidosFidelizados,
          churnFidelizadosPct: fidelizadosTotal > 0 ? Math.round(perdidosFidelizados / fidelizadosTotal * 1000) / 10 : 0,
          baseFidelizados: fidelizadosTotal,
          churnOneShot: perdidosOneShot,
          churnOneShotPct: oneShotTotal > 0 ? Math.round(perdidosOneShot / oneShotTotal * 1000) / 10 : 0,
          baseOneShot: oneShotTotal,
          resgatados: resgatadosTotal,
          emRisco45_90: emRisco4590,
        },
        perdidos: perdidosList.slice(0, 500).map(mapC),
        emRisco: emRiscoList.slice(0, 500).map(mapC),
        resgatados: resgatadosList.slice(0, 200).map(mapC),
        perdidosRecentes: perdidosList.slice(0, 100).map(mapC),
        churnMensal,
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
      if (extIds.length === 0) return { barbeiros: [] };

      const dataFim = input.dataFim || new Date().toISOString().split("T")[0];
      const base620Str = new Date(new Date(dataFim + "T12:00:00Z").getTime() - 620 * 86400000).toISOString().split("T")[0];
      const resgate90Str = new Date(new Date(dataFim + "T12:00:00Z").getTime() - 90 * 86400000).toISOString().split("T")[0];

      const unitIn = extIds.length === 1 ? `uu.unidade = ${extIds[0]}` : `uu.unidade IN (${extIds.join(",")})`;
      const unitIn2 = extIds.length === 1 ? `uu2.unidade = ${extIds[0]}` : `uu2.unidade IN (${extIds.join(",")})`;
      const unitIn3 = extIds.length === 1 ? `uu3.unidade = ${extIds[0]}` : `uu3.unidade IN (${extIds.join(",")})`;

      // Query 1: clientes da base (620d) com ultima_visita e total de visitas históricas
      const clientesBase = await queryExternal<{
        cliente_id: number;
        ultima_visita: Date | string;
        tv_hist: number;
      }>(`
        SELECT
          c.id as cliente_id,
          c.ultima_visita,
          COUNT(vh.id) as tv_hist
        FROM clientes c
        JOIN vendas vh ON vh.cliente = c.id
        JOIN usuarios uuh ON vh.usuario = uuh.id
        WHERE ${unitIn.replace(/uu\./g, 'uuh.')} AND vh.comanda_temp=0 AND vh.cancelado_motivo IS NULL AND vh.status!=0
          AND vh.cliente IS NOT NULL AND vh.cliente!=2
        GROUP BY c.id, c.ultima_visita
        HAVING MAX(DATE(vh.data_criacao)) >= '${base620Str}'
          AND MAX(DATE(vh.data_criacao)) <= '${dataFim}'
          AND c.status = 1
      `);

      if (clientesBase.length === 0) return { barbeiros: [] };

      const clienteIds = clientesBase.map(r => r.cliente_id);
      const idList = clienteIds.join(",");

      // Query 2: último barbeiro de cada cliente (usando MAX data_criacao + JOIN)
      const ultBarbRows = await queryExternal<{
        cliente_id: number;
        colaborador_id: number;
        colaborador_nome: string;
        max_dt: string;
      }>(`
        SELECT v.cliente as cliente_id, uu.id as colaborador_id, uu.nome as colaborador_nome, MAX(v.data_criacao) as max_dt
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
          AND v.cliente IN (${idList})
        GROUP BY v.cliente, uu.id, uu.nome
      `);

      // Para cada cliente, pega o barbeiro com a data mais recente
      const ultBarbMap = new Map<number, { id: number; nome: string }>();
      for (const r of ultBarbRows) {
        const existing = ultBarbMap.get(r.cliente_id);
        if (!existing || r.max_dt > (existing as any).max_dt) {
          ultBarbMap.set(r.cliente_id, { id: r.colaborador_id, nome: r.colaborador_nome, max_dt: r.max_dt } as any);
        }
      }

      // Query 3: clientes resgatados (voltaram nos últimos 90d)
      const resgatadosRows = await queryExternal<{ cliente_id: number }>(`
        SELECT DISTINCT v.cliente as cliente_id
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
          AND v.cliente IN (${idList})
          AND DATE(v.data_criacao) >= '${resgate90Str}' AND DATE(v.data_criacao) <= '${dataFim}'
      `);
      const resgatadosSet = new Set(resgatadosRows.map(r => r.cliente_id));

      // Agregar por barbeiro em Node.js
      const barbeiroMap = new Map<number, {
        nome: string; total: number; perdidos: number; fidelizados: number;
        perdidosFid: number; emRisco: number; resgatados: number;
      }>();

      const dataFimMs = new Date(dataFim + "T12:00:00Z").getTime();

      for (const c of clientesBase) {
        const barb = ultBarbMap.get(c.cliente_id);
        if (!barb) continue;

        const uvDate = c.ultima_visita instanceof Date ? c.ultima_visita : new Date(c.ultima_visita as string);
        const uvStr = `${uvDate.getFullYear()}-${String(uvDate.getMonth()+1).padStart(2,"0")}-${String(uvDate.getDate()).padStart(2,"0")}`;
        const diasSemVir = Math.floor((dataFimMs - new Date(uvStr + "T12:00:00Z").getTime()) / 86400000);
        const tvHist = Number(c.tv_hist);
        const perdido = diasSemVir > 45;
        const emRisco = diasSemVir >= 45 && diasSemVir <= 90;
        const fidelizado = tvHist >= 3;
        const resgatado = resgatadosSet.has(c.cliente_id);

        if (!barbeiroMap.has(barb.id)) {
          barbeiroMap.set(barb.id, { nome: barb.nome, total: 0, perdidos: 0, fidelizados: 0, perdidosFid: 0, emRisco: 0, resgatados: 0 });
        }
        const entry = barbeiroMap.get(barb.id)!;
        entry.total++;
        if (perdido) entry.perdidos++;
        if (fidelizado) entry.fidelizados++;
        if (perdido && fidelizado) entry.perdidosFid++;
        if (emRisco) entry.emRisco++;
        if (resgatado) entry.resgatados++;
      }

      const barbeiros = Array.from(barbeiroMap.entries())
        .map(([id, e]) => ({
          colaboradorId: String(id),
          colaboradorNome: e.nome || "Sem nome",
          total: e.total,
          perdidos: e.perdidos,
          fidelizados: e.fidelizados,
          perdidosFid: e.perdidosFid,
          emRisco: e.emRisco,
          resgatados: e.resgatados,
          churnPct: e.total > 0 ? Math.round(e.perdidos / e.total * 1000) / 10 : 0,
          churnFidPct: e.fidelizados > 0 ? Math.round(e.perdidosFid / e.fidelizados * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.perdidos - a.perdidos);

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
  // Saúde da base por barbeiro: distribuição de clientes por status (Assíduo, Regular,
  // Espaçando, 1ª Vez, Em Risco, Perdido) + ranking comparativo com métricas de desempenho.
  barbeiros: protectedProcedure
    .input(baseInput)
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        ctx.user.id, ctx.user.role, input.orgId, input.unitId
      );
      const unitCond = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `uu.unidade = ${extIds[0]}`
        : `uu.unidade IN (${extIds.join(",")})`;
      const dataInicio = input.dataInicio || new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];
      const dataFim = input.dataFim || new Date().toISOString().split("T")[0];

      // Query principal: saúde da base por barbeiro
      // Para cada barbeiro, pega os clientes que atendeu no período e classifica por status atual
      const saudeRows = await queryExternal<{
        colaborador_id: number;
        colaborador_nome: string;
        total_clientes: number;
        assiduo: number;
        regular: number;
        espacando: number;
        em_risco: number;
        perdido: number;
        primeira_vez: number;
        novos: number;
        exclusivos: number;
        faturamento: number;
        ticket_medio: number;
        retencao_30d: number;
        total_atendimentos: number;
      }>(`
        SELECT
          uu.id as colaborador_id,
          uu.nome as colaborador_nome,
          COUNT(DISTINCT v.cliente) as total_clientes,
          SUM(CASE WHEN hist.total_visitas_hist = 1 THEN 1 ELSE 0 END) as primeira_vez,
          SUM(CASE WHEN hist.total_visitas_hist > 1 AND DATEDIFF(NOW(), c.ultima_visita) <= 30 THEN 1 ELSE 0 END) as assiduo,
          SUM(CASE WHEN hist.total_visitas_hist > 1 AND DATEDIFF(NOW(), c.ultima_visita) BETWEEN 31 AND 60 THEN 1 ELSE 0 END) as regular,
          SUM(CASE WHEN hist.total_visitas_hist > 1 AND DATEDIFF(NOW(), c.ultima_visita) BETWEEN 61 AND 90 THEN 1 ELSE 0 END) as espacando,
          SUM(CASE WHEN hist.total_visitas_hist > 1 AND DATEDIFF(NOW(), c.ultima_visita) BETWEEN 91 AND 120 THEN 1 ELSE 0 END) as em_risco,
          SUM(CASE WHEN hist.total_visitas_hist > 1 AND DATEDIFF(NOW(), c.ultima_visita) > 120 THEN 1 ELSE 0 END) as perdido,
          SUM(CASE WHEN c.ultima_visita_colaborador = uu.id THEN 1 ELSE 0 END) as exclusivos,
          SUM(CASE WHEN hist.primeira_visita_geral >= '${dataInicio}' THEN 1 ELSE 0 END) as novos,
          SUM(v.valor_total) as faturamento,
          AVG(v.valor_total) as ticket_medio,
          COUNT(v.id) as total_atendimentos,
          SUM(CASE WHEN DATEDIFF(NOW(), c.ultima_visita) <= 30 THEN 1 ELSE 0 END) as retencao_30d
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        JOIN clientes c ON c.id = v.cliente
        JOIN (
          SELECT
            v2.cliente,
            COUNT(*) as total_visitas_hist,
            MIN(v2.data_criacao) as primeira_visita_geral
          FROM vendas v2
          WHERE v2.comanda_temp = 0 AND v2.cancelado_motivo IS NULL AND v2.status != 0
            AND v2.cliente IS NOT NULL AND v2.cliente != 2
          GROUP BY v2.cliente
        ) hist ON hist.cliente = v.cliente
        WHERE ${unitCond}
          AND uu.visivel_agenda != 'nenhuma'
          AND DATE(v.data_criacao) >= '${dataInicio}'
          AND DATE(v.data_criacao) <= '${dataFim}'
          AND v.comanda_temp = 0
          AND v.cancelado_motivo IS NULL
          AND v.status != 0
          AND v.cliente IS NOT NULL
          AND v.cliente != 2
          AND c.status = 1
        GROUP BY uu.id, uu.nome
        ORDER BY (assiduo + regular) DESC
      `);

      return {
        barbeiros: saudeRows.map(r => {
          const total = Number(r.total_clientes) || 1;
          const assiduo = Number(r.assiduo);
          const regular = Number(r.regular);
          const espacando = Number(r.espacando);
          const emRisco = Number(r.em_risco);
          const perdido = Number(r.perdido);
          const primeiraVez = Number(r.primeira_vez);
          const saudePct = Math.round(((assiduo + regular) / total) * 100);
          return {
            colaboradorId: String(r.colaborador_id),
            colaboradorNome: r.colaborador_nome,
            totalClientes: total,
            assiduo,
            regular,
            espacando,
            emRisco,
            perdido,
            primeiraVez,
            novos: Number(r.novos),
            exclusivos: Number(r.exclusivos),
            faturamento: Number(r.faturamento || 0),
            ticketMedio: Math.round(Number(r.ticket_medio || 0)),
            totalAtendimentos: Number(r.total_atendimentos),
            retencao30d: Number(r.retencao_30d),
            saudePct,
            pctAssiduo: Math.round((assiduo / total) * 100),
            pctRegular: Math.round((regular / total) * 100),
            pctEspacando: Math.round((espacando / total) * 100),
            pctEmRisco: Math.round((emRisco / total) * 100),
            pctPerdido: Math.round((perdido / total) * 100),
            pctPrimeiraVez: Math.round((primeiraVez / total) * 100),
            pctExclusivos: total > 0 ? Math.round((Number(r.exclusivos) / total) * 100) : 0,
            pctFieis: total > 0 ? Math.round(((assiduo + regular) / total) * 100) : 0,
          };
        }),
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
