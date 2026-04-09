/**
 * raioXCacheSync.ts
 * Job de sincronização noturna do cache persistente do Raio-X.
 *
 * Lógica:
 * - Roda diariamente às 02:00 BRT (05:00 UTC)
 * - Para cada unidade configurada, calcula os dados de cada mês fechado
 *   (do mês mais antigo disponível até o mês anterior ao atual)
 * - Salva no banco interno (raio_x_cache_*) usando INSERT ... ON DUPLICATE KEY UPDATE
 * - O mês atual NUNCA é cacheado — sempre calculado em tempo real
 * - Pode ser disparado manualmente via tRPC (raioX.triggerCacheSync)
 * Fase 4: migrado para banco LOCAL (tabelas sync_*) — sem SSH tunnel.
 */

import { getDb } from "./db";
import { sql } from "drizzle-orm";
import { queryLocal } from "./db-local";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface SyncOptions {
  unitId: number;
  orgId: number;
  externalId: number;
  meses?: number; // quantos meses históricos sincronizar (padrão: 24)
  forceAll?: boolean; // re-sincronizar mesmo meses já cacheados
}

// ── Helpers de data ───────────────────────────────────────────────────────────

function getMesRef(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMesAnterior(mesRef: string, n: number): string {
  const [y, m] = mesRef.split("-").map(Number);
  const d = new Date(y, m - 1 - n, 1);
  return getMesRef(d);
}

function getMesInicio(mesRef: string): string {
  return `${mesRef}-01`;
}

function getMesFim(mesRef: string): string {
  const [y, m] = mesRef.split("-").map(Number);
  const ultimo = new Date(y, m, 0); // último dia do mês
  return `${mesRef}-${String(ultimo.getDate()).padStart(2, "0")}`;
}

// ── Query de Visão Geral para um mês específico ───────────────────────────────

async function calcVisaoGeralMes(extId: number, mesRef: string): Promise<any> {
  const dataInicio = getMesInicio(mesRef);
  const dataFim = getMesFim(mesRef);
  const dataFimDate = new Date(dataFim + "T00:00:00Z");
  const dataInicio12m = new Date(dataFimDate.getTime() - 365 * 86400000).toISOString().split("T")[0];
  const dataInicio24m = new Date(dataFimDate.getTime() - 730 * 86400000).toISOString().split("T")[0];

  const unitCond = `v.unidade_id = ${extId}`;

  const ultimaVendaSubquery = `(
    SELECT v.cliente, MAX(DATE(v.data_criacao)) as ultima_venda
    FROM sync_vendas v
    WHERE ${unitCond}
      AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
      AND v.cliente IS NOT NULL AND v.cliente != 2
    GROUP BY v.cliente
  )`;

  const baseS12mSubquery = `(
    SELECT uv.cliente, uv.ultima_venda
    FROM ${ultimaVendaSubquery} uv
    WHERE uv.ultima_venda >= '${dataInicio12m}' AND uv.ultima_venda <= '${dataFim}'
  )`;

  // KPIs básicos do período
  const [kpiRows] = await Promise.all([
    queryLocal<any>(`
      SELECT
        COUNT(DISTINCT v.cliente) as total_clientes,
        COUNT(DISTINCT CASE WHEN v.cliente IS NOT NULL AND v.cliente != 2 THEN v.cliente END) as clientes_ativos,
        SUM(vp.valor_total) as faturamento,
        COUNT(DISTINCT v.id) as atendimentos
      FROM sync_vendas v
      JOIN sync_vendas_produtos vp ON vp.venda = v.id
      WHERE ${unitCond}
        AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
        AND DATE(v.data_criacao) BETWEEN '${dataInicio}' AND '${dataFim}'
    `),
  ]);

  // Distribuição por status (ativo/em_risco/perdido) baseada na última visita até dataFim
  const statusRows = await queryLocal<any>(`
    SELECT
      CASE
        WHEN DATEDIFF('${dataFim}', uv.ultima_venda) <= 60 THEN 'ativo'
        WHEN DATEDIFF('${dataFim}', uv.ultima_venda) <= 90 THEN 'em_risco'
        ELSE 'perdido'
      END as status,
      COUNT(*) as total
    FROM ${ultimaVendaSubquery} uv
    WHERE uv.ultima_venda >= '${dataInicio12m}'
    GROUP BY status
  `);

  // Novos clientes no período (primeira visita ever)
  const novosRows = await queryLocal<any>(`
    SELECT COUNT(DISTINCT v.cliente) as novos
    FROM sync_vendas v
    WHERE ${unitCond}
      AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
      AND v.cliente IS NOT NULL AND v.cliente != 2
      AND DATE(v.data_criacao) BETWEEN '${dataInicio}' AND '${dataFim}'
      AND NOT EXISTS (
        SELECT 1 FROM sync_vendas v2
        WHERE v2.unidade_id = ${extId}
          AND v2.cliente = v.cliente
          AND v2.comanda_temp = 0 AND v2.cancelado_motivo IS NULL AND v2.status = 1
          AND DATE(v2.data_criacao) < '${dataInicio}'
      )
  `);

  const kpi = kpiRows[0] || {};
  const statusDist: Record<string, number> = {};
  for (const r of statusRows) {
    statusDist[r.status] = Number(r.total);
  }

  return {
    mesRef,
    kpis: {
      totalClientes: Number(kpi.total_clientes || 0),
      clientesAtivos: Number(kpi.clientes_ativos || 0),
      faturamento: Number(kpi.faturamento || 0),
      atendimentos: Number(kpi.atendimentos || 0),
      novosClientes: Number(novosRows[0]?.novos || 0),
    },
    statusDist,
    syncedAt: new Date().toISOString(),
  };
}

// ── Query de Routing para um mês específico ──────────────────────────────────────────────────────

async function calcRoutingMes(extId: number, mesRef: string): Promise<any> {
  const dataInicio = getMesInicio(mesRef);
  const dataFim = getMesFim(mesRef);
  const unitCondU = `vp.unidade_id = ${extId}`;
  const janelaAtividade = 60;

  // Etapa 0: Barbeiros ativos no período (via sync_vendas_produtos.colaborador)
  const barbeirosAtivosRows = await queryLocal<{ barbeiro_id: number }>(`
    SELECT DISTINCT vp.colaborador as barbeiro_id
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON v.id = vp.venda
    WHERE ${unitCondU}
      AND DATE(v.data_criacao) >= '${dataInicio}'
      AND DATE(v.data_criacao) <= '${dataFim}'
      AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
      AND v.cliente IS NOT NULL AND v.cliente != 2
      AND vp.colaborador IS NOT NULL
  `);

  const barbeirosAtivosIds = barbeirosAtivosRows.map(r => Number(r.barbeiro_id));
  if (barbeirosAtivosIds.length === 0) {
    return { kpis: null, barbeiros: [], segmentosGeral: null, evolucao: [], mesRef };
  }
  const barbeirosAtivosStr = barbeirosAtivosIds.join(",");

  // Etapa 1: Clientes do período
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
    return { kpis: null, barbeiros: [], segmentosGeral: null, evolucao: [], mesRef };
  }

  const clienteIds = clientesPeriodo.map(r => Number(r.cliente_id)).slice(0, 5000);
  const clienteIdsStr = clienteIds.join(",");
  const totalClientes = clienteIds.length;

  // Etapa 2A: Barbeiros distintos NO PERÍODO por cliente
  const clientesRows = await queryLocal<{
    cliente_id: number;
    barbeiros_distintos: number;
    ultima_visita: string;
    dias_desde_ultima: number;
    ultimo_barbeiro: number;
    total_visitas_periodo: number;
  }>(`
    SELECT
      v.cliente as cliente_id,
      COUNT(DISTINCT vp.colaborador) as barbeiros_distintos,
      MAX(DATE(v.data_criacao)) as ultima_visita,
      DATEDIFF('${dataFim}', MAX(DATE(v.data_criacao))) as dias_desde_ultima,
      (SELECT vp2.colaborador FROM sync_vendas v2
        JOIN sync_vendas_produtos vp2 ON vp2.venda = v2.id AND vp2.colaborador IN (${barbeirosAtivosStr})
        WHERE v2.cliente = v.cliente
          AND DATE(v2.data_criacao) >= '${dataInicio}'
          AND DATE(v2.data_criacao) <= '${dataFim}'
          AND v2.comanda_temp = 0 AND v2.cancelado_motivo IS NULL AND v2.status = 1
        ORDER BY v2.data_criacao DESC LIMIT 1) as ultimo_barbeiro,
      COUNT(DISTINCT v.id) as total_visitas_periodo
    FROM sync_vendas v
    JOIN sync_vendas_produtos vp ON vp.venda = v.id AND vp.colaborador IN (${barbeirosAtivosStr})
    WHERE v.cliente IN (${clienteIdsStr})
      AND DATE(v.data_criacao) >= '${dataInicio}'
      AND DATE(v.data_criacao) <= '${dataFim}'
      AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
    GROUP BY v.cliente
  `);

  // KPIs gerais
  const so1Barbeiro = clientesRows.filter(r => Number(r.barbeiros_distintos) === 1).length;
  const multiBarbeiro = clientesRows.filter(r => Number(r.barbeiros_distintos) > 1).length;
  const perdidos = clientesRows.filter(r => Number(r.dias_desde_ultima) > janelaAtividade).length;
  const somaBarb = clientesRows.reduce((acc, r) => acc + Number(r.barbeiros_distintos), 0);
  const mediaBarb = totalClientes > 0 ? Math.round((somaBarb / totalClientes) * 100) / 100 : 0;

  return {
    mesRef,
    kpis: {
      totalClientes,
      so1Barbeiro,
      multiBarbeiro,
      mediaBarb,
      perdidos,
      pctSo1Barbeiro: totalClientes > 0 ? Math.round((so1Barbeiro / totalClientes) * 100) : 0,
      pctMultiBarbeiro: totalClientes > 0 ? Math.round((multiBarbeiro / totalClientes) * 100) : 0,
      pctPerdidos: totalClientes > 0 ? Math.round((perdidos / totalClientes) * 100) : 0,
      janelaAtividade,
    },
    barbeiros: [],
    segmentosGeral: null,
    evolucao: [],
    syncedAt: new Date().toISOString(),
  };
}

