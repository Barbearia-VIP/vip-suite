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
 * - Ativo (≤45d): última visita ≤ 45 dias
 * - Em risco (46-90d): última visita entre 46 e 90 dias
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
  if (dias <= 45) return "ativo";
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
      // Rolling windows (always from TODAY, not period-dependent)
      const dataInicio12m = new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];
      const dataInicio24m = new Date(Date.now() - 730 * 86400000).toISOString().split("T")[0];

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
          -- Ativos: ≤45d desde última visita
          -- Em risco: 46-90d
          -- Perdidos: >90d (inclui one-shots perdidos)
          -- One-shot risco: 1 visita histórica + 46-90d sem retornar
          -- One-shot perdido: 1 visita histórica + >90d sem retornar
          SELECT
            COUNT(DISTINCT bs.cliente) as total_base_s,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) <= 45 THEN bs.cliente END) as ativos,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) BETWEEN 46 AND 90 THEN bs.cliente END) as em_risco,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) > 90 THEN bs.cliente END) as perdidos,
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
        // ≤45d saudavel, 46-90d em risco, >90d perdido
        queryExternal<{ perdido: number; em_risco: number; saudavel: number; total: number }>(`
          SELECT
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) > 90 THEN bs.cliente END) as perdido,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) BETWEEN 46 AND 90 THEN bs.cliente END) as em_risco,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) <= 45 THEN bs.cliente END) as saudavel,
            COUNT(DISTINCT bs.cliente) as total
          FROM ${baseS12mSubquery} bs
          JOIN clientes c ON c.id = bs.cliente
          WHERE c.status = 1
        `),
        // ── One-Shot: Base S 12m com 1 visita histórica (usando ultima_venda) ──────────────────────────────────
        queryExternal<{ total: number; aguardando: number; em_risco: number; perdido: number }>(`
          SELECT
            COUNT(DISTINCT bs.cliente) as total,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) <= 45 THEN bs.cliente END) as aguardando,
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
        // ── Cadência Individual: Base P 24m com >=3 visitas históricas ──────────
        // Classificação por ritmo de visita (dias desde última visita vs intervalo médio)
        // Assíduo=≤60d, Regular=61-90d, Espaçando=91-120d, 1ª Vez=1 visita, Em risco=121-180d, Perdido=>180d
        queryExternal<{ assiduo: number; regular: number; espacando: number; primeira_vez: number; em_risco: number; perdido: number; total: number }>(`
          SELECT
            COUNT(DISTINCT CASE WHEN uv2.ultima_venda IS NOT NULL AND DATEDIFF('${dataFim}', uv2.ultima_venda) <= 60 AND vh.total_visitas >= 3 THEN bp.cliente END) as assiduo,
            COUNT(DISTINCT CASE WHEN uv2.ultima_venda IS NOT NULL AND DATEDIFF('${dataFim}', uv2.ultima_venda) BETWEEN 61 AND 90 AND vh.total_visitas >= 3 THEN bp.cliente END) as regular,
            COUNT(DISTINCT CASE WHEN uv2.ultima_venda IS NOT NULL AND DATEDIFF('${dataFim}', uv2.ultima_venda) BETWEEN 91 AND 120 AND vh.total_visitas >= 3 THEN bp.cliente END) as espacando,
            COUNT(DISTINCT CASE WHEN vh.total_visitas = 1 THEN bp.cliente END) as primeira_vez,
            COUNT(DISTINCT CASE WHEN uv2.ultima_venda IS NOT NULL AND DATEDIFF('${dataFim}', uv2.ultima_venda) BETWEEN 121 AND 180 AND vh.total_visitas >= 3 THEN bp.cliente END) as em_risco,
            COUNT(DISTINCT CASE WHEN uv2.ultima_venda IS NOT NULL AND DATEDIFF('${dataFim}', uv2.ultima_venda) > 180 AND vh.total_visitas >= 3 THEN bp.cliente END) as perdido,
            COUNT(DISTINCT bp.cliente) as total
          FROM ${baseP24mSubquery} bp
          JOIN clientes c ON c.id = bp.cliente
          LEFT JOIN ${visitasHistoricasSubquery} vh ON vh.cliente = bp.cliente
          LEFT JOIN ${ultimaVendaSubquery} uv2 ON uv2.cliente = bp.cliente
          WHERE c.status = 1
        `),
        // ── Movimento mensal ─────────────────────────────────────────────────────
        queryExternal<{ mes: string; atendidos: number }>(`
          SELECT
            DATE_FORMAT(v.data_criacao, '%Y-%m') as mes,
            COUNT(DISTINCT v.cliente) as atendidos
          FROM vendas v
          JOIN usuarios uu ON v.usuario = uu.id
          WHERE ${unitCondV}
            AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
            AND v.cliente IS NOT NULL AND v.cliente != 2
            AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
          GROUP BY mes ORDER BY mes
        `),
        // ── Entradas mensais ─────────────────────────────────────────────────────
        queryExternal<{ mes: string; novos: number }>(`
          SELECT
            DATE_FORMAT(c.data_criacao, '%Y-%m') as mes,
            COUNT(*) as novos
          FROM clientes c
          WHERE ${unitCondSimple} AND c.status = 1
            AND DATE(c.data_criacao) >= '${dataInicio}' AND DATE(c.data_criacao) <= '${dataFim}'
          GROUP BY mes ORDER BY mes
        `),
        // ── Risco mensal ─────────────────────────────────────────────────────────
        queryExternal<{ mes: string; em_risco: number; total_mes: number }>(`
          SELECT
            DATE_FORMAT(v.data_criacao, '%Y-%m') as mes,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', uv3.ultima_venda) BETWEEN 46 AND 90 THEN v.cliente END) as em_risco,
            COUNT(DISTINCT v.cliente) as total_mes
          FROM vendas v
          JOIN usuarios uu ON v.usuario = uu.id
          LEFT JOIN ${ultimaVendaSubquery} uv3 ON uv3.cliente = v.cliente
          WHERE ${unitCondV}
            AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
            AND v.cliente IS NOT NULL AND v.cliente != 2
            AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
          GROUP BY mes ORDER BY mes
        `),
        // ── Saúde por barbeiro ──────────────────────────────────────────────────────────────────────────────────────
        queryExternal<{ colaborador_nome: string; total: number; saudavel: number; em_risco: number; perdido: number }>(`
          SELECT
            uu.nome as colaborador_nome,
            COUNT(DISTINCT v.cliente) as total,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', uv4.ultima_venda) <= 45 THEN v.cliente END) as saudavel,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', uv4.ultima_venda) BETWEEN 46 AND 90 THEN v.cliente END) as em_risco,
            COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', uv4.ultima_venda) > 90 THEN v.cliente END) as perdido
          FROM vendas v
          JOIN usuarios uu ON v.usuario = uu.id
          LEFT JOIN ${ultimaVendaSubquery} uv4 ON uv4.cliente = v.cliente
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
          emRisco: 0,
          resgatados: 0,
        })),
        entradasMensais: entradasMensaisRows.map(r => ({
          mes: r.mes,
          novos: Number(r.novos),
          resgatados: 0,
        })),
        riscoMensal: riscoMensalRows.map(r => ({
          mes: r.mes,
          emRisco: Number(r.em_risco),
          totalMes: Number(r.total_mes),
          churnPct: Number(r.total_mes) > 0 ? Math.round((Number(r.em_risco) / Number(r.total_mes)) * 100) : 0,
        })),
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
            regra: "46d <= dias_sem_vir <= 90d",
            usadaEm: "Em Risco - Score de saude (dim. risco) - Distribuicoes",
          },
          perdidos: {
            regra: "dias_sem_vir > 90d",
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
              regras: "Saudavel: <=45d | Em Risco: 46-90d | Perdido: >90d",
              nota: "\"Perdido\" aqui e por recencia, nao definitivo. Configure em Config -> Secao 5.",
            },
            oneShot: {
              descricao: "One-shot = cliente com exatamente 1 visita historica. Sem cadencia calculavel - monitorados por recencia.",
              universo: `${dataInicio12m} – ${dataFim}`,
              total: Number(os.total),
              regras: "Aguardando: visitas=1 E dias_sem_vir <= 45d | Em risco: visitas=1 E 46d <= dias <= 90d | Perdido: visitas=1 E dias_sem_vir > 90d",
              nota: "Em risco e Perdido tambem somam nos KPIs gerais.",
            },
          },
        },
      };
    }),

  // ── One-Shot ─────────────────────────────────────────────────────────────────────────────────
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

      // Base S 12m rolling: clientes com visita nos últimos 12 meses a partir de HOJE
      // Consistente com a Visão Geral
      const baseS12mSubquery = `(
        SELECT DISTINCT v.cliente
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitCondV}
          AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
          AND v.cliente IS NOT NULL AND v.cliente != 2
          AND DATE(v.data_criacao) >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
          AND DATE(v.data_criacao) <= CURDATE()
          AND uu.visivel_agenda != 'nenhuma'
      )`;

      // Faixas de visitas no período selecionado (para clientes da Base S 12m)
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
          JOIN ${baseS12mSubquery} bs ON bs.cliente = v.cliente
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

      // Distribuição por dias de ausência — Base S 12m rolling
      // Classifica cada cliente da base S 12m pela recência atual
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
        JOIN ${baseS12mSubquery} bs ON bs.cliente = c.id
        WHERE c.status = 1 AND c.ultima_visita IS NOT NULL
        GROUP BY faixa
      `);
      for (const r of distRows) {
        if (r.faixa in distribuicao) distribuicao[r.faixa as keyof typeof distribuicao] = Number(r.total);
      }

      // Top clientes por frequência no período (da Base S 12m)
      const topClientesRows = await queryExternal<{
        id: number; nome: string; telefone: string;
        total_visitas: number; dias_medios: number;
      }>(`
        SELECT c.id, c.nome, c.telefone,
               vc.cnt as total_visitas,
               COALESCE(ROUND(DATEDIFF(MAX(v2.data_criacao), MIN(v2.data_criacao)) / NULLIF(vc.cnt - 1, 0)), 0) as dias_medios
        FROM clientes c
        JOIN ${baseS12mSubquery} bs ON bs.cliente = c.id
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
            SUM(CASE WHEN DATEDIFF(NOW(), c.ultima_visita) <= 45 THEN 1 ELSE 0 END) as ativos,
            SUM(CASE WHEN DATEDIFF(NOW(), c.ultima_visita) BETWEEN 46 AND 90 THEN 1 ELSE 0 END) as em_risco,
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
        extraCond = " AND DATEDIFF(NOW(), c.ultima_visita) BETWEEN 46 AND 90";
      } else if (tipo === "sem_telefone") {
        extraCond = " AND (c.telefone IS NULL OR c.telefone = '')";
      } else {
        extraCond = " AND ((vpc.total_visitas = 1 AND DATEDIFF(NOW(), c.ultima_visita) BETWEEN 31 AND 90) OR DATEDIFF(NOW(), c.ultima_visita) BETWEEN 46 AND 180)";
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
