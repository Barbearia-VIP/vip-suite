/**
 * server/routers/raioX.ts
 * Router tRPC do módulo Raio X Clientes
 * Fonte de dados: banco LOCAL (tabelas sync_*)
 *
 * Estrutura da tabela sync_clientes:
 *   id, nome, telefone, data_criacao, ultima_visita, ultima_visita_unidade,
 *   ultima_visita_colaborador, consumo, status, unidade_id
 *   (NÃO tem coluna visitas — calcular via JOIN com sync_vendas)
 *
 * Definições:
 * - Ativo (≤60d): última visita ≤ 60 dias
 * - Em risco (61-90d): última visita entre 61 e 90 dias
 * - Perdido (>90d): última visita > 90 dias
 * - One-Shot: total de vendas = 1
 */
import { z } from "zod";
import { protectedProcedure, router, sysUserProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { sql, eq, and, isNotNull, ne } from "drizzle-orm";
import { wsCampanhas, wsContatos } from "../../drizzle/schema";
import { queryLocal } from "../db-local";
import {
  syncRaioXCacheUnit,
  runRaioXCacheSyncJob,
  getCachedVisaoGeralByPeriod,
  getCachedChurnByPeriod,
  getCachedRoutingByPeriod,
} from "../raioXCacheSync";
import {
  getChurnPorBarbeiro,
  getCadenciaVisitas,
  getDiagnosticoClientes,
  getCohortClientes,
} from "../dataVipQueries";

// ─── Cache em memória para diagnóstico (10 minutos TTL) ────────────────────────────────────────────
interface DiagnosticoResult {
  total: number;
  totalAtendimentos: number;
  faturamentoTotal: number;
  ticketMedio: number;
  freqMedia: number;
  taxaRetencao: number;
  novos: number;
  retornaram: number;
  qualidade: {
    score: number;
    semTelefone: number;
    semNome: number;
    comTelefone: number;
    pctSemTelefone: number;
    pctSemNome: number;
    pctComTelefone: number;
  };
  semCadastro: {
    atendimentos: number;
    faturamento: number;
    pct: number;
  };
  saude: {
    oneShot: number;
    emRisco: number;
    perdidos: number;
    voltaram2x: number;
    pctOneShot: number;
    pctEmRisco: number;
    pctPerdidos: number;
    pctVoltaram2x: number;
  };
  visitasDistribuicao: { visitas: number; clientes: number }[];
  faixasDias: { faixa: string; total: number; percentual: number }[];
  horarios: { hora: number; label: string; atendimentos: number }[];
  diasSemana: { dia: number; label: string; atendimentos: number; clientes: number }[];
  alertas: { tipo: string; mensagem: string }[];
}
const diagnosticoCache = new Map<string, { data: DiagnosticoResult; ts: number }>();
const DIAGNOSTICO_TTL = 10 * 60 * 1000; // 10 minutos
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos (shared TTL)
const visaoGeralCache = new Map<string, { data: any; ts: number }>();
const churnCache = new Map<string, { data: any; ts: number }>();
const cohortCache = new Map<string, { data: any; ts: number }>();
const cadenciaCache = new Map<string, { data: any; ts: number }>();
const oneShotCache = new Map<string, { data: any; ts: number }>();
const barbeirosCache = new Map<string, { data: any; ts: number }>();
const routingCache = new Map<string, { data: any; ts: number }>();
function getCached<T>(cache: Map<string, { data: T; ts: number }>, key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}
function setCached<T>(cache: Map<string, { data: T; ts: number }>, key: string, data: T) {
  cache.set(key, { data, ts: Date.now() });
}

// ─── Helper: resolve filtro de unidades (banco interno) ──────────────────────
async function resolveUnitFilter(
  userId: number,
  userRole: string,
  orgId?: number,
  unitId?: number,
  sysUser?: { id: number; orgId: number; allowedUnitIds: number[] } | null
): Promise<{ orgFilter: number | null; unitFilter: number | null; isAdmin: boolean }> {
  // sysUser (e-mail/senha): usa orgId e allowedUnitIds diretamente
  if (sysUser) {
    const unitFilter = unitId ?? (sysUser.allowedUnitIds.length === 1 ? sysUser.allowedUnitIds[0] : (sysUser.allowedUnitIds.length > 0 ? (unitId ?? sysUser.allowedUnitIds[0]) : null));
    return { orgFilter: sysUser.orgId, unitFilter: unitFilter ?? null, isAdmin: false };
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

// ─── Helper: converte unitId interno → externalIds ───────────────────────────
async function resolveExternalIds(
  userId: number,
  userRole: string,
  orgId?: number,
  unitId?: number,
  sysUser?: { id: number; orgId: number; allowedUnitIds: number[] } | null
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

// ─── Helpers de classificação ────────────────────────────────────────────────
function classificarStatus(dias: number): "ativo" | "em_risco" | "perdido" {
  if (dias <= 60) return "ativo";
  if (dias <= 90) return "em_risco";
  return "perdido";
}

// ─── Subquery de visitas por cliente ─────────────────────────────────────────
const visitasSubquery = `(
  SELECT cliente, COUNT(*) as total_visitas
  FROM sync_vendas WHERE comanda_temp = 0 AND cancelado_motivo IS NULL AND status = 1
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
  visaoGeral: sysUserProcedure
    .input(baseInput)
    .query(async ({ ctx, input }) => {
      const { extIds, unitFilter } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );
      const dataInicio = input.dataInicio || new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
      const dataFim = input.dataFim || new Date().toISOString().split("T")[0];
      // Janelas de 12m e 24m calculadas a partir do dataFim (alinhado com o sistema de referencia)
      const dataFimDate = new Date(dataFim + "T00:00:00Z");
      const dataInicio12m = new Date(dataFimDate.getTime() - 365 * 86400000).toISOString().split("T")[0];
      const dataInicio24m = new Date(dataFimDate.getTime() - 730 * 86400000).toISOString().split("T")[0];
      // ── Cache persistente: mês fechado de unidade única ──
      if (unitFilter && extIds.length === 1) {
        const persistentCache = await getCachedVisaoGeralByPeriod(unitFilter, dataInicio, dataFim);
        if (persistentCache) {
          console.log(`[visaoGeral] cache persistente hit unitId=${unitFilter} ${dataInicio}..${dataFim}`);
          return persistentCache;
        }
      }
      // ── Cache em memória (10 min) ──
      const vgCacheKey = `vg-${extIds.join(",")}-${dataInicio}-${dataFim}`;
      const vgCached = getCached(visaoGeralCache, vgCacheKey);
      if (vgCached) { console.log("[visaoGeral] cache hit"); return vgCached; }

      const unitCondV = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `v.unidade_id = ${extIds[0]}`
        : `v.unidade_id IN (${extIds.join(",")})`;
      const unitCondSimple = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `c.unidade_id = ${extIds[0]}`
        : `c.unidade_id IN (${extIds.join(",")})`;

      // Subquery: ultima venda por cliente na unidade (usa dataFim como REF, igual ao sistema de referencia)
      // Isso alinha o universo com o sistema de referencia que usa MAX(vendas.data_criacao) por unidade
      const ultimaVendaSubquery = `(
        SELECT v.cliente, MAX(DATE(v.data_criacao)) as ultima_venda
        FROM sync_vendas v
        WHERE ${unitCondV}
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
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
        FROM sync_vendas v
        WHERE ${unitCondV}
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
          AND v.cliente IS NOT NULL AND v.cliente != 2
          AND DATE(v.data_criacao) >= '${dataInicio24m}'
      )`;

      // Visitas históricas por cliente (total ever, para classificação de perfil)
      const visitasHistoricasSubquery = `(
        SELECT v.cliente, COUNT(*) as total_visitas
        FROM sync_vendas v
        WHERE ${unitCondV}
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
          AND v.cliente IS NOT NULL AND v.cliente != 2
        GROUP BY v.cliente
      )`;

      // Clientes do período selecionado (para: clientes únicos, novos, resgatados)
      const clientesPeriodoSubquery = `(
        SELECT DISTINCT v.cliente
        FROM sync_vendas v
        WHERE ${unitCondV}
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
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
        queryLocal<{
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
          LEFT JOIN ${visitasHistoricasSubquery} vh ON vh.cliente = bs.cliente
        `),
        // ── Por Perfil: Base S 12m, classificada por visitas históricas ─────────
        // Ocasional=2-3, Fiel=7-12, One-shot=1, Regular=4-6, Recorrente>12
        queryLocal<{ one_shot: number; ocasional: number; regular: number; fiel: number; recorrente: number; total: number }>(`
          SELECT
            COUNT(DISTINCT CASE WHEN vh.total_visitas = 1 THEN bs.cliente END) as one_shot,
            COUNT(DISTINCT CASE WHEN vh.total_visitas BETWEEN 2 AND 3 THEN bs.cliente END) as ocasional,
            COUNT(DISTINCT CASE WHEN vh.total_visitas BETWEEN 4 AND 6 THEN bs.cliente END) as regular,
            COUNT(DISTINCT CASE WHEN vh.total_visitas BETWEEN 7 AND 12 THEN bs.cliente END) as fiel,
            COUNT(DISTINCT CASE WHEN vh.total_visitas > 12 THEN bs.cliente END) as recorrente,
            COUNT(DISTINCT bs.cliente) as total
          FROM ${baseS12mSubquery} bs
          LEFT JOIN ${visitasHistoricasSubquery} vh ON vh.cliente = bs.cliente
        `),
        // ── Por Cadência: Base S 12m com >=3 visitas, por dias sem visitar (usando ultima_venda) ──
        // Perdido=>90d, Regular=31-60d, Em risco=61-90d, Espaçando=91-180d, Mto frequente=<=30d
        queryLocal<{ perdido: number; regular: number; em_risco: number; espacando: number; mto_frequente: number; total: number }>(`
          SELECT
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) > 90 THEN bs.cliente END) as perdido,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) BETWEEN 31 AND 60 THEN bs.cliente END) as regular,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) BETWEEN 61 AND 90 THEN bs.cliente END) as em_risco,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) BETWEEN 91 AND 180 THEN bs.cliente END) as espacando,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) <= 30 THEN bs.cliente END) as mto_frequente,
            COUNT(DISTINCT bs.cliente) as total
          FROM ${baseS12mSubquery} bs
          JOIN sync_clientes c ON c.id = bs.cliente
          LEFT JOIN ${visitasHistoricasSubquery} vh ON vh.cliente = bs.cliente
          WHERE c.status = 1 AND vh.total_visitas >= 3
        `),
        // ── Status 12m: Base S 12m por faixas de dias (usando ultima_venda) ───────────────────────
        // ≤60d saudavel, 61-90d em risco (excl. one-shots), >90d perdido (excl. one-shots)
        queryLocal<{ perdido: number; em_risco: number; saudavel: number; total: number }>(`
          SELECT
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) > 90 AND COALESCE(vh.total_visitas, 0) > 1 THEN bs.cliente END) as perdido,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) BETWEEN 61 AND 90 AND COALESCE(vh.total_visitas, 0) > 1 THEN bs.cliente END) as em_risco,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) <= 60 THEN bs.cliente END) as saudavel,
            COUNT(DISTINCT bs.cliente) as total
          FROM ${baseS12mSubquery} bs
          JOIN sync_clientes c ON c.id = bs.cliente
          LEFT JOIN ${visitasHistoricasSubquery} vh ON vh.cliente = bs.cliente
          WHERE c.status = 1
        `),
        // ── One-Shot: Base S 12m com 1 visita histórica (usando ultima_venda) ──────────────────────────────────
        queryLocal<{ total: number; aguardando: number; em_risco: number; perdido: number }>(`
          SELECT
            COUNT(DISTINCT bs.cliente) as total,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) <= 60 THEN bs.cliente END) as aguardando,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) BETWEEN 46 AND 90 THEN bs.cliente END) as em_risco,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) > 90 THEN bs.cliente END) as perdido
          FROM ${baseS12mSubquery} bs
          JOIN sync_clientes c ON c.id = bs.cliente
          LEFT JOIN ${visitasHistoricasSubquery} vh ON vh.cliente = bs.cliente
          WHERE c.status = 1 AND vh.total_visitas = 1
        `),
        // ── Clientes únicos no período selecionado ──────────────────────────────
        queryLocal<{ total: number }>(`
          SELECT COUNT(DISTINCT cp.cliente) as total
          FROM ${clientesPeriodoSubquery} cp
        `),
        // ── Novos no período: clientes cuja PRIMEIRA VENDA na unidade ocorreu no período ──────────────────────────
        // (não usa data_criacao do cliente pois ele pode ter sido cadastrado antes mas visitado pela 1a vez no período)
        queryLocal<{ total: number; recorrentes: number; one_shot_total: number }>(`
          SELECT
            COUNT(DISTINCT pv.cliente) as total,
            SUM(CASE WHEN vh.total_visitas > 1 THEN 1 ELSE 0 END) as recorrentes,
            SUM(CASE WHEN vh.total_visitas = 1 OR vh.total_visitas IS NULL THEN 1 ELSE 0 END) as one_shot_total
          FROM (
            SELECT v.cliente, MIN(DATE(v.data_criacao)) as primeira_visita
            FROM sync_vendas v
            WHERE ${unitCondV}
              AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
              AND v.cliente IS NOT NULL AND v.cliente != 2
            GROUP BY v.cliente
            HAVING MIN(DATE(v.data_criacao)) >= '${dataInicio}' AND MIN(DATE(v.data_criacao)) <= '${dataFim}'
          ) pv
          LEFT JOIN ${visitasHistoricasSubquery} vh ON vh.cliente = pv.cliente
        `),
        // ── Resgatados no período ────────────────────────────────────────────────
        // Clientes que: existiam antes do período, tinham parado de vir (>90d antes do início),
        // e voltaram a visitar no período selecionado
        queryLocal<{ total: number }>(`
          SELECT COUNT(DISTINCT cp.cliente) as total
          FROM ${clientesPeriodoSubquery} cp
          JOIN sync_clientes c ON c.id = cp.cliente
          JOIN (
            SELECT v2.cliente, MAX(DATE(v2.data_criacao)) as ultima_antes
            FROM sync_vendas v2
            WHERE v2.unidade_id IN (${extIds.length > 0 ? extIds.join(",") : "0"})
              AND v2.comanda_temp = 0 AND v2.cancelado_motivo IS NULL AND v2.status = 1
              AND v2.cliente IS NOT NULL AND v2.cliente != 2
              AND DATE(v2.data_criacao) < '${dataInicio}'
            GROUP BY v2.cliente
          ) ult ON ult.cliente = cp.cliente
          WHERE c.status = 1
            AND DATE(c.data_criacao) < '${dataInicio}'
            AND DATEDIFF('${dataInicio}', ult.ultima_antes) > 90
        `),
        // Cadencia Individual: Base S 12m com logica de ratio
        // Universo: clientes que visitaram nos ultimos 12m (inclui one-shots como 1a Vez)
        // Cadencia habitual: media dos intervalos entre visitas (historico completo)
        // ratio = DATEDIFF(dataFim, ultima_venda) / cadencia_habitual
        // Assiduo: ratio <=0.8 | Regular: 0.8-1.2 | Espacando: 1.2-1.8 | Em Risco: 1.8-2.5 | Perdido: >2.5
        // 1a Vez: 1 visita historica (one-shot, sem cadencia calculavel)
        queryLocal<{ assiduo: number; regular: number; espacando: number; primeira_vez: number; em_risco: number; perdido: number; total: number }>(`
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
              COALESCE(vh_hist.total_visitas, 1) as total_visitas_hist,
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
              FROM sync_vendas v
              WHERE ${unitCondV}
                AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
                AND v.cliente IS NOT NULL AND v.cliente != 2
                AND DATE(v.data_criacao) >= '${dataInicio12m}' AND DATE(v.data_criacao) <= '${dataFim}'
            ) bs
            LEFT JOIN (
              SELECT v.cliente, COUNT(*) as total_visitas
              FROM sync_vendas v
              WHERE ${unitCondV}
                AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
                AND v.cliente IS NOT NULL AND v.cliente != 2
              GROUP BY v.cliente
            ) vh_hist ON vh_hist.cliente = bs.cliente
            LEFT JOIN (
              SELECT sub.cliente, AVG(sub.diff) as cadencia_habitual
              FROM (
                SELECT
                  v.cliente,
                  DATEDIFF(DATE(v.data_criacao), LAG(DATE(v.data_criacao)) OVER (PARTITION BY v.cliente ORDER BY v.data_criacao)) as diff
                FROM sync_vendas v
                WHERE ${unitCondV}
                  AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
                  AND v.cliente IS NOT NULL AND v.cliente != 2
              ) sub
              WHERE sub.diff IS NOT NULL AND sub.diff > 0
              GROUP BY sub.cliente
            ) iv ON iv.cliente = bs.cliente
            LEFT JOIN (
              SELECT v.cliente, MAX(DATE(v.data_criacao)) as ultima_venda
              FROM sync_vendas v
              WHERE ${unitCondV}
                AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
                AND v.cliente IS NOT NULL AND v.cliente != 2
              GROUP BY v.cliente
            ) uvc ON uvc.cliente = bs.cliente
          ) ci
        `),
        // ── Movimento mensal ─────────────────────────────────────────────────────
        queryLocal<{ mes: string; atendidos: number; em_risco: number; resgatados: number }>(`
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
          FROM sync_vendas v
          JOIN sync_clientes c ON c.id = v.cliente
          LEFT JOIN ${ultimaVendaSubquery} uv_mes ON uv_mes.cliente = v.cliente
          LEFT JOIN (
            SELECT v2.cliente, MAX(DATE(v2.data_criacao)) as ultima_antes
            FROM sync_vendas v2
            WHERE ${unitCondV.replace(/\bv\./g, 'v2.')}
              AND v2.comanda_temp = 0 AND v2.cancelado_motivo IS NULL AND v2.status = 1
              AND v2.cliente IS NOT NULL AND v2.cliente != 2
              AND DATE(v2.data_criacao) < '${dataInicio}'
            GROUP BY v2.cliente
          ) ult_antes ON ult_antes.cliente = v.cliente
          WHERE ${unitCondV}
            AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
            AND v.cliente IS NOT NULL AND v.cliente != 2
            AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
          GROUP BY mes ORDER BY mes
        `),
        // ── Entradas mensais ─────────────────────────────────────────────────────
        queryLocal<{ mes: string; novos: number; resgatados: number }>(`
          SELECT
            DATE_FORMAT(v.data_criacao, '%Y-%m') as mes,
            COUNT(DISTINCT CASE
              WHEN DATE(c.data_criacao) >= '${dataInicio}'
              THEN v.cliente END) as novos,
            COUNT(DISTINCT CASE
              WHEN DATE(c.data_criacao) < '${dataInicio}'
                AND DATEDIFF(DATE(v.data_criacao), ult_antes_em.ultima_antes) > 90
              THEN v.cliente END) as resgatados
          FROM sync_vendas v
          JOIN sync_clientes c ON c.id = v.cliente
          LEFT JOIN (
            SELECT v2.cliente, MAX(DATE(v2.data_criacao)) as ultima_antes
            FROM sync_vendas v2
            WHERE ${unitCondV.replace(/\bv\./g, 'v2.')}
              AND v2.comanda_temp = 0 AND v2.cancelado_motivo IS NULL AND v2.status = 1
              AND v2.cliente IS NOT NULL AND v2.cliente != 2
              AND DATE(v2.data_criacao) < '${dataInicio}'
            GROUP BY v2.cliente
          ) ult_antes_em ON ult_antes_em.cliente = v.cliente
          WHERE ${unitCondV}
            AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
            AND v.cliente IS NOT NULL AND v.cliente != 2
            AND c.status = 1
            AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
          GROUP BY mes ORDER BY mes
        `),
            // ── Risco mensal ─────────────────────────────────────────────────────
        // Para cada mês do período, calcula o estado dos clientes da base S
        // usando a última visita ATE o fim daquele mês (não a global).
        // Abordagem: para cada (cliente, mês), pega o MAX(data_criacao) <= LAST_DAY(mês)
        queryLocal<{ mes: string; em_risco: number; churn_novos: number; total_ativos_mes: number }>(`
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
            FROM sync_vendas v
            WHERE ${unitCondV}
              AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
              AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
          ) meses
          JOIN ${baseS12mSubquery} bs ON 1=1
          -- Para cada cliente x mes: MAX(data_criacao) <= fim_mes (ultima visita ate aquele mes)
          LEFT JOIN (
            SELECT
              all_v.cliente,
              DATE_FORMAT(m2.data_criacao, '%Y-%m') as mes,
              MAX(DATE(all_v.data_criacao)) as ultima_ate_mes
            FROM sync_vendas all_v
            JOIN (
              SELECT DISTINCT DATE_FORMAT(v3.data_criacao, '%Y-%m') as mes_ref,
                     LAST_DAY(v3.data_criacao) as fim_mes,
                     v3.data_criacao
              FROM sync_vendas v3
              WHERE ${unitCondV.replace(/\bv\./g, 'v3.')}
                AND v3.comanda_temp = 0 AND v3.cancelado_motivo IS NULL AND v3.status = 1
                AND DATE(v3.data_criacao) >= '${dataInicio}' AND DATE(v3.data_criacao) <= '${dataFim}'
            ) m2 ON DATE(all_v.data_criacao) <= m2.fim_mes
            WHERE ${unitCondV.replace(/\bv\./g, 'all_v.')}
              AND all_v.comanda_temp = 0 AND all_v.cancelado_motivo IS NULL AND all_v.status = 1
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
        queryLocal<{ colaborador_nome: string; total: number; saudavel: number; em_risco: number; perdido: number }>(`
          SELECT
            uu.nome as colaborador_nome,
            COUNT(DISTINCT v.cliente) as total,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', uv4.ultima_venda) <= 60 THEN v.cliente END) as saudavel,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', uv4.ultima_venda) BETWEEN 61 AND 90 AND COALESCE(vh4.total_visitas, 0) > 1 THEN v.cliente END) as em_risco,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', uv4.ultima_venda) > 90 AND COALESCE(vh4.total_visitas, 0) > 1 THEN v.cliente END) as perdido
          FROM sync_vendas v
          JOIN sync_usuarios uu ON v.usuario = uu.id
          LEFT JOIN ${ultimaVendaSubquery} uv4 ON uv4.cliente = v.cliente
          LEFT JOIN ${visitasHistoricasSubquery} vh4 ON vh4.cliente = v.cliente
          WHERE ${unitCondV}
            AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
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

      const result_vg = {
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
      setCached(visaoGeralCache, vgCacheKey, result_vg);
      return result_vg;
    }),

  // ── One-Shot ─────────────────────────────────────────────────────────────────────────────────
  // Lógica alinhada com sistema de referência:
  // - Universo: Base S 12m com exatamente 1 visita histórica
  // - Grupos por recência (dias desde última visita até dataFim):
  //   Aguardando ≤45d | Em Risco 46-90d | Provavelmente Perdido +91d
  // - KPIs: Total, % da base, Em risco+perdido, Aguardando
  oneShot: sysUserProcedure
    .input(baseInput.extend({
      status: z.enum(["todos", "aguardando", "em_risco", "perdido"]).optional(),
      search: z.string().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );
      const dataFim = input.dataFim || new Date().toISOString().split("T")[0];
      const dataFimDate = new Date(dataFim + "T00:00:00Z");
      const dataInicio12m = new Date(dataFimDate.getTime() - 365 * 86400000).toISOString().split("T")[0];
      const unitCondV = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `v.unidade_id = ${extIds[0]}`
        : `v.unidade_id IN (${extIds.join(",")})`;
      const unitCondSimple = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `c.unidade_id = ${extIds[0]}`
        : `c.unidade_id IN (${extIds.join(",")})`;

      // Universo Base S 12m: última venda nos 12m antes de dataFim
      const ultimaVendaSubquery = `(
        SELECT v.cliente, MAX(DATE(v.data_criacao)) as ultima_venda
        FROM sync_vendas v
        WHERE ${unitCondV}
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
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
        FROM sync_vendas v
        WHERE ${unitCondV}
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
          AND v.cliente IS NOT NULL AND v.cliente != 2
        GROUP BY v.cliente
      )`;

      const [totalBaseRows, oneShotRows] = await Promise.all([
        // Total da base S 12m (para calcular % da base)
        queryLocal<{ total: number }>(`
          SELECT COUNT(DISTINCT bs.cliente) as total
          FROM ${baseS12mSubquery} bs
          JOIN sync_clientes c ON c.id = bs.cliente
          WHERE c.status = 1
        `),
        // One-shots: Base S 12m com 1 visita histórica
        queryLocal<{
          id: number; nome: string; telefone: string;
          data_criacao: string; ultima_venda_dt: string; total_gasto: number;
        }>(`
          SELECT c.id, c.nome, c.telefone,
                 DATE(c.data_criacao) as data_criacao,
                 bs.ultima_venda as ultima_venda_dt,
                 COALESCE((
                   SELECT SUM(v2.valor_total) FROM sync_vendas v2
                   WHERE v2.unidade_id IN (${extIds.length > 0 ? extIds.join(",") : "0"})
                     AND v2.cliente = c.id AND v2.comanda_temp = 0
                     AND v2.cancelado_motivo IS NULL AND v2.status = 1
                 ), 0) as total_gasto
          FROM ${baseS12mSubquery} bs
          JOIN sync_clientes c ON c.id = bs.cliente
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
  cadencia: sysUserProcedure
    .input(baseInput)
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
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
        const unitIn = extIds.length === 1 ? `v.unidade_id = ${extIds[0]}` : `v.unidade_id IN (${extIds.join(",")})`;
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
                FROM sync_vendas v
                WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
                  AND v.cliente IS NOT NULL AND v.cliente!=2
                  AND DATE(v.data_criacao) <= ?
                GROUP BY v.cliente HAVING COUNT(*) >= 2
              ) iv
              JOIN (
                SELECT v.cliente, MAX(DATE(v.data_criacao)) as ultima_venda
                FROM sync_vendas v
                WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
                  AND v.cliente IS NOT NULL AND v.cliente!=2
                  AND DATE(v.data_criacao) <= ?
                GROUP BY v.cliente
              ) uvc ON uvc.cliente = iv.cliente
              JOIN (
                SELECT DISTINCT v.cliente
                FROM sync_vendas v
                WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
                  AND v.cliente IS NOT NULL AND v.cliente!=2
                  AND DATE(v.data_criacao) >= ? AND DATE(v.data_criacao) <= ?
              ) bs ON bs.cliente = iv.cliente
              JOIN sync_clientes c ON c.id = iv.cliente
              WHERE c.status=1 AND iv.cadencia_habitual IS NOT NULL AND iv.cadencia_habitual > 0
            ) ratios
          `,
          params: [refDate, refDate, refDate, ref12m, refDate],
        };
      };

      // Grupos do período atual
      const { sql: sqlAtual, params: paramsAtual } = buildRatioSQL(dataFim, dataInicio12m);
      const gruposRows = await queryLocal<{
        assiduo: number; regular: number; espacando: number; em_risco: number; perdido: number;
        media_cadencia: number; total: number;
      }>(sqlAtual, paramsAtual);
      const g = gruposRows[0] || { assiduo: 0, regular: 0, espacando: 0, em_risco: 0, perdido: 0, media_cadencia: 0, total: 0 };

      // 1ª Vez (one-shots na base 12m)
      const unitIn = extIds.length === 1 ? `v.unidade_id = ${extIds[0]}` : `v.unidade_id IN (${extIds.join(",")})`;
      const primeiraVezRows = await queryLocal<{ total: number }>(`
        SELECT COUNT(*) as total
        FROM (
          SELECT v.cliente, COUNT(*) as tv
          FROM sync_vendas v
          WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
            AND v.cliente IS NOT NULL AND v.cliente!=2
          GROUP BY v.cliente HAVING tv = 1
        ) vh
        JOIN (
          SELECT DISTINCT v.cliente
          FROM sync_vendas v
          WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
            AND v.cliente IS NOT NULL AND v.cliente!=2
            AND DATE(v.data_criacao) >= ? AND DATE(v.data_criacao) <= ?
        ) bs ON bs.cliente = vh.cliente
        JOIN sync_clientes c ON c.id = vh.cliente WHERE c.status=1
      `, [dataInicio12m, dataFim]);
      const primeiraVez = Number(primeiraVezRows[0]?.total ?? 0);

      // Evolução mensal dos últimos 12 meses
      // Paralelizar os 12 meses de evolução de cadência
      const evolucao = await Promise.all(Array.from({ length: 12 }, (_, idx) => {
        const i = 11 - idx;
        const d = new Date(dataFim + "T12:00:00Z");
        d.setMonth(d.getMonth() - i);
        const ano = d.getUTCFullYear();
        const mes = d.getUTCMonth() + 1;
        const lastDay = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
        const refDate = `${ano}-${String(mes).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;
        const ref12m = new Date(Date.UTC(ano - 1, mes - 1, lastDay)).toISOString().split("T")[0];
        const { sql, params } = buildRatioSQL(refDate, ref12m);
        return queryLocal<{ assiduo: number; regular: number; espacando: number; em_risco: number; perdido: number; total: number }>(sql, params)
          .then(rows => {
            const r = rows[0] || { assiduo: 0, regular: 0, espacando: 0, em_risco: 0, perdido: 0, total: 0 };
            return {
              mes: `${String(mes).padStart(2,"0")}/${String(ano).slice(2)}`,
              assiduo: Number(r.assiduo),
              regular: Number(r.regular),
              espacando: Number(r.espacando),
              em_risco: Number(r.em_risco),
              perdido: Number(r.perdido),
              total: Number(r.total),
            };
          })
          .catch(() => ({ mes: `${String(mes).padStart(2,"0")}/${String(ano).slice(2)}`, assiduo: 0, regular: 0, espacando: 0, em_risco: 0, perdido: 0, total: 0 }));
      }));

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
  churn: sysUserProcedure
    .input(baseInput.extend({
      periodo: z.enum(["30d", "60d", "90d", "6m", "12m"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { extIds, unitFilter } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );

      const diasPeriodo = input.periodo === "30d" ? 30
        : input.periodo === "60d" ? 60
        : input.periodo === "6m" ? 180
        : input.periodo === "12m" ? 365
        : 90;

      const dataInicio = input.dataInicio || new Date(Date.now() - diasPeriodo * 86400000).toISOString().split("T")[0];
      const dataFim = input.dataFim || new Date().toISOString().split("T")[0];
      // ── Cache persistente: mês fechado de unidade única ──
      if (unitFilter && extIds.length === 1) {
        const persistentCache = await getCachedChurnByPeriod(unitFilter, dataInicio, dataFim);
        if (persistentCache) {
          console.log(`[churn] cache persistente hit unitId=${unitFilter} ${dataInicio}..${dataFim}`);
          return persistentCache;
        }
      }
      const churnCacheKey = `churn-${extIds.join(",")}-${dataInicio}-${dataFim}-${input.periodo||"90d"}`;
      const churnCached = getCached(churnCache, churnCacheKey);
      if (churnCached) { console.log("[churn] cache hit"); return churnCached; }

      if (extIds.length === 0) {
        return {
          resumo: { total: 0, ativos: 0, emRisco: 0, perdidos: 0, oneShots: 0, taxaRetencao: 0, taxaChurn: 0, mediaVisitas: 0, ticketMedio: 0, receitaPerdida: 0 },
          kpis: { churnGeral: 0, churnGeralPct: 0, churnFidelizados: 0, churnFidelizadosPct: 0, baseFidelizados: 0, churnOneShot: 0, churnOneShotPct: 0, baseOneShot: 0, resgatados: 0, emRisco45_90: 0 },
          perdidos: [], emRisco: [], resgatados: [], churnMensal: [], perdidosRecentes: [],
          periodo: { dataInicio, dataFim, diasPeriodo },
        };
      }

      const unitIn = extIds.length === 1 ? `v.unidade_id = ${extIds[0]}` : `v.unidade_id IN (${extIds.join(",")})`;

      // ── Passo 1: Base de churn = clientes que visitaram nos últimos 620d ────────
      // Lógica alinhada ao sistema de referência:
      //   Base = visitaram nos últimos 620d (≈20 meses) antes de dataFim
      //   Perdido = sem visita nos últimos 45d (75% da janela de 60d)
      //   Fidelizados = ≥3 visitas históricas
      //   One-shot = 1 visita histórica
      const dataBase620 = new Date(new Date(dataFim + "T12:00:00Z").getTime() - 620 * 86400000)
        .toISOString().split("T")[0];
      const unitIn2 = extIds.length === 1 ? `v2.unidade_id = ${extIds[0]}` : `v2.unidade_id IN (${extIds.join(",")})`;

      const clientesBase = await queryLocal<{
        cliente_id: number; nome: string; telefone: string;
        ultima_visita: Date; tv_hist: number; ticket: number;
      }>(`
        SELECT
          c.id as cliente_id, c.nome, c.telefone, c.ultima_visita,
          COALESCE(tvh.tv, 0) as tv_hist,
          COALESCE((
            SELECT SUM(sv.valor_total) FROM sync_vendas sv
            WHERE sv.cliente = c.id AND sv.comanda_temp=0 AND sv.cancelado_motivo IS NULL AND sv.status!=0
          ), 0) as ticket
        FROM (
          SELECT DISTINCT v.cliente
          FROM sync_vendas v
          WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
            AND v.cliente IS NOT NULL AND v.cliente!=2
            AND DATE(v.data_criacao) >= '${dataBase620}' AND DATE(v.data_criacao) <= '${dataFim}'
        ) bp
        JOIN sync_clientes c ON c.id = bp.cliente
        LEFT JOIN (
          SELECT v2.cliente, COUNT(*) as tv
          FROM sync_vendas v2
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
      const resgatadosIds = await queryLocal<{ cliente_id: number; ultima_antes: Date }>(`
        SELECT bp.cliente as cliente_id, MAX(DATE(v_ant.data_criacao)) as ultima_antes
        FROM (
          SELECT DISTINCT v.cliente
          FROM sync_vendas v
          WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
            AND v.cliente IS NOT NULL AND v.cliente!=2
            AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
        ) bp
        JOIN sync_vendas v_ant ON v_ant.cliente = bp.cliente
        WHERE ${extIds.length === 1 ? `v_ant.unidade_id = ${extIds[0]}` : `v_ant.unidade_id IN (${extIds.join(",")})`}
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
      // Gerar os 12 meses anteriores a dataFim em PARALELO
      const dataFimDate = new Date(dataFim + "T12:00:00Z");
      const churnMensal = await Promise.all(Array.from({ length: 12 }, (_, idx) => {
        const i = 11 - idx;
        const refDate = new Date(dataFimDate);
        refDate.setUTCMonth(refDate.getUTCMonth() - i);
        const lastDay = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() + 1, 0));
        const refStr = lastDay.toISOString().split("T")[0];
        const base620Str = new Date(lastDay.getTime() - 620 * 86400000).toISOString().split("T")[0];
        const mesLabel = `${lastDay.getUTCFullYear()}-${String(lastDay.getUTCMonth() + 1).padStart(2, "0")}`;
        return (async () => {
          try {
            const [snap] = await queryLocal<{
            total: number; perdidos: number; fidelizados: number; perdidosFid: number;
          }>(`
            SELECT
              COUNT(*) as total,
              SUM(CASE WHEN DATEDIFF('${refStr}', c.ultima_visita) > 45 THEN 1 ELSE 0 END) as perdidos,
              SUM(CASE WHEN COALESCE(tvh.tv,0) >= 3 THEN 1 ELSE 0 END) as fidelizados,
              SUM(CASE WHEN COALESCE(tvh.tv,0) >= 3 AND DATEDIFF('${refStr}', c.ultima_visita) > 45 THEN 1 ELSE 0 END) as perdidosFid
            FROM (
              SELECT DISTINCT v.cliente FROM sync_vendas v
              WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
                AND v.cliente IS NOT NULL AND v.cliente!=2
                AND DATE(v.data_criacao) >= '${base620Str}' AND DATE(v.data_criacao) <= '${refStr}'
            ) bp
            JOIN sync_clientes c ON c.id = bp.cliente
            LEFT JOIN (
              SELECT v2.cliente, COUNT(*) as tv FROM sync_vendas v2
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
            return {
              mes: mesLabel,
              churnPct: t > 0 ? Math.round(p / t * 1000) / 10 : 0,
              fidPct: f > 0 ? Math.round(pf / f * 1000) / 10 : 0,
              total: t, perdidos: p, fidelizados: f, perdidosFid: pf,
            };
          } catch {
            return { mes: mesLabel, churnPct: 0, fidPct: 0, total: 0, perdidos: 0, fidelizados: 0, perdidosFid: 0 };
          }
        })();
      }));

      const result_churn = {
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
      setCached(churnCache, churnCacheKey, result_churn);
      return result_churn;
    }),
    // ── Churn por barbeiro ────────────────────────────────────────────────────────
  churnPorBarbeiro: sysUserProcedure
    .input(baseInput.extend({
      periodo: z.enum(["30d", "60d", "90d", "6m", "12m"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );
      if (extIds.length === 0) return { barbeiros: [] };

      const dataFim = input.dataFim || new Date().toISOString().split("T")[0];
      const base620Str = new Date(new Date(dataFim + "T12:00:00Z").getTime() - 620 * 86400000).toISOString().split("T")[0];
      const resgate90Str = new Date(new Date(dataFim + "T12:00:00Z").getTime() - 90 * 86400000).toISOString().split("T")[0];

      const unitIn = extIds.length === 1 ? `v.unidade_id = ${extIds[0]}` : `v.unidade_id IN (${extIds.join(",")})`;
      const unitIn2 = extIds.length === 1 ? `v.unidade_id = ${extIds[0]}` : `v.unidade_id IN (${extIds.join(",")})`;
      const unitIn3 = extIds.length === 1 ? `v.unidade_id = ${extIds[0]}` : `v.unidade_id IN (${extIds.join(",")})`;
      const unitInVh = extIds.length === 1 ? `vh.unidade_id = ${extIds[0]}` : `vh.unidade_id IN (${extIds.join(",")})`;

      // Query 1: clientes da base (620d) com ultima_visita e total de visitas históricas
      // NOTA: sync_vendas.usuario = operador do PDV (caixa), NÃO o barbeiro executor.
      // O barbeiro executor está em sync_vendas_produtos.colaborador.
      // Por isso usamos JOIN com sync_vendas_produtos para filtrar apenas vendas com barbeiro.
      const clientesBase = await queryLocal<{
        cliente_id: number;
        ultima_visita: Date | string;
        tv_hist: number;
      }>(`
        SELECT
          c.id as cliente_id,
          c.ultima_visita,
          COUNT(DISTINCT vh.id) as tv_hist
        FROM sync_clientes c
        JOIN sync_vendas vh ON vh.cliente = c.id
        JOIN sync_vendas_produtos vp ON vp.venda = vh.id
        JOIN sync_usuarios uuh ON uuh.id = vp.colaborador AND uuh.visivel_agenda != 'nenhuma'
        WHERE ${unitInVh}
          AND vh.comanda_temp=0 AND vh.cancelado_motivo IS NULL AND vh.status!=0
          AND vh.cliente IS NOT NULL AND vh.cliente!=2
          AND c.status = 1
        GROUP BY c.id, c.ultima_visita
        HAVING MAX(DATE(vh.data_criacao)) >= '${base620Str}'
          AND MAX(DATE(vh.data_criacao)) <= '${dataFim}'
      `);

      if (clientesBase.length === 0) return { barbeiros: [] };

      const clienteIds = clientesBase.map(r => r.cliente_id);
      const idList = clienteIds.join(",");

      // Query 2: último barbeiro executor de cada cliente via sync_vendas_produtos.colaborador
      // Agrupa por cliente+colaborador e pega o MAX(data_criacao) da venda
      const ultBarbRows = await queryLocal<{
        cliente_id: number;
        colaborador_id: number;
        colaborador_nome: string;
        max_dt: string;
      }>(`
        SELECT v.cliente as cliente_id, uu.id as colaborador_id, uu.nome as colaborador_nome, MAX(v.data_criacao) as max_dt
        FROM sync_vendas v
        JOIN sync_vendas_produtos vp ON vp.venda = v.id
        JOIN sync_usuarios uu ON uu.id = vp.colaborador AND uu.visivel_agenda != 'nenhuma'
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
      const resgatadosRows = await queryLocal<{ cliente_id: number }>(`
        SELECT DISTINCT v.cliente as cliente_id
        FROM sync_vendas v
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
  cohort: sysUserProcedure
    .input(baseInput.extend({ colaboradorId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );
      if (extIds.length === 0) {
        return { cohortMensal: [], analiseNovos: null, distribuicao: null, cohortHistorico: [], cohortPorBarbeiro: [] };
      }
      const unitIn = extIds.length === 1 ? `v.unidade_id = ${extIds[0]}` : `v.unidade_id IN (${extIds.join(",")})`;
      const unitIn2 = extIds.length === 1 ? `v2.unidade_id = ${extIds[0]}` : `v2.unidade_id IN (${extIds.join(",")})`;
      const dataIniRaw = input.dataInicio ? new Date(input.dataInicio) : new Date(Date.now() - 90 * 86400000);
      const dataFimRaw = input.dataFim ? new Date(input.dataFim) : new Date();
      const dataIniStr = `${dataIniRaw.getFullYear()}-${String(dataIniRaw.getMonth()+1).padStart(2,"0")}-${String(dataIniRaw.getDate()).padStart(2,"0")}`;
      const dataFimStr = `${dataFimRaw.getFullYear()}-${String(dataFimRaw.getMonth()+1).padStart(2,"0")}-${String(dataFimRaw.getDate()).padStart(2,"0")}`;
      const cohortCacheKey = `cohort-${extIds.join(",")}-${dataIniStr}-${dataFimStr}-${input.colaboradorId||""}`;
      const cohortCached = getCached(cohortCache, cohortCacheKey);
      if (cohortCached) { console.log("[cohort] cache hit"); return cohortCached; }

      // ── 1) Clientes novos no período (1ª visita histórica dentro do período) ──
      // NOTA: sync_vendas.usuario = operador do PDV (caixa), NÃO o barbeiro executor.
      // O barbeiro executor está em sync_vendas_produtos.colaborador.
      // Os subqueries de barbeiro_id e barbeiro_nome usam sync_vendas_produtos filtrado por unidade
      // para garantir que apenas colaboradores da unidade selecionada apareçam no seletor.
      const unitInVp = extIds.length === 1 ? `vp.unidade_id = ${extIds[0]}` : `vp.unidade_id IN (${extIds.join(",")})`;
      const novosRows = await queryLocal<{
        cliente_id: number;
        primeiraVisita: string | Date;
        mes: string;
        ticketPrimeira: number;
        barbeiro_id: number | null;
        barbeiro_nome: string | null;
      }>(`
        SELECT sub.cliente as cliente_id, sub.primeiraVisita, DATE_FORMAT(sub.primeiraVisita, '%Y-%m') as mes,
          sub.ticketPrimeira, sub.barbeiro_id, sub.barbeiro_nome
        FROM (
          SELECT v.cliente, MIN(DATE(v.data_criacao)) as primeiraVisita,
            (SELECT v2.valor_total FROM sync_vendas v2
             WHERE ${unitIn2} AND v2.cliente = v.cliente AND v2.comanda_temp=0
               AND v2.cancelado_motivo IS NULL AND v2.status!=0
             ORDER BY v2.data_criacao ASC LIMIT 1) as ticketPrimeira,
            (SELECT vp.colaborador FROM sync_vendas_produtos vp
             JOIN sync_vendas vv ON vv.id = vp.venda
             JOIN sync_usuarios uu3 ON uu3.id = vp.colaborador AND uu3.visivel_agenda != 'nenhuma'
             WHERE ${unitInVp} AND vv.cliente = v.cliente AND vv.comanda_temp=0
               AND vv.cancelado_motivo IS NULL AND vv.status!=0
             ORDER BY vv.data_criacao ASC LIMIT 1) as barbeiro_id,
            (SELECT uu3.nome FROM sync_vendas_produtos vp
             JOIN sync_vendas vv ON vv.id = vp.venda
             JOIN sync_usuarios uu3 ON uu3.id = vp.colaborador AND uu3.visivel_agenda != 'nenhuma'
             WHERE ${unitInVp} AND vv.cliente = v.cliente AND vv.comanda_temp=0
               AND vv.cancelado_motivo IS NULL AND vv.status!=0
             ORDER BY vv.data_criacao ASC LIMIT 1) as barbeiro_nome
          FROM sync_vendas v
          WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
            AND v.cliente IS NOT NULL AND v.cliente!=2
          GROUP BY v.cliente
          HAVING primeiraVisita >= '${dataIniStr}' AND primeiraVisita <= '${dataFimStr}'
        ) sub
      `);

      // Filtro de colaborador em Node.js (sem query extra ao banco)
      const novosRowsFiltrados = input.colaboradorId
        ? novosRows.filter(r => r.barbeiro_id === input.colaboradorId)
        : novosRows;
      if (novosRowsFiltrados.length === 0) {
        return { cohortMensal: [], analiseNovos: null, distribuicao: null, cohortHistorico: [], cohortPorBarbeiro: [] };
      }

      const clienteIds = novosRowsFiltrados.map(r => r.cliente_id);
      const idList = clienteIds.join(",");

      // ── 2) Todas as visitas posteriores desses clientes ──
      const visitasPost = await queryLocal<{
        cliente_id: number;
        data_visita: string | Date;
        total: number;
      }>(`
        SELECT v.cliente as cliente_id, DATE(v.data_criacao) as data_visita, v.valor_total as total
        FROM sync_vendas v
        WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
          AND v.cliente IN (${idList})
        ORDER BY v.cliente, v.data_criacao
      `);

      // Mapear visitas por cliente
      const visitasMap = new Map<number, Array<{ data: string; total: number }>>();
      for (const v of visitasPost) {
        const dt = v.data_visita instanceof Date
          ? `${v.data_visita.getUTCFullYear()}-${String(v.data_visita.getUTCMonth()+1).padStart(2,"0")}-${String(v.data_visita.getUTCDate()).padStart(2,"0")}`
          : String(v.data_visita).slice(0, 10);
        if (!visitasMap.has(v.cliente_id)) visitasMap.set(v.cliente_id, []);
        visitasMap.get(v.cliente_id)!.push({ data: dt, total: Number(v.total) });
      }

      // ── 3) Calcular métricas por cliente ──
      const hoje = new Date();
      const hojeMs = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());

      const clientesMes = new Map<string, Array<{
        clienteId: number; primeiraVisita: string; ticket: number;
        ret30: boolean; ret60: boolean; ret90: boolean;
        diasAte2a: number | null; totalVisitas: number;
        barbeiroId: number | null; barbeiroNome: string | null;
      }>>();

      for (const n of novosRowsFiltrados) {
        const pv = n.primeiraVisita instanceof Date
          ? `${n.primeiraVisita.getUTCFullYear()}-${String(n.primeiraVisita.getUTCMonth()+1).padStart(2,"0")}-${String(n.primeiraVisita.getUTCDate()).padStart(2,"0")}`
          : String(n.primeiraVisita).slice(0, 10);
        const pvMs = new Date(pv + "T12:00:00Z").getTime();
        const visitas = visitasMap.get(n.cliente_id) || [];
        const visitasPost2 = visitas.filter(v => v.data > pv);
        const ret30 = visitasPost2.some(v => new Date(v.data + "T12:00:00Z").getTime() <= pvMs + 30 * 86400000);
        const ret60 = visitasPost2.some(v => new Date(v.data + "T12:00:00Z").getTime() <= pvMs + 60 * 86400000);
        const ret90 = visitasPost2.some(v => new Date(v.data + "T12:00:00Z").getTime() <= pvMs + 90 * 86400000);
        const segunda = visitasPost2.length > 0 ? visitasPost2[0] : null;
        const diasAte2a = segunda ? Math.floor((new Date(segunda.data + "T12:00:00Z").getTime() - pvMs) / 86400000) : null;
        const totalVisitas = visitas.length;

        if (!clientesMes.has(n.mes)) clientesMes.set(n.mes, []);
        clientesMes.get(n.mes)!.push({
          clienteId: n.cliente_id, primeiraVisita: pv, ticket: Number(n.ticketPrimeira) || 0,
          ret30, ret60, ret90, diasAte2a, totalVisitas,
          barbeiroId: n.barbeiro_id ?? null,
          barbeiroNome: n.barbeiro_nome ?? null,
        });
      }

      // ── 4) Cohort Mensal (dias corridos) ──
      const cohortMensal = Array.from(clientesMes.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, clientes]) => {
          const novos = clientes.length;
          const r30 = clientes.filter(c => c.ret30).length;
          const r60 = clientes.filter(c => c.ret60).length;
          const r90 = clientes.filter(c => c.ret90).length;
          return {
            mes,
            novos,
            ret30: r30,
            ret60: r60,
            ret90: r90,
            pctRet30: novos > 0 ? Math.round(r30 / novos * 1000) / 10 : 0,
            pctRet60: novos > 0 ? Math.round(r60 / novos * 1000) / 10 : 0,
            pctRet90: novos > 0 ? Math.round(r90 / novos * 1000) / 10 : 0,
          };
        });

      // ── 5) Análise geral de novos ──
      const todosNovos = novosRowsFiltrados.length;
      const allClientes = Array.from(clientesMes.values()).flat();
      const totalRet30 = allClientes.filter(c => c.ret30).length;
      const totalRet60 = allClientes.filter(c => c.ret60).length;
      const recorrentes60 = allClientes.filter(c => c.totalVisitas >= 2).length;
      const diasAte2aList = allClientes.filter(c => c.diasAte2a !== null).map(c => c.diasAte2a!).sort((a,b)=>a-b);
      const mediana2a = diasAte2aList.length > 0 ? diasAte2aList[Math.floor(diasAte2aList.length / 2)] : null;
      const tickets = allClientes.filter(c => c.ticket > 0).map(c => c.ticket);
      const ticketMedio = tickets.length > 0 ? Math.round(tickets.reduce((a,b)=>a+b,0) / tickets.length * 100) / 100 : 0;

      // Total de clientes únicos no período (base para % novos)
      const baseRows = await queryLocal<{ total: number }>(`
        SELECT COUNT(DISTINCT v.cliente) as total
        FROM sync_vendas v
        WHERE ${unitIn} AND v.comanda_temp=0 AND v.cancelado_motivo IS NULL AND v.status!=0
          AND v.cliente IS NOT NULL AND v.cliente!=2
          AND DATE(v.data_criacao) >= '${dataIniStr}' AND DATE(v.data_criacao) <= '${dataFimStr}'
      `);
      const totalBase = Number(baseRows[0]?.total) || 1;

      const analiseNovos = {
        novos: todosNovos,
        pctNovos: Math.round(todosNovos / totalBase * 1000) / 10,
        retencao30: totalRet30,
        pctRetencao30: todosNovos > 0 ? Math.round(totalRet30 / todosNovos * 1000) / 10 : 0,
        recorrentes60,
        pctRecorrentes60: todosNovos > 0 ? Math.round(recorrentes60 / todosNovos * 1000) / 10 : 0,
        mediana2aVisita: mediana2a,
        ticketMedio1aVisita: ticketMedio,
      };

      // ── 6) Distribuição de retenção ──
      const aguardando = allClientes.filter(c => {
        const pvMs = new Date(c.primeiraVisita + "T12:00:00Z").getTime();
        const diasDesde = Math.floor((hojeMs - pvMs) / 86400000);
        return !c.ret30 && diasDesde <= 30;
      }).length;
      const ret30Exato = allClientes.filter(c => c.ret30 && !allClientes.filter(x => x.clienteId === c.clienteId && x.ret60)[0]?.ret60).length;
      // Simplificado: ret30 mas não ret60
      const ret30Only = allClientes.filter(c => c.ret30).length;
      const ret31_45 = allClientes.filter(c => {
        const pvMs = new Date(c.primeiraVisita + "T12:00:00Z").getTime();
        const visitas = visitasMap.get(c.clienteId) || [];
        const visitasPost2 = visitas.filter(v => v.data > c.primeiraVisita);
        return visitasPost2.some(v => {
          const d = new Date(v.data + "T12:00:00Z").getTime() - pvMs;
          return d > 30 * 86400000 && d <= 45 * 86400000;
        });
      }).length;
      const ret46_60 = allClientes.filter(c => {
        const pvMs = new Date(c.primeiraVisita + "T12:00:00Z").getTime();
        const visitas = visitasMap.get(c.clienteId) || [];
        const visitasPost2 = visitas.filter(v => v.data > c.primeiraVisita);
        return visitasPost2.some(v => {
          const d = new Date(v.data + "T12:00:00Z").getTime() - pvMs;
          return d > 45 * 86400000 && d <= 60 * 86400000;
        });
      }).length;
      const naoRetornou30 = allClientes.filter(c => {
        const pvMs = new Date(c.primeiraVisita + "T12:00:00Z").getTime();
        const diasDesde = Math.floor((hojeMs - pvMs) / 86400000);
        return !c.ret30 && diasDesde > 30 && diasDesde <= 60;
      }).length;
      const naoRetornou60 = allClientes.filter(c => {
        const pvMs = new Date(c.primeiraVisita + "T12:00:00Z").getTime();
        const diasDesde = Math.floor((hojeMs - pvMs) / 86400000);
        return !c.ret60 && diasDesde > 60;
      }).length;

      const distribuicao = {
        retornou30: totalRet30,
        pctRetornou30: todosNovos > 0 ? Math.round(totalRet30 / todosNovos * 1000) / 10 : 0,
        retornou31_45: ret31_45,
        pctRetornou31_45: todosNovos > 0 ? Math.round(ret31_45 / todosNovos * 1000) / 10 : 0,
        retornou46_60: ret46_60,
        pctRetornou46_60: todosNovos > 0 ? Math.round(ret46_60 / todosNovos * 1000) / 10 : 0,
        aguardando,
        pctAguardando: todosNovos > 0 ? Math.round(aguardando / todosNovos * 1000) / 10 : 0,
        naoRetornou30,
        pctNaoRetornou30: todosNovos > 0 ? Math.round(naoRetornou30 / todosNovos * 1000) / 10 : 0,
        naoRetornou60,
        pctNaoRetornou60: todosNovos > 0 ? Math.round(naoRetornou60 / todosNovos * 1000) / 10 : 0,
        total: todosNovos,
      };

      // ── 7) Cohort Histórico (grade M+1..M+6 por mês-calendário) ──
      // Para cada cohort (mês de 1ª visita), calcular % que voltou em M+1, M+2...M+6
      const cohortHistorico = Array.from(clientesMes.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, clientes]) => {
          const [ano, mesNum] = mes.split("-").map(Number);
          const novos = clientes.length;
          const colunas: Record<string, number | null> = {};
          for (let m = 1; m <= 6; m++) {
            // Mês-calendário M+m
            const targetAno = mesNum + m > 12 ? ano + Math.floor((mesNum + m - 1) / 12) : ano;
            const targetMes = ((mesNum + m - 1) % 12) + 1;
            const targetStr = `${targetAno}-${String(targetMes).padStart(2, "0")}`;
            // Verificar se esse mês já passou (comparar com dataFimStr)
            if (targetStr > dataFimStr.slice(0, 7)) {
              colunas[`m${m}`] = null; // ainda não disponível
            } else {
              const voltaram = clientes.filter(c => {
                const visitas = visitasMap.get(c.clienteId) || [];
                return visitas.some(v => {
                  if (v.data <= c.primeiraVisita) return false;
                  const vMes = v.data.slice(0, 7);
                  return vMes === targetStr;
                });
              }).length;
              colunas[`m${m}`] = novos > 0 ? Math.round(voltaram / novos * 1000) / 10 : 0;
            }
          }
          return { mes, novos, ...colunas };
        });

      // ── 8) Cohort Por Barbeiro ──
      const barbeiroMapCohort = new Map<number, {
        nome: string; novos: number;
        ret30: number; ret60: number; ret90: number;
        diasAte2aList: number[];
      }>();
      for (const c of Array.from(clientesMes.values()).flat()) {
        const bid = c.barbeiroId ?? -1;
        const bnome = c.barbeiroNome ?? "Sem barbeiro";
        if (!barbeiroMapCohort.has(bid)) {
          barbeiroMapCohort.set(bid, { nome: bnome, novos: 0, ret30: 0, ret60: 0, ret90: 0, diasAte2aList: [] });
        }
        const entry = barbeiroMapCohort.get(bid)!;
        entry.novos++;
        if (c.ret30) entry.ret30++;
        if (c.ret60) entry.ret60++;
        if (c.ret90) entry.ret90++;
        if (c.diasAte2a !== null) entry.diasAte2aList.push(c.diasAte2a);
      }
      const cohortPorBarbeiro = Array.from(barbeiroMapCohort.entries())
        .filter(([id]) => id !== -1)
        .map(([id, b]) => {
          const sorted = b.diasAte2aList.sort((a, z) => a - z);
          const mediana = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : null;
          return {
            barbeiroId: id,
            barbeiroNome: b.nome,
            novos: b.novos,
            ret30: b.ret30,
            pctRet30: b.novos > 0 ? Math.round(b.ret30 / b.novos * 1000) / 10 : 0,
            ret60: b.ret60,
            pctRet60: b.novos > 0 ? Math.round(b.ret60 / b.novos * 1000) / 10 : 0,
            ret90: b.ret90,
            pctRet90: b.novos > 0 ? Math.round(b.ret90 / b.novos * 1000) / 10 : 0,
            mediana2aVisita: mediana,
          };
        })
        .sort((a, b) => b.novos - a.novos);

      const result_cohort = { cohortMensal, analiseNovos, distribuicao, cohortHistorico, cohortPorBarbeiro };
      setCached(cohortCache, cohortCacheKey, result_cohort);
      return result_cohort;
    }),

  // ── Barbeiros ────────────────────────────────────────────────────────────────
  // Saúde da base por barbeiro: distribuição de clientes por status (Assíduo, Regular,
  // Espaçando, 1ª Vez, Em Risco, Perdido) + ranking comparativo com métricas de desempenho.
  barbeiros: sysUserProcedure
    .input(baseInput)
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );
      const unitCond = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `v.unidade_id = ${extIds[0]}`
        : `v.unidade_id IN (${extIds.join(",")})`;
      const dataInicio = input.dataInicio || new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];
      const dataFim = input.dataFim || new Date().toISOString().split("T")[0];
      const barbCacheKey = `barb-${extIds.join(",")}-${dataInicio}-${dataFim}`;
      const barbCached = getCached(barbeirosCache, barbCacheKey);
      if (barbCached) { console.log("[barbeiros] cache hit"); return barbCached; }

      // Query principal: saúde da base por barbeiro
      // Para cada barbeiro, pega os clientes que atendeu no período e classifica por status atual
      const saudeRows = await queryLocal<{
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
        FROM sync_vendas v
        JOIN sync_usuarios uu ON v.usuario = uu.id
        JOIN sync_clientes c ON c.id = v.cliente
        JOIN (
          SELECT
            v2.cliente,
            COUNT(*) as total_visitas_hist,
            MIN(v2.data_criacao) as primeira_visita_geral
          FROM sync_vendas v2
          WHERE v2.comanda_temp = 0 AND v2.cancelado_motivo IS NULL AND v2.status = 1
            AND v2.cliente IS NOT NULL AND v2.cliente != 2
          GROUP BY v2.cliente
        ) hist ON hist.cliente = v.cliente
        WHERE ${unitCond}
          AND uu.visivel_agenda != 'nenhuma'
          AND DATE(v.data_criacao) >= '${dataInicio}'
          AND DATE(v.data_criacao) <= '${dataFim}'
          AND v.comanda_temp = 0
          AND v.cancelado_motivo IS NULL
          AND v.status = 1
          AND v.cliente IS NOT NULL
          AND v.cliente != 2
          AND c.status = 1
        GROUP BY uu.id, uu.nome
        ORDER BY (assiduo + regular) DESC
      `);

      const result_barb = {
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
      setCached(barbeirosCache, barbCacheKey, result_barb);
      return result_barb;
    }),

  // ── Diagnóstico ────────────────────────────────────────────────────────────────────────────
  diagnostico: sysUserProcedure
    .input(baseInput)
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );

      const dataInicio = input.dataInicio || new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
      const dataFim = input.dataFim || new Date().toISOString().split("T")[0];

      // Verificar cache
      const cacheKey = `diag-${extIds.join(",")}-${dataInicio}-${dataFim}`;
      const cached = diagnosticoCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < DIAGNOSTICO_TTL) {
        console.log('[Diagnostico] Retornando dados do cache.');
        return cached.data;
      }

      // Subquery para filtrar por unidade (mais rápido que JOIN)
      const unitUserCond = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `v.usuario IN (SELECT id FROM sync_usuarios WHERE unidade = ${extIds[0]})`
        : `v.usuario IN (SELECT id FROM sync_usuarios WHERE unidade IN (${extIds.join(",")}))`;

      console.log('[Diagnostico] Iniciando queries sequenciais...');

      // Query 1: Atendimentos COM cadastro (cliente != 2 e não nulo)
      const atendComCadastroRows = await queryLocal<{
        total_atendimentos: number;
        faturamento_total: number;
        clientes_distintos: number;
      }>(`
        SELECT
          COUNT(*) as total_atendimentos,
          COALESCE(SUM(v.valor_total), 0) as faturamento_total,
          COUNT(DISTINCT v.cliente) as clientes_distintos
        FROM sync_vendas v
        WHERE ${unitUserCond}
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
          AND v.cliente IS NOT NULL AND v.cliente != 2
          AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
      `);
      console.log('[Diagnostico] Query 1 OK (atend com cadastro)');

      // Query 2: Atendimentos SEM cadastro (cliente = 2 ou nulo = "sem cadastro" do sistema)
      const atendSemCadastroRows = await queryLocal<{
        atendimentos_sem_cadastro: number;
        faturamento_sem_cadastro: number;
      }>(`
        SELECT COUNT(*) as atendimentos_sem_cadastro, COALESCE(SUM(v.valor_total), 0) as faturamento_sem_cadastro
        FROM sync_vendas v
        WHERE ${unitUserCond}
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
          AND (v.cliente IS NULL OR v.cliente = 2)
          AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
      `);
      console.log('[Diagnostico] Query 2 OK (atend sem cadastro)');

      // Query 3: Saúde da base — one-shot, freq média, em risco, perdidos
      const saudeRows2 = await queryLocal<{
        total_clientes: number;
        one_shot: number;
        voltaram_2x: number;
        freq_media: number;
        em_risco: number;
        perdidos: number;
      }>(`
        SELECT
          COUNT(*) as total_clientes,
          SUM(CASE WHEN total_visitas = 1 THEN 1 ELSE 0 END) as one_shot,
          SUM(CASE WHEN total_visitas >= 2 THEN 1 ELSE 0 END) as voltaram_2x,
          ROUND(AVG(total_visitas), 1) as freq_media,
          SUM(CASE WHEN dias_desde_ultima BETWEEN 45 AND 90 THEN 1 ELSE 0 END) as em_risco,
          SUM(CASE WHEN dias_desde_ultima > 90 THEN 1 ELSE 0 END) as perdidos
        FROM (
          SELECT
            v.cliente,
            COUNT(*) as total_visitas,
            DATEDIFF(CURDATE(), MAX(DATE(v.data_criacao))) as dias_desde_ultima
          FROM sync_vendas v
          WHERE ${unitUserCond}
            AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
            AND v.cliente IS NOT NULL AND v.cliente != 2
            AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
          GROUP BY v.cliente
        ) sub
      `);
      console.log('[Diagnostico] Query 3 OK (saude base)');

      // Query 4: Qualidade de cadastro — telefone (via tabela clientes)
      const qualidadeRows2 = await queryLocal<{
        com_telefone: number;
        sem_telefone: number;
      }>(`
        SELECT
          SUM(CASE WHEN c.telefone IS NOT NULL AND c.telefone != '' THEN 1 ELSE 0 END) as com_telefone,
          SUM(CASE WHEN c.telefone IS NULL OR c.telefone = '' THEN 1 ELSE 0 END) as sem_telefone
        FROM sync_clientes c
        WHERE c.id IN (
          SELECT DISTINCT v.cliente
          FROM sync_vendas v
          WHERE ${unitUserCond}
            AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
            AND v.cliente IS NOT NULL AND v.cliente != 2
            AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
        )
      `);
      console.log('[Diagnostico] Query 4 OK (qualidade cadastro)');

      // Query 5: Distribuição de visitas (1x, 2x, 3x, 4x, 5+)
      const visitasDistRows = await queryLocal<{ total_visitas: number; clientes: number }>(`
        SELECT
          CASE WHEN cnt >= 5 THEN 5 ELSE cnt END as total_visitas,
          COUNT(*) as clientes
        FROM (
          SELECT v.cliente, COUNT(*) as cnt
          FROM sync_vendas v
          WHERE ${unitUserCond}
            AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
            AND v.cliente IS NOT NULL AND v.cliente != 2
            AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
          GROUP BY v.cliente
        ) sub
        GROUP BY CASE WHEN cnt >= 5 THEN 5 ELSE cnt END
        ORDER BY total_visitas
      `);
      console.log('[Diagnostico] Query 5 OK (dist visitas)');

      // Query 6: Horários de pico
      const horarioRows = await queryLocal<{ hora: number; atendimentos: number }>(`
        SELECT HOUR(v.data_criacao) as hora, COUNT(*) as atendimentos
        FROM sync_vendas v
        WHERE ${unitUserCond}
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
          AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
        GROUP BY HOUR(v.data_criacao)
        ORDER BY hora
      `);
      console.log('[Diagnostico] Query 6 OK (horarios pico)');

      // Query 7: Movimento por dia da semana
      const diaSemanaRows = await queryLocal<{ dia_semana: number; atendimentos: number; clientes: number }>(`
        SELECT
          DAYOFWEEK(v.data_criacao) as dia_semana,
          COUNT(*) as atendimentos,
          COUNT(DISTINCT v.cliente) as clientes
        FROM sync_vendas v
        WHERE ${unitUserCond}
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
          AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
        GROUP BY DAYOFWEEK(v.data_criacao)
        ORDER BY dia_semana
      `);
      console.log('[Diagnostico] Query 7 OK (dias semana)');

      // Query 8: Ausência desde última visita (faixas de dias)
      const faixasDiasRows = await queryLocal<{ faixa_dias: string; total: number }>(`
        SELECT
          CASE
            WHEN dias_desde_ultima <= 30 THEN '0-30 dias'
            WHEN dias_desde_ultima <= 60 THEN '31-60 dias'
            WHEN dias_desde_ultima <= 90 THEN '61-90 dias'
            WHEN dias_desde_ultima <= 180 THEN '91-180 dias'
            ELSE '180+ dias'
          END as faixa_dias,
          COUNT(*) as total
        FROM (
          SELECT v.cliente, DATEDIFF(CURDATE(), MAX(DATE(v.data_criacao))) as dias_desde_ultima
          FROM sync_vendas v
          WHERE ${unitUserCond}
            AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
            AND v.cliente IS NOT NULL AND v.cliente != 2
            AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
          GROUP BY v.cliente
        ) sub
        GROUP BY faixa_dias
        ORDER BY MIN(dias_desde_ultima)
      `);
      console.log('[Diagnostico] Query 8 OK (faixas dias)');

      // Montar dados consolidados
      const saudeRaw = saudeRows2[0] ?? { total_clientes: 0, one_shot: 0, voltaram_2x: 0, freq_media: 0, em_risco: 0, perdidos: 0 };
      const qualRaw = qualidadeRows2[0] ?? { com_telefone: 0, sem_telefone: 0 };

      const kpiRows = [{
        total: Number(saudeRaw.total_clientes ?? 0),
        sem_telefone: Number(qualRaw.sem_telefone ?? 0),
        sem_nome: 0,
        com_telefone: Number(qualRaw.com_telefone ?? 0),
        one_shot: Number(saudeRaw.one_shot ?? 0),
        em_risco: Number(saudeRaw.em_risco ?? 0),
        perdidos: Number(saudeRaw.perdidos ?? 0),
        voltaram_2x: Number(saudeRaw.voltaram_2x ?? 0),
        freq_media: Number(saudeRaw.freq_media ?? 0),
      }];
      const vendaRows = [{
        total_atendimentos: Number(atendComCadastroRows[0]?.total_atendimentos ?? 0),
        atendimentos_sem_cadastro: Number(atendSemCadastroRows[0]?.atendimentos_sem_cadastro ?? 0),
        faturamento_sem_cadastro: Number(atendSemCadastroRows[0]?.faturamento_sem_cadastro ?? 0),
        ticket_medio: Number(atendComCadastroRows[0]?.total_atendimentos ?? 0) > 0
          ? Number(atendComCadastroRows[0]?.faturamento_total ?? 0) / Number(atendComCadastroRows[0]?.total_atendimentos ?? 1)
          : 0,
        faturamento_total: Number(atendComCadastroRows[0]?.faturamento_total ?? 0),
      }];
      console.log('[Diagnostico] Todas as queries concluídas!');
      // Mapear resultados
      const totalRows = kpiRows;
      const qualidadeRows = kpiRows;
      const semCadastroRows = vendaRows;
      const saudeRows = kpiRows;
      const ticketRows = vendaRows;
      const retencaoRows = [{ novos: 0, retornaram: kpiRows[0]?.voltaram_2x ?? 0 }];

      const total = Number(totalRows[0]?.total ?? 0);
      const semTelefone = Number(qualidadeRows[0]?.sem_telefone ?? 0);
      const semNome = Number(qualidadeRows[0]?.sem_nome ?? 0);
      const comTelefone = Number(qualidadeRows[0]?.com_telefone ?? 0);
      const atendimentosSemCadastro = Number(semCadastroRows[0]?.atendimentos_sem_cadastro ?? 0);
      const faturamentoSemCadastro = Number(semCadastroRows[0]?.faturamento_sem_cadastro ?? 0);
      const oneShot = Number(saudeRows[0]?.one_shot ?? 0);
      const emRisco = Number(saudeRows[0]?.em_risco ?? 0);
      const perdidos = Number(saudeRows[0]?.perdidos ?? 0);
      const voltaram2x = Number(saudeRows[0]?.voltaram_2x ?? 0);
      const freqMedia = Number(saudeRows[0]?.freq_media ?? 0);
      const ticketMedio = Number(ticketRows[0]?.ticket_medio ?? 0);
      const faturamentoTotal = Number(ticketRows[0]?.faturamento_total ?? 0);
      const totalAtendimentos = Number(ticketRows[0]?.total_atendimentos ?? 0);
      const novos = Number(retencaoRows[0]?.novos ?? 0);
      const retornaram = Number(retencaoRows[0]?.retornaram ?? 0);

      // Score de qualidade: baseado na cobertura de telefone
      const scoreQualidade = total > 0
        ? Math.round(Math.max(0, 100 - (semTelefone / total) * 100))
        : 0;

      // Taxa de retenção = clientes que voltaram 2x+ / total
      const taxaRetencao = total > 0 ? Math.round((voltaram2x / total) * 100) : 0;

      // Alertas automáticos
      const alertas: { tipo: "danger" | "warning" | "info"; mensagem: string }[] = [];
      if (atendimentosSemCadastro > totalAtendimentos * 0.15)
        alertas.push({ tipo: "danger", mensagem: `${atendimentosSemCadastro} atendimentos sem cadastro (${Math.round((atendimentosSemCadastro / (totalAtendimentos + atendimentosSemCadastro)) * 100)}% do total) — faturamento perdido: R$ ${faturamentoSemCadastro.toFixed(0)}` });
      if (semTelefone > total * 0.3)
        alertas.push({ tipo: "danger", mensagem: `${semTelefone} clientes sem telefone (${Math.round((semTelefone / total) * 100)}%) — impossível acionar por WhatsApp` });
      if (semNome > total * 0.1)
        alertas.push({ tipo: "warning", mensagem: `${semNome} clientes sem nome cadastrado (${Math.round((semNome / total) * 100)}%)` });
      if (oneShot > total * 0.4)
        alertas.push({ tipo: "warning", mensagem: `${oneShot} clientes one-shot (${Math.round((oneShot / total) * 100)}%) — alta taxa de não retorno` });
      if (emRisco > total * 0.2)
        alertas.push({ tipo: "warning", mensagem: `${emRisco} clientes em risco de churn (45-90 dias sem visita)` });
      if (taxaRetencao < 50)
        alertas.push({ tipo: "info", mensagem: `Taxa de retenção abaixo de 50% — apenas ${taxaRetencao}% dos clientes voltaram 2x ou mais` });

      const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

      const result = {
        total,
        totalAtendimentos,
        faturamentoTotal,
        ticketMedio,
        freqMedia,
        taxaRetencao,
        novos,
        retornaram,
        qualidade: {
          score: scoreQualidade,
          semTelefone,
          semNome,
          comTelefone,
          pctSemTelefone: total > 0 ? Math.round((semTelefone / total) * 100) : 0,
          pctSemNome: total > 0 ? Math.round((semNome / total) * 100) : 0,
          pctComTelefone: total > 0 ? Math.round((comTelefone / total) * 100) : 0,
        },
        semCadastro: {
          atendimentos: atendimentosSemCadastro,
          faturamento: faturamentoSemCadastro,
          pct: totalAtendimentos + atendimentosSemCadastro > 0
            ? Math.round((atendimentosSemCadastro / (totalAtendimentos + atendimentosSemCadastro)) * 100)
            : 0,
        },
        saude: {
          oneShot,
          emRisco,
          perdidos,
          voltaram2x,
          pctOneShot: total > 0 ? Math.round((oneShot / total) * 100) : 0,
          pctEmRisco: total > 0 ? Math.round((emRisco / total) * 100) : 0,
          pctPerdidos: total > 0 ? Math.round((perdidos / total) * 100) : 0,
          pctVoltaram2x: total > 0 ? Math.round((voltaram2x / total) * 100) : 0,
        },
        visitasDistribuicao: visitasDistRows.map(r => ({
          visitas: Number(r.total_visitas),
          clientes: Number(r.clientes),
        })),
        faixasDias: (() => {
          const totalFaixas = faixasDiasRows.reduce((s, r) => s + Number(r.total), 0);
          return faixasDiasRows.map(r => ({
            faixa: r.faixa_dias,
            total: Number(r.total),
            percentual: totalFaixas > 0 ? Math.round((Number(r.total) / totalFaixas) * 100) : 0,
          }));
        })(),
        horarios: horarioRows.map(r => ({
          hora: Number(r.hora),
          label: `${String(Number(r.hora)).padStart(2, '0')}h`,
          atendimentos: Number(r.atendimentos),
        })),
        diasSemana: diaSemanaRows.map(r => ({
          dia: Number(r.dia_semana),
          label: diasSemana[(Number(r.dia_semana) - 1) % 7] ?? "",
          atendimentos: Number(r.atendimentos),
          clientes: Number(r.clientes),
        })),
        alertas,
      };

      // Salvar no cache
      diagnosticoCache.set(cacheKey, { data: result, ts: Date.now() });
      console.log('[Diagnostico] Dados salvos no cache.');
      return result;
    }),

  // ── Ações (fila CRM) ─────────────────────────────────────────────────────────
  acoes: sysUserProcedure
    .input(baseInput.extend({
      tipo: z.enum(["todos", "one_shot_risco", "perdidos_recentes", "em_risco", "sem_telefone"]).optional(),
      page: z.number().default(1),
      pageSize: z.number().default(50),
    }))
    .query(async ({ ctx, input }) => {
      const { extIds } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );

      const dataInicio = input.dataInicio || new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
      const dataFim = input.dataFim || new Date().toISOString().split("T")[0];

      const unitCondV = extIds.length === 0 ? "1=1"
        : extIds.length === 1 ? `v.unidade_id = ${extIds[0]}`
        : `v.unidade_id IN (${extIds.join(",")})`;

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

      const rows = await queryLocal<{
        id: number; nome: string; telefone: string;
        ultima_visita: Date; consumo: number; dias: number; total_visitas: number;
      }>(`
        SELECT c.id, c.nome, c.telefone, c.ultima_visita,
               COALESCE((
                 SELECT SUM(sv.valor_total) FROM sync_vendas sv
                 WHERE sv.cliente = c.id AND sv.comanda_temp=0 AND sv.cancelado_motivo IS NULL AND sv.status=1
               ), 0) as consumo,
               DATEDIFF(NOW(), c.ultima_visita) as dias,
               COALESCE(vpc.total_visitas, 0) as total_visitas
        FROM sync_clientes c
        JOIN (
          SELECT v.cliente, COUNT(*) as total_visitas
          FROM sync_vendas v
          WHERE ${unitCondV}
            AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
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

  // ── Routing (segmentação de clientes por barbeiro) ──────────────────────────────────────
  routing: sysUserProcedure
    .input(baseInput)
    .query(async ({ ctx, input }) => {
      const { extIds, unitFilter } = await resolveExternalIds(
        (ctx.user?.id ?? 0), (ctx.user?.role ?? "user"), input.orgId, input.unitId, ctx.sysUser
      );
      if (extIds.length === 0) return { kpis: null, barbeiros: [], segmentosGeral: null, evolucao: [] };

      // Filtro de unidade via JOIN usuarios
      const unitCondU = extIds.length === 1 ? `v.unidade_id = ${extIds[0]}` : `v.unidade_id IN (${extIds.join(",")})`;

      const dataInicio = input.dataInicio || new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];
      const dataFim = input.dataFim || new Date().toISOString().split("T")[0];

      // ── Cache persistente: mês fechado de unidade única ──
      if (unitFilter && extIds.length === 1) {
        const persistentCache = await getCachedRoutingByPeriod(unitFilter, dataInicio, dataFim);
        if (persistentCache) {
          console.log(`[routing] cache persistente hit unitId=${unitFilter} ${dataInicio}..${dataFim}`);
          return persistentCache;
        }
      }

      // Janela de atividade: 60 dias (cliente ativo = visitou nos últimos 60 dias)
      const janelaAtividade = 60;

      // ── ETAPA 0: Identifica barbeiros executores via vendas_produtos.colaborador ──────────
      // O campo colaborador em vendas_produtos indica quem EXECUTOU o serviço/produto,
      // independente de quem registrou a venda no caixa (vendas.usuario).
      // Isso captura todos os barbeiros ativos: Wuesley, Andrade, Gonzalo, Rogerio, Lester,
      // João_Flavio, Pablo, Gabriela — e o Colaborador Caixa aparece com volume real (≈3).
      const barbeirosAtivosRows = await queryLocal<{ barbeiro_id: number }>(`
        SELECT DISTINCT vp.colaborador as barbeiro_id
        FROM sync_vendas_produtos vp
        JOIN sync_vendas v ON v.id = vp.venda
        JOIN sync_usuarios uu ON uu.id = vp.colaborador
        WHERE ${unitCondU}
          AND DATE(v.data_criacao) >= '${dataInicio}'
          AND DATE(v.data_criacao) <= '${dataFim}'
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
          AND v.cliente IS NOT NULL AND v.cliente != 2
          AND vp.colaborador IS NOT NULL
      `);

      const barbeirosAtivosIds = barbeirosAtivosRows.map(r => Number(r.barbeiro_id));

      if (barbeirosAtivosIds.length === 0) {
        return { kpis: null, barbeiros: [], segmentosGeral: null, evolucao: [] };
      }

      const barbeirosAtivosStr = barbeirosAtivosIds.join(",");
      // ── ETAPA 1: IDs dos clientes atendidos no período ─────────────────────────────────────────────────────
      // Usa vendas_produtos.colaborador para capturar clientes atendidos por barbeiros executores
      // (vendas.usuario pode ser o caixa, não o barbeiro que executou)
      const clientesPeriodo = await queryLocal<{ cliente_id: number }>(`
        SELECT DISTINCT v.cliente as cliente_id
        FROM sync_vendas v
        JOIN sync_vendas_produtos vp ON vp.venda = v.id AND vp.colaborador IN (${barbeirosAtivosStr})
        WHERE DATE(v.data_criacao) >= '${dataInicio}'
          AND DATE(v.data_criacao) <= '${dataFim}'
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
          AND v.cliente IS NOT NULL AND v.cliente != 2
      `);

      if (clientesPeriodo.length === 0) {
        return { kpis: null, barbeiros: [], segmentosGeral: null, evolucao: [] };
      }

      // Limitar a 2000 clientes para evitar timeout
      const clienteIds = clientesPeriodo.map(r => Number(r.cliente_id)).slice(0, 2000);
      const clienteIdsStr = clienteIds.join(",");

      // ── ETAPA 2A: Histórico agregado por cliente ─────────────────────────────────────────────
      // barbeiros_distintos = contagem de barbeiros DISTINTOS NO PERÍODO (não histórico total)
      // Isso alinha com o sistema de referência: Só 1 + Multi = Total do período
      const clientesRows = await queryLocal<{
        cliente_id: number;
        total_visitas_hist: number;
        barbeiros_distintos: number;
        ultima_visita: string;
        dias_desde_ultima: number;
        primeira_visita_hist: string;
      }>(`
        SELECT
          v.cliente as cliente_id,
          COUNT(v.id) as total_visitas_hist,
          COUNT(DISTINCT vp.colaborador) as barbeiros_distintos,
          MAX(v.data_criacao) as ultima_visita,
          DATEDIFF(NOW(), MAX(v.data_criacao)) as dias_desde_ultima,
          MIN(v.data_criacao) as primeira_visita_hist
        FROM sync_vendas v
        JOIN sync_vendas_produtos vp ON vp.venda = v.id AND vp.colaborador IN (${barbeirosAtivosStr})
        WHERE v.cliente IN (${clienteIdsStr})
          AND DATE(v.data_criacao) >= '${dataInicio}'
          AND DATE(v.data_criacao) <= '${dataFim}'
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
          AND v.cliente IS NOT NULL AND v.cliente != 2
        GROUP BY v.cliente
      `);

      // ── ETAPA 2B: Barbeiro principal e último barbeiro por cliente ──────────────────────
      // Usa vendas_produtos.colaborador para atribuir o executor real por cliente
      // (query mais leve pois já temos os IDs dos clientes e barbeiros)
      const barbeirosPorCliente = await queryLocal<{
        cliente_id: number;
        ultimo_barbeiro_id: number;
        ultimo_barbeiro_nome: string;
        barbeiro_principal_id: number;
        barbeiro_principal_nome: string;
      }>(`
        SELECT
          t.cliente_id,
          t.ultimo_barbeiro_id,
          uu_ult.nome as ultimo_barbeiro_nome,
          t.barbeiro_principal_id,
          uu_pri.nome as barbeiro_principal_nome
        FROM (
          SELECT
            sub.cliente_id,
            SUBSTRING_INDEX(GROUP_CONCAT(sub.colaborador ORDER BY sub.ultima_data DESC), ',', 1) as ultimo_barbeiro_id,
            SUBSTRING_INDEX(GROUP_CONCAT(sub.colaborador ORDER BY sub.cnt DESC, sub.colaborador ASC), ',', 1) as barbeiro_principal_id
          FROM (
            SELECT
              v.cliente as cliente_id,
              vp.colaborador,
              COUNT(*) as cnt,
              MAX(v.data_criacao) as ultima_data
            FROM sync_vendas_produtos vp
            JOIN sync_vendas v ON v.id = vp.venda
            WHERE v.cliente IN (${clienteIdsStr})
              AND vp.colaborador IN (${barbeirosAtivosStr})
              AND DATE(v.data_criacao) >= '${dataInicio}'
              AND DATE(v.data_criacao) <= '${dataFim}'
              AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
              AND v.cliente IS NOT NULL AND v.cliente != 2
            GROUP BY v.cliente, vp.colaborador
          ) sub
          GROUP BY sub.cliente_id
        ) t
        LEFT JOIN sync_usuarios uu_ult ON uu_ult.id = t.ultimo_barbeiro_id
        LEFT JOIN sync_usuarios uu_pri ON uu_pri.id = t.barbeiro_principal_id
      `);

      // Mapa de barbeiro por cliente
      const barbMapByCliente = new Map(barbeirosPorCliente.map(b => [Number(b.cliente_id), b]));

      // ── 3. Busca lista de barbeiros ativos ─────────────────────────────────────────────
      const barbeirosList = await queryLocal<{ id: number; nome: string }>(`
        SELECT DISTINCT uu.id, uu.nome
        FROM sync_usuarios uu
        WHERE uu.id IN (${barbeirosAtivosStr})
          AND uu.status = 1
        ORDER BY uu.nome
      `);

      // ── 4. Classifica cada cliente em um segmento ─────────────────────────────
      type Segmento = "fiel" | "exclusivo" | "aguardando" | "nao_voltou" | "convertendo" | "saindo" | "com_outro";

      interface ClienteClassificado {
        clienteId: number;
        barbeiroId: number;
        barbeiroNome: string;
        segmento: Segmento;
        ativo: boolean;
        diasDesdeUltima: number;
        totalVisitas: number;
        barbeirosDistintos: number;
      }

      const classificados: ClienteClassificado[] = clientesRows.map(r => {
        const dias = Number(r.dias_desde_ultima) || 0;
        const visitas = Number(r.total_visitas_hist);
        const distintos = Number(r.barbeiros_distintos);
        const ativo = dias <= janelaAtividade;
        const barbInfo = barbMapByCliente.get(Number(r.cliente_id));
        const barbeiroId = Number(barbInfo?.barbeiro_principal_id) || 0;
        const barbeiroNome = barbInfo?.barbeiro_principal_nome || "Desconhecido";
        const ultimoBarbeiroId = Number(barbInfo?.ultimo_barbeiro_id) || 0;

        let segmento: Segmento;
        if (distintos === 1) {
          if (visitas >= 3) segmento = "fiel";
          else if (visitas === 2) segmento = "exclusivo";
          else if (dias <= 45) segmento = "aguardando";
          else segmento = "nao_voltou";
        } else {
          if (visitas === 1) segmento = "com_outro";
          else if (ultimoBarbeiroId === barbeiroId) segmento = "convertendo";
          else segmento = "saindo";
        }

        return { clienteId: Number(r.cliente_id), barbeiroId, barbeiroNome, segmento, ativo, diasDesdeUltima: dias, totalVisitas: visitas, barbeirosDistintos: distintos };
      });

      // ── 4. KPIs globais ───────────────────────────────────────────────────────
      const totalClientes = classificados.length;
      const so1Barbeiro = classificados.filter(c => c.barbeirosDistintos === 1).length;
      const multiBarbeiro = classificados.filter(c => c.barbeirosDistintos > 1).length;
      const voltaram2x = classificados.filter(c => c.totalVisitas >= 2).length;
      const perdidos = classificados.filter(c => !c.ativo).length;

      // Média de barbeiros por cliente
      const mediaBarb = totalClientes > 0
        ? Math.round((classificados.reduce((s, c) => s + c.barbeirosDistintos, 0) / totalClientes) * 100) / 100
        : 0;

      // ── 5. Agrupa por barbeiro ─────────────────────────────────────────────────
      const porBarbeiro = new Map<number, {
        id: number; nome: string;
        ativos: number; perdidos: number;
        so1Barb: number; multiBarb: number;
        fiel: number; exclusivo: number; aguardando: number; naoVoltou: number;
        convertendo: number; saindo: number; comOutro: number;
      }>();

      // Inicializa com todos os barbeiros ativos
      for (const b of barbeirosList) {
        porBarbeiro.set(Number(b.id), {
          id: Number(b.id), nome: b.nome,
          ativos: 0, perdidos: 0,
          so1Barb: 0, multiBarb: 0,
          fiel: 0, exclusivo: 0, aguardando: 0, naoVoltou: 0,
          convertendo: 0, saindo: 0, comOutro: 0,
        });
      }

      for (const c of classificados) {
        let entry = porBarbeiro.get(c.barbeiroId);
        if (!entry) {
          entry = { id: c.barbeiroId, nome: c.barbeiroNome, ativos: 0, perdidos: 0, so1Barb: 0, multiBarb: 0, fiel: 0, exclusivo: 0, aguardando: 0, naoVoltou: 0, convertendo: 0, saindo: 0, comOutro: 0 };
          porBarbeiro.set(c.barbeiroId, entry);
        }
        if (c.ativo) entry.ativos++; else entry.perdidos++;
        if (c.barbeirosDistintos === 1) entry.so1Barb++; else entry.multiBarb++;
        if (c.segmento === "fiel") entry.fiel++;
        else if (c.segmento === "exclusivo") entry.exclusivo++;
        else if (c.segmento === "aguardando") entry.aguardando++;
        else if (c.segmento === "nao_voltou") entry.naoVoltou++;
        else if (c.segmento === "convertendo") entry.convertendo++;
        else if (c.segmento === "saindo") entry.saindo++;
        else if (c.segmento === "com_outro") entry.comOutro++;
      }

      const barbeirosFinal = Array.from(porBarbeiro.values())
        .filter(b => (b.ativos + b.perdidos) > 0)
        .sort((a, b) => (b.ativos + b.perdidos) - (a.ativos + a.perdidos))
        .map(b => {
          const total = b.ativos + b.perdidos || 1;
          const pctPerdidos = Math.round((b.perdidos / total) * 100);
          return {
            ...b,
            total: b.ativos + b.perdidos,
            pctPerdidos,
            pctSo1Barb: Math.round((b.so1Barb / total) * 100),
            pctMultiBarb: Math.round((b.multiBarb / total) * 100),
            pctFiel: Math.round((b.fiel / total) * 100),
            pctExclusivo: Math.round((b.exclusivo / total) * 100),
            pctAguardando: Math.round((b.aguardando / total) * 100),
            pctNaoVoltou: Math.round((b.naoVoltou / total) * 100),
            pctConvertendo: Math.round((b.convertendo / total) * 100),
            pctSaindo: Math.round((b.saindo / total) * 100),
            pctComOutro: Math.round((b.comOutro / total) * 100),
          };
        });

      // ── 6. Segmentos — Visão Geral ───────────────────────────────────────────
      const segFiel = classificados.filter(c => c.segmento === "fiel").length;
      const segExclusivo = classificados.filter(c => c.segmento === "exclusivo").length;
      const segConvertendo = classificados.filter(c => c.segmento === "convertendo").length;
      const segSaindo = classificados.filter(c => c.segmento === "saindo").length;
      const segAguardando = classificados.filter(c => c.segmento === "aguardando").length;
      const segNaoVoltou = classificados.filter(c => c.segmento === "nao_voltou").length;
      const segComOutro = classificados.filter(c => c.segmento === "com_outro").length;

      // ── 7. Evolução mensal (novos, rec. fiéis, rec. exclusivos, rec. rotativos, total) ──
      // Usa vendas.usuario (rápido) para evitar JOIN pesado com vendas_produtos
      const evolucaoRows = await queryLocal<{
        mes: string;
        novos: number;
        rec_fieis: number;
        rec_exclusivos: number;
        rec_rotativos: number;
        total_atendimentos: number;
        total_clientes: number;
      }>(`
        SELECT
          DATE_FORMAT(v.data_criacao, '%Y-%m') as mes,
          COUNT(DISTINCT CASE WHEN hist2.primeira_visita_geral >= DATE_FORMAT(v.data_criacao, '%Y-%m-01') THEN v.cliente END) as novos,
          COUNT(DISTINCT CASE WHEN hist2.total_visitas_hist >= 3 AND hist2.barbeiros_distintos = 1 THEN v.cliente END) as rec_fieis,
          COUNT(DISTINCT CASE WHEN hist2.total_visitas_hist = 2 AND hist2.barbeiros_distintos = 1 THEN v.cliente END) as rec_exclusivos,
          COUNT(DISTINCT CASE WHEN hist2.barbeiros_distintos > 1 THEN v.cliente END) as rec_rotativos,
          COUNT(v.id) as total_atendimentos,
          COUNT(DISTINCT v.cliente) as total_clientes
        FROM sync_vendas v
        JOIN (
          SELECT
            v2.cliente,
            COUNT(v2.id) as total_visitas_hist,
            COUNT(DISTINCT v2.usuario) as barbeiros_distintos,
            MIN(v2.data_criacao) as primeira_visita_geral
          FROM sync_vendas v2
          WHERE v2.comanda_temp = 0 AND v2.cancelado_motivo IS NULL AND v2.status = 1
            AND v2.cliente IS NOT NULL AND v2.cliente != 2
            AND v2.usuario IN (${barbeirosAtivosStr})
          GROUP BY v2.cliente
        ) hist2 ON hist2.cliente = v.cliente
        WHERE v.usuario IN (${barbeirosAtivosStr})
          AND DATE(v.data_criacao) >= DATE_SUB('${dataInicio}', INTERVAL 11 MONTH)
          AND DATE(v.data_criacao) <= '${dataFim}'
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
          AND v.cliente IS NOT NULL AND v.cliente != 2
        GROUP BY DATE_FORMAT(v.data_criacao, '%Y-%m')
        ORDER BY mes ASC
      `);

      return {
        kpis: {
          totalClientes,
          so1Barbeiro,
          multiBarbeiro,
          voltaram2x,
          mediaBarb,
          perdidos,
          pctSo1Barbeiro: totalClientes > 0 ? Math.round((so1Barbeiro / totalClientes) * 100) : 0,
          pctMultiBarbeiro: totalClientes > 0 ? Math.round((multiBarbeiro / totalClientes) * 100) : 0,
          pctVoltaram2x: totalClientes > 0 ? Math.round((voltaram2x / totalClientes) * 100) : 0,
          pctPerdidos: totalClientes > 0 ? Math.round((perdidos / totalClientes) * 100) : 0,
          janelaAtividade,
        },
        barbeiros: barbeirosFinal,
        segmentosGeral: {
          fiel: segFiel, exclusivo: segExclusivo, convertendo: segConvertendo,
          saindo: segSaindo, aguardando: segAguardando, naoVoltou: segNaoVoltou,
          comOutro: segComOutro,
          pctFiel: totalClientes > 0 ? Math.round((segFiel / totalClientes) * 100) : 0,
          pctExclusivo: totalClientes > 0 ? Math.round((segExclusivo / totalClientes) * 100) : 0,
          pctConvertendo: totalClientes > 0 ? Math.round((segConvertendo / totalClientes) * 100) : 0,
          pctSaindo: totalClientes > 0 ? Math.round((segSaindo / totalClientes) * 100) : 0,
          pctAguardando: totalClientes > 0 ? Math.round((segAguardando / totalClientes) * 100) : 0,
          pctNaoVoltou: totalClientes > 0 ? Math.round((segNaoVoltou / totalClientes) * 100) : 0,
          pctComOutro: totalClientes > 0 ? Math.round((segComOutro / totalClientes) * 100) : 0,
        },
        evolucao: evolucaoRows.map(r => ({
          mes: r.mes,
          novos: Number(r.novos),
          recFieis: Number(r.rec_fieis),
          recExclusivos: Number(r.rec_exclusivos),
          recRotativos: Number(r.rec_rotativos),
          totalAtendimentos: Number(r.total_atendimentos),
          totalClientes: Number(r.total_clientes),
        })),
      };
    }),

  // ── Cache Sync Manual ────────────────────────────────────────────────────────
  triggerCacheSync: sysUserProcedure
    .input(z.object({
      unitId: z.number().optional(),
      forceAll: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if ((ctx.user?.role ?? "user") !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      if (input.unitId) {
        const [rows] = await db.execute(sql`
          SELECT id, orgId, externalId, name FROM units
          WHERE id = ${input.unitId} AND externalId IS NOT NULL
        `) as any;
        const unit = (rows as any[])[0];
        if (!unit) throw new TRPCError({ code: "NOT_FOUND", message: "Unidade não encontrada" });
        syncRaioXCacheUnit({
          unitId: Number(unit.id),
          orgId: Number(unit.orgId),
          externalId: Number(unit.externalId),
          meses: 24,
          forceAll: input.forceAll ?? false,
        }).catch(err => console.error("[triggerCacheSync] Erro:", err?.message));
        return { started: true, unitName: unit.name };
      } else {
        runRaioXCacheSyncJob(input.forceAll ?? false)
          .catch(err => console.error("[triggerCacheSync] Erro job:", err?.message));
        return { started: true, unitName: "todas as unidades" };
      }
    }),

  getCacheStatus: sysUserProcedure
    .input(z.object({ unitId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { meses: [], totalCached: 0, lastSync: null };
      const unitCond = input.unitId ? `unitId = ${input.unitId}` : "1=1";
      const [rows] = await db.execute(sql.raw(`
        SELECT mesRef, syncedAt FROM raio_x_cache_visao_geral
        WHERE ${unitCond}
        ORDER BY mesRef DESC
        LIMIT 36
      `)) as any;
      const [logRows] = await db.execute(sql.raw(`
        SELECT createdAt, status, duracaoMs FROM raio_x_cache_sync_log
        WHERE ${unitCond}
        ORDER BY createdAt DESC LIMIT 1
      `)) as any;
      const meses = (rows as any[]).map(r => ({ mesRef: r.mesRef, syncedAt: r.syncedAt }));
      const lastLog = (logRows as any[])[0];
      return {
        meses,
        totalCached: meses.length,
        lastSync: lastLog ? { at: lastLog.createdAt, status: lastLog.status, duracaoMs: lastLog.duracaoMs } : null,
      };
    }),

  // ─── Integração Raio-X → We Send ─────────────────────────────────────────────
  // Busca contatos de um segmento (perdidos, em_risco, one_shot_urgente) e cria campanha no We Send
  createCampaignFromSegment: sysUserProcedure
    .input(z.object({
      unitId: z.number(),
      segmento: z.enum(["perdidos", "em_risco", "one_shot_urgente"]),
      nomeCampanha: z.string().min(1),
      mensagem: z.string().min(1),
      intervaloSegundos: z.number().min(1).max(60).default(3),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

      // Definir condição SQL para cada segmento
      const hoje = new Date().toISOString().slice(0, 10);
      let whereSegmento = "";
      let segmentoLabel = "";
      if (input.segmento === "perdidos") {
        // Perdidos: >90 dias sem visita + mais de 1 visita histórica
        whereSegmento = `
          DATEDIFF('${hoje}', sc.ultima_visita) > 90
          AND (
            SELECT COUNT(*) FROM sync_vendas sv WHERE sv.cliente = sc.id AND sv.unidade_id = ${input.unitId}
          ) > 1
        `;
        segmentoLabel = "Clientes Perdidos";
      } else if (input.segmento === "em_risco") {
        // Em risco: 61-90 dias sem visita + mais de 1 visita histórica
        whereSegmento = `
          DATEDIFF('${hoje}', sc.ultima_visita) BETWEEN 61 AND 90
          AND (
            SELECT COUNT(*) FROM sync_vendas sv WHERE sv.cliente = sc.id AND sv.unidade_id = ${input.unitId}
          ) > 1
        `;
        segmentoLabel = "Clientes em Risco";
      } else {
        // One-Shot Urgente: 1 visita histórica + >=46 dias sem retornar
        whereSegmento = `
          DATEDIFF('${hoje}', sc.ultima_visita) >= 46
          AND (
            SELECT COUNT(*) FROM sync_vendas sv WHERE sv.cliente = sc.id AND sv.unidade_id = ${input.unitId}
          ) = 1
        `;
        segmentoLabel = "One-Shot Urgente";
      }

      // Buscar contatos do segmento com telefone válido
      const [contatos] = await db.execute(sql.raw(`
        SELECT sc.id, sc.nome, sc.telefone_sem_mascara as telefone
        FROM sync_clientes sc
        WHERE sc.unidade_id = ${input.unitId}
          AND sc.telefone_sem_mascara IS NOT NULL
          AND sc.telefone_sem_mascara != ''
          AND LENGTH(REGEXP_REPLACE(sc.telefone_sem_mascara, '[^0-9]', '')) >= 10
          AND sc.nome IS NOT NULL
          AND sc.nome != ''
          AND sc.nome != 'Sem Cadastro'
          AND ${whereSegmento}
        ORDER BY sc.ultima_visita ASC
        LIMIT 5000
      `)) as any;

      const listaContatos = (contatos as any[]);
      if (listaContatos.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Nenhum contato encontrado para o segmento ${segmentoLabel}` });
      }

      // Criar campanha no We Send
      const dataHoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const nomeFinal = input.nomeCampanha || `${segmentoLabel} — ${dataHoje}`;

      const [result] = await db.insert(wsCampanhas).values({
        unitId: input.unitId,
        nome: nomeFinal,
        descricao: `Campanha gerada automaticamente pelo Raio-X — ${segmentoLabel} em ${dataHoje}`,
        mensagem: input.mensagem,
        tipo: "texto",
        mediaUrl: null,
        intervaloSegundos: input.intervaloSegundos,
        agendadaPara: null,
        totalContatos: listaContatos.length,
        criadoPor: ctx.user?.name || "Raio-X",
        status: "rascunho",
      });
      const campanhaId = (result as any).insertId;

      // Inserir contatos em lote
      const BATCH = 200;
      for (let i = 0; i < listaContatos.length; i += BATCH) {
        const batch = listaContatos.slice(i, i + BATCH);
        const values = batch.map((c: any) => ({
          campanhaId,
          unitId: input.unitId,
          nome: c.nome || null,
          telefone: c.telefone.replace(/\D/g, ""),
          variaveis: JSON.stringify({ nome: c.nome || "" }),
          mensagemPersonalizada: input.mensagem.replace(/\{nome\}/g, c.nome || ""),
          status: "pendente" as const,
        }));
        await db.insert(wsContatos).values(values);
      }

      return {
        success: true,
        campanhaId,
        totalContatos: listaContatos.length,
        segmentoLabel,
      };
    }),
});