// ── Query de Churn para um mês específico ──────────────────────────────────────────────────────

async function calcChurnMes(extId: number, mesRef: string): Promise<any> {
  const dataFim = getMesFim(mesRef);
  const unitCond = `v.unidade_id = ${extId}`;

  const rows = await queryLocal<any>(`
    SELECT
      COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', MAX(DATE(v.data_criacao))) > 90 THEN v.cliente END) as perdidos,
      COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', MAX(DATE(v.data_criacao))) BETWEEN 61 AND 90 THEN v.cliente END) as em_risco,
      COUNT(DISTINCT v.cliente) as total
    FROM sync_vendas v
    WHERE ${unitCond}
      AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
      AND v.cliente IS NOT NULL AND v.cliente != 2
      AND DATE(v.data_criacao) >= DATE_SUB('${dataFim}', INTERVAL 620 DAY)
    GROUP BY 1=1
  `);

  const r = rows[0] || {};
  const total = Number(r.total || 0);
  const perdidos = Number(r.perdidos || 0);
  const emRisco = Number(r.em_risco || 0);

  return {
    mesRef,
    kpis: {
      churnGeral: perdidos,
      churnGeralPct: total > 0 ? Math.round((perdidos / total) * 1000) / 10 : 0,
      emRisco,
      emRiscoPct: total > 0 ? Math.round((emRisco / total) * 1000) / 10 : 0,
      total,
    },
    syncedAt: new Date().toISOString(),
  };
}

// ── Salvar no banco interno ───────────────────────────────────────────────────

async function saveCache(
  table: string,
  unitId: number,
  orgId: number,
  mesRef: string,
  dados: any
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const dadosJson = JSON.stringify(dados);
  await db.execute(sql.raw(`
    INSERT INTO \`${table}\` (unitId, orgId, mesRef, dados, syncedAt)
    VALUES (${unitId}, ${orgId}, '${mesRef}', '${dadosJson.replace(/'/g, "\\'")}', NOW())
    ON DUPLICATE KEY UPDATE dados = VALUES(dados), syncedAt = NOW(), updatedAt = NOW()
  `));
}

async function logSync(
  unitId: number,
  orgId: number,
  mesRef: string,
  tipo: string,
  status: "success" | "error",
  duracaoMs: number,
  erro?: string
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const erroEscaped = erro ? erro.replace(/'/g, "\\'").substring(0, 500) : null;
    await db.execute(sql.raw(`
      INSERT INTO raio_x_cache_sync_log (unitId, orgId, mesRef, tipo, status, duracaoMs, erro)
      VALUES (${unitId}, ${orgId}, '${mesRef}', '${tipo}', '${status}', ${duracaoMs}, ${erroEscaped ? `'${erroEscaped}'` : "NULL"})
    `));
  } catch (_) { /* silencia erros de log */ }
}

// ── Verificar se mês já está cacheado ────────────────────────────────────────

async function isCached(table: string, unitId: number, mesRef: string): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;
    const [rows] = await db.execute(sql.raw(`
      SELECT id FROM \`${table}\` WHERE unitId = ${unitId} AND mesRef = '${mesRef}' LIMIT 1
    `)) as any;
    return (rows as any[]).length > 0;
  } catch (_) {
    return false;
  }
}

// ── Sincronizar uma unidade ───────────────────────────────────────────────────

export async function syncRaioXCacheUnit(opts: SyncOptions): Promise<{ synced: number; skipped: number; errors: number }> {
  const { unitId, orgId, externalId, meses = 24, forceAll = false } = opts;
  const mesAtual = getMesRef(new Date());
  let synced = 0, skipped = 0, errors = 0;

  console.log(`[RaioX Cache] Iniciando sync unitId=${unitId} extId=${externalId} meses=${meses}`);

  for (let i = 1; i <= meses; i++) {
    const mesRef = getMesAnterior(mesAtual, i);

    // Visão Geral
    try {
      const jaTemVG = !forceAll && await isCached("raio_x_cache_visao_geral", unitId, mesRef);
      if (jaTemVG) {
        skipped++;
      } else {
        const t0 = Date.now();
        const dados = await calcVisaoGeralMes(externalId, mesRef);
        await saveCache("raio_x_cache_visao_geral", unitId, orgId, mesRef, dados);
        await logSync(unitId, orgId, mesRef, "visao_geral", "success", Date.now() - t0);
        synced++;
        console.log(`[RaioX Cache] visao_geral ${mesRef} OK (${Date.now() - t0}ms)`);
      }
    } catch (err: any) {
      errors++;
      await logSync(unitId, orgId, mesRef, "visao_geral", "error", 0, err?.message);
      console.error(`[RaioX Cache] visao_geral ${mesRef} ERRO:`, err?.message);
    }

    // Churn
    try {
      const jaTemChurn = !forceAll && await isCached("raio_x_cache_churn", unitId, mesRef);
      if (jaTemChurn) {
        skipped++;
      } else {
        const t0 = Date.now();
        const dados = await calcChurnMes(externalId, mesRef);
        await saveCache("raio_x_cache_churn", unitId, orgId, mesRef, dados);
        await logSync(unitId, orgId, mesRef, "churn", "success", Date.now() - t0);
        synced++;
        console.log(`[RaioX Cache] churn ${mesRef} OK (${Date.now() - t0}ms)`);
      }
    } catch (err: any) {
      errors++;
      await logSync(unitId, orgId, mesRef, "churn", "error", 0, err?.message);
      console.error(`[RaioX Cache] churn ${mesRef} ERRO:`, err?.message);
    }

    // Routing
    try {
      const jaTemRouting = !forceAll && await isCached("raio_x_cache_routing", unitId, mesRef);
      if (jaTemRouting) {
        skipped++;
      } else {
        const t0 = Date.now();
        const dados = await calcRoutingMes(externalId, mesRef);
        await saveCache("raio_x_cache_routing", unitId, orgId, mesRef, dados);
        await logSync(unitId, orgId, mesRef, "routing", "success", Date.now() - t0);
        synced++;
        console.log(`[RaioX Cache] routing ${mesRef} OK (${Date.now() - t0}ms)`);
      }
    } catch (err: any) {
      errors++;
      await logSync(unitId, orgId, mesRef, "routing", "error", 0, err?.message);
      console.error(`[RaioX Cache] routing ${mesRef} ERRO:`, err?.message);
    }

    // Aguarda 500ms entre meses (banco local — sem necessidade de throttle agressivo)
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`[RaioX Cache] Sync concluído unitId=${unitId}: synced=${synced} skipped=${skipped} errors=${errors}`);
  return { synced, skipped, errors };
}

// ── Job noturno: sincroniza todas as unidades configuradas ───────────────────

export async function runRaioXCacheSyncJob(forceAll = false): Promise<void> {
  console.log("[RaioX Cache Job] Iniciando job noturno...");
  try {
    const db = await getDb();
    if (!db) { console.error("[RaioX Cache Job] DB indisponível"); return; }

    // Buscar todas as unidades com externalId configurado
    const [rows] = await db.execute(sql`
      SELECT u.id as unitId, u.orgId, u.externalId, u.name
      FROM units u
      WHERE u.externalId IS NOT NULL AND u.externalId != ''
    `) as any;

    const units = rows as any[];
    console.log(`[RaioX Cache Job] ${units.length} unidade(s) encontrada(s)`);

    for (const unit of units) {
      try {
        await syncRaioXCacheUnit({
          unitId: Number(unit.unitId),
          orgId: Number(unit.orgId),
          externalId: Number(unit.externalId),
          meses: 24,
          forceAll,
        });
      } catch (err: any) {
        console.error(`[RaioX Cache Job] Erro na unidade ${unit.name}:`, err?.message);
      }
      // Aguarda 5s entre unidades
      await new Promise((r) => setTimeout(r, 5000));
    }

    console.log("[RaioX Cache Job] Job noturno concluído.");
  } catch (err: any) {
    console.error("[RaioX Cache Job] Erro fatal:", err?.message);
  }
}

// ── Buscar dados do cache interno ────────────────────────────────────────────

export async function getCachedVisaoGeral(unitId: number, mesRef: string): Promise<any | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const [rows] = await db.execute(sql.raw(`
      SELECT dados FROM raio_x_cache_visao_geral
      WHERE unitId = ${unitId} AND mesRef = '${mesRef}'
      LIMIT 1
    `)) as any;
    const row = (rows as any[])[0];
    if (!row) return null;
    return typeof row.dados === "string" ? JSON.parse(row.dados) : row.dados;
  } catch (_) {
    return null;
  }
}

export async function getCachedChurn(unitId: number, mesRef: string): Promise<any | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const [rows] = await db.execute(sql.raw(`
      SELECT dados FROM raio_x_cache_churn
      WHERE unitId = ${unitId} AND mesRef = '${mesRef}'
      LIMIT 1
    `)) as any;
    const row = (rows as any[])[0];
    if (!row) return null;
    return typeof row.dados === "string" ? JSON.parse(row.dados) : row.dados;
  } catch (_) {
    return null;
  }
}

// ── Helpers genéricos: busca do cache por período ──────────────────────────────────────────────────────

/**
 * Detecta se o período (dataInicio, dataFim) corresponde a um mês fechado completo
 * que já passou (anterior ao mês atual). Se sim, retorna o mesRef ('YYYY-MM').
 * Caso contrário retorna null (deve ir ao SSH).
 */
export function detectMesFechado(dataInicio: string, dataFim: string): string | null {
  const mesAtual = getMesRef(new Date());
  const mesDataFim = dataFim.substring(0, 7);
  if (mesDataFim >= mesAtual) return null;
  const mesDataInicio = dataInicio.substring(0, 7);
  if (mesDataInicio !== mesDataFim) return null;
  const expectedInicio = getMesInicio(mesDataFim);
  const expectedFim = getMesFim(mesDataFim);
  if (dataInicio !== expectedInicio || dataFim !== expectedFim) return null;
  return mesDataFim;
}

export async function getCachedVisaoGeralByPeriod(
  unitId: number,
  dataInicio: string,
  dataFim: string
): Promise<any | null> {
  const mesRef = detectMesFechado(dataInicio, dataFim);
  if (!mesRef) return null;
  return getCachedVisaoGeral(unitId, mesRef);
}

export async function getCachedChurnByPeriod(
  unitId: number,
  dataInicio: string,
  dataFim: string
): Promise<any | null> {
  const mesRef = detectMesFechado(dataInicio, dataFim);
  if (!mesRef) return null;
  return getCachedChurn(unitId, mesRef);
}

export async function getCachedRoutingByPeriod(
  unitId: number,
  dataInicio: string,
  dataFim: string
): Promise<any | null> {
  const mesRef = detectMesFechado(dataInicio, dataFim);
  if (!mesRef) return null;
  try {
    const db = await getDb();
    if (!db) return null;
    const [rows] = await db.execute(sql.raw(`
      SELECT dados FROM raio_x_cache_routing
      WHERE unitId = ${unitId} AND mesRef = '${mesRef}'
      LIMIT 1
    `)) as any;
    const row = (rows as any[])[0];
    if (!row) return null;
    return typeof row.dados === "string" ? JSON.parse(row.dados) : row.dados;
  } catch (_) {
    return null;
  }
}

// ── Scheduler noturno (02:00 BRT = 05:00 UTC) ──────────────────────────────────────────────────────

let syncScheduled = false;

export function scheduleDailyRaioXSync(): void {
  if (syncScheduled) return;
  syncScheduled = true;

  function msUntilNext5UTC(): number {
    const now = new Date();
    const next = new Date();
    next.setUTCHours(5, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next.getTime() - now.getTime();
  }

  function scheduleNext() {
    const ms = msUntilNext5UTC();
    console.log(`[RaioX Cache] Próxima sync em ${Math.round(ms / 60000)} minutos`);
    setTimeout(async () => {
      await runRaioXCacheSyncJob(false);
      scheduleNext();
    }, ms);
  }

  scheduleNext();
}
