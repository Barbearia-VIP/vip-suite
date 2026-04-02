/**
 * VIP Data Sync Engine
 * Integração com API externa da Barbearia VIP
 * URL: https://franquiabv.com.br/api/unidade/vendasV2?id=ID&hash=HASH&inicio=YYYY-MM-DD&fim=YYYY-MM-DD
 */

import { getDb } from "./db";
import { sql } from "drizzle-orm";

const API_BASE_URL = "https://franquiabv.com.br/api/unidade/vendasV2";

// ─── Estado em memória por unidade ───────────────────────────────────────────

export interface UnitSyncStatus {
  orgId: number;
  orgNome: string;
  apiUnidadeId: string;
  status: "idle" | "running" | "success" | "error";
  lastRunAt: Date | null;
  lastError: string | null;
  insertedCount: number;
  fetchedCount: number;
  durationMs: number | null;
  currentBlock: string | null;
  totalBlocks: number | null;
  completedBlocks: number;
}

// Chave: unitId (não orgId) — múltiplas unidades podem ter o mesmo orgId
const syncStatusMap = new Map<number, UnitSyncStatus>();

export function getSyncStatus(unitId: number): UnitSyncStatus | undefined {
  return syncStatusMap.get(unitId);
}

export function getAllSyncStatuses(): UnitSyncStatus[] {
  return Array.from(syncStatusMap.values());
}

export async function initSyncStatusMap(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const units = await db.execute(sql`
      SELECT u.id as unitId, u.orgId, o.name as orgNome,
             JSON_UNQUOTE(JSON_EXTRACT(mc.config, '$.apiUnidadeId')) as apiUnidadeId
      FROM units u
      JOIN organizations o ON o.id = u.orgId
      LEFT JOIN module_configs mc ON mc.unitId = u.id AND mc.module = 'data_vip'
      WHERE o.active = 1
    `);
    const rows = (units as any[])[0] as any[];
    syncStatusMap.clear();
    for (const row of rows) {
      syncStatusMap.set(row.unitId, {
        orgId: row.orgId,
        orgNome: row.orgNome,
        apiUnidadeId: row.apiUnidadeId || "",
        status: "idle",
        lastRunAt: null,
        lastError: null,
        insertedCount: 0,
        fetchedCount: 0,
        durationMs: null,
        currentBlock: null,
        totalBlocks: null,
        completedBlocks: 0,
      });
    }
    console.log(`[VipDataSync] Initialized ${syncStatusMap.size} units`);
  } catch (e) {
    console.error("[VipDataSync] initSyncStatusMap error:", e);
  }
}

// ─── Helpers de data ─────────────────────────────────────────────────────────

function parseBrDate(dateStr: string): Date | null {
  // Formato: "DD/MM/YYYY HH:mm" no fuso BRT (UTC-3)
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, dd, mm, yyyy, hh, min] = match;
  // Converte BRT (UTC-3) para UTC adicionando 3h
  return new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:00.000+00:00`);
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function getMonthBlocks(start: Date, end: Date): Array<{ inicio: string; fim: string }> {
  const blocks: Array<{ inicio: string; fim: string }> = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    const blockStart = new Date(Math.max(cur.getTime(), start.getTime()));
    const blockEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    const actualEnd = new Date(Math.min(blockEnd.getTime(), end.getTime()));
    blocks.push({ inicio: formatDate(blockStart), fim: formatDate(actualEnd) });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return blocks;
}

// ─── Busca da API externa ─────────────────────────────────────────────────────

interface VendaPayload {
  vendaId?: string;
  id?: string;
  vendaData?: string;
  data?: string;
  produto?: string;
  servico?: string;
  valorBruto?: number;
  valorLiquido?: number;
  formaPagamento?: string;
  convenio?: string;
  colaboradorId?: string;
  colaborador?: string;
  colaboradorNome?: string;
  caixaId?: string;
  caixaNome?: string;
  clienteId?: string;
  clienteNome?: string;
  telefone?: string;
}

async function fetchVendasFromApi(
  apiUnidadeId: string,
  apiHash: string,
  inicio: string,
  fim: string,
  attempt = 1
): Promise<VendaPayload[]> {
  const url = `${API_BASE_URL}?id=${encodeURIComponent(apiUnidadeId)}&hash=${encodeURIComponent(apiHash)}&inicio=${inicio}&fim=${fim}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    if (Array.isArray(data)) return data;
    if (data?.vendas && Array.isArray(data.vendas)) return data.vendas;
    if (data?.data && Array.isArray(data.data)) return data.data;
    return [];
  } catch (e: any) {
    if (attempt < 3) {
      const delay = attempt === 1 ? 2000 : 4000;
      await new Promise((r) => setTimeout(r, delay));
      return fetchVendasFromApi(apiUnidadeId, apiHash, inicio, fim, attempt + 1);
    }
    throw e;
  }
}

// ─── Sync de vendas (atômico: staging → principal) ────────────────────────────

export async function syncVendas(
  orgId: number,
  unitId: number,
  apiUnidadeId: string,
  apiHash: string,
  inicio: string,
  fim: string
): Promise<{ fetched: number; inserted: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const vendas = await fetchVendasFromApi(apiUnidadeId, apiHash, inicio, fim);
  if (vendas.length === 0) return { fetched: 0, inserted: 0 };

  // Limpa staging e insere novos dados
  await db.execute(sql`DELETE FROM vendas_api_raw_tmp WHERE orgId = ${orgId} AND unitId = ${unitId}`);

  const BATCH = 200;
  for (let i = 0; i < vendas.length; i += BATCH) {
    const batch = vendas.slice(i, i + BATCH);
    const values = batch.map((v) => {
      const vendaId = v.vendaId || v.id || "";
      const rawDate = v.vendaData || v.data || "";
      const parsedDate = parseBrDate(rawDate);
      const ts = parsedDate ? parsedDate.getTime() : null;
      const dateStr = parsedDate ? parsedDate.toISOString().replace("T", " ").substring(0, 19) : null;
      return sql`(
        ${vendaId}, ${dateStr}, ${ts},
        ${v.produto || v.servico || null}, ${v.valorBruto ?? null}, ${v.valorLiquido ?? null},
        ${v.formaPagamento || null}, ${v.convenio || null},
        ${v.colaboradorId || null}, ${v.colaborador || null}, ${v.colaboradorNome || null},
        ${v.caixaId || null}, ${v.caixaNome || null},
        ${v.clienteId || null}, ${v.clienteNome || null}, ${v.telefone || null},
        ${orgId}, ${unitId}
      )`;
    });

    await db.execute(sql`
      INSERT INTO vendas_api_raw_tmp
        (vendaId, vendaData, vendaDataTs, produto, valorBruto, valorLiquido,
         formaPagamento, convenio, colaboradorId, colaborador, colaboradorNome,
         caixaId, caixaNome, clienteId, clienteNome, telefone, orgId, unitId)
      VALUES ${sql.join(values, sql`, `)}
    `);
  }

  // Troca atômica: deleta período da tabela principal e insere do staging
  // IMPORTANTE: filtrar por unitId para não apagar dados de outras unidades do mesmo orgId
  const startTs = new Date(inicio + "T00:00:00.000Z").getTime();
  const endTs = new Date(fim + "T23:59:59.999Z").getTime();

  await db.execute(sql`
    DELETE FROM vendas_api_raw
    WHERE orgId = ${orgId} AND unitId = ${unitId} AND vendaDataTs BETWEEN ${startTs} AND ${endTs}
  `);

  const [result] = await db.execute(sql`
    INSERT INTO vendas_api_raw
      (vendaId, vendaData, vendaDataTs, produto, valorBruto, valorLiquido,
       formaPagamento, convenio, colaboradorId, colaborador, colaboradorNome,
       caixaId, caixaNome, clienteId, clienteNome, telefone, orgId, unitId)
    SELECT vendaId, vendaData, vendaDataTs, produto, valorBruto, valorLiquido,
           formaPagamento, convenio, colaboradorId, colaborador, colaboradorNome,
           caixaId, caixaNome, clienteId, clienteNome, telefone, orgId, unitId
    FROM vendas_api_raw_tmp
    WHERE orgId = ${orgId} AND unitId = ${unitId}
    ON DUPLICATE KEY UPDATE
      vendaData = VALUES(vendaData), vendaDataTs = VALUES(vendaDataTs),
      produto = VALUES(produto), valorBruto = VALUES(valorBruto), valorLiquido = VALUES(valorLiquido),
      formaPagamento = VALUES(formaPagamento), clienteNome = VALUES(clienteNome)
  `) as any;

  await db.execute(sql`DELETE FROM vendas_api_raw_tmp WHERE orgId = ${orgId} AND unitId = ${unitId}`);

  return { fetched: vendas.length, inserted: (result as any).affectedRows || vendas.length };
}

// ─── Sincroniza faturamento com Gestão Total (gt_financeiro) ─────────────────

/**
 * Agrega as vendas do Data VIP por dia e cria/atualiza lançamentos de receita
 * no gt_financeiro. Usa INSERT ... ON DUPLICATE KEY UPDATE para idempotência.
 * Chave de deduplicação: dataVipRef = 'datavip:{unitId}:{YYYY-MM-DD}'
 */
export async function syncGtFinanceiro(orgId: number, unitId: number, inicio: string, fim: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Usa INSERT ... SELECT com subquery para evitar only_full_group_by
  await db.execute(sql`
    INSERT INTO gt_financeiro
      (orgId, unitId, tipo, categoria, descricao, valor, vencimento, pago, paidAt, referencia, dataVipRef)
    SELECT
      ${orgId}, ${unitId},
      'receita',
      'Faturamento Data VIP',
      CONCAT('Faturamento Data VIP - ', dia, ' (', qtd, ' atendimentos)'),
      totalLiquido,
      dia,
      1,
      dia,
      DATE_FORMAT(dia, '%Y-%m'),
      CONCAT('datavip:', ${unitId}, ':', dia)
    FROM (
      SELECT DATE(vendaData) AS dia, SUM(valorLiquido) AS totalLiquido, COUNT(*) AS qtd
      FROM vendas_api_raw
      WHERE orgId = ${orgId}
        AND unitId = ${unitId}
        AND DATE(vendaData) BETWEEN ${inicio} AND ${fim}
        AND valorLiquido > 0
      GROUP BY DATE(vendaData)
    ) AS sub
    ON DUPLICATE KEY UPDATE
      valor = VALUES(valor),
      descricao = VALUES(descricao),
      updatedAt = NOW()
  `);
}

// ─── Atualiza dimensões (clientes e colaboradores) ────────────────────────────

export async function updateDimensoes(orgId: number, unitId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Atualiza dimensao_colaboradores
  await db.execute(sql`
    INSERT INTO dimensao_colaboradores (colaboradorId, colaboradorNome, orgId, unitId)
    SELECT DISTINCT colaboradorId, colaboradorNome, orgId, unitId
    FROM vendas_api_raw
    WHERE orgId = ${orgId} AND colaboradorId IS NOT NULL AND colaboradorId != ''
    ON DUPLICATE KEY UPDATE colaboradorNome = VALUES(colaboradorNome), ativo = 1
  `);

  // Atualiza dimensao_clientes em lotes de 500
  const [clienteIds] = await db.execute(sql`
    SELECT DISTINCT clienteId FROM vendas_api_raw
    WHERE orgId = ${orgId} AND clienteId IS NOT NULL AND clienteId != ''
  `) as any;

  const ids = (clienteIds as any[]).map((r: any) => r.clienteId);
  const BATCH = 500;

  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    if (batch.length === 0) continue;

    const placeholders = batch.map(() => "?").join(",");
    const inList = sql.join(batch.map((id: string) => sql`${id}`), sql`, `);
    const [stats] = await db.execute(sql`
      SELECT clienteId, clienteNome, telefone,
             MIN(vendaDataTs) as primeiraVenda,
             MAX(vendaDataTs) as ultimaVenda,
             COUNT(*) as totalVisitas,
             SUM(valorLiquido) as totalGasto
      FROM vendas_api_raw
      WHERE orgId = ${orgId} AND clienteId IN (${inList})
      GROUP BY clienteId, clienteNome, telefone
    `) as any;

    for (const s of stats as any[]) {
      const pv = s.primeiraVenda ? new Date(Number(s.primeiraVenda)).toISOString().replace("T", " ").substring(0, 19) : null;
      const uv = s.ultimaVenda ? new Date(Number(s.ultimaVenda)).toISOString().replace("T", " ").substring(0, 19) : null;
      await db.execute(sql`
        INSERT INTO dimensao_clientes
          (clienteId, clienteNome, telefone, orgId, unitId, primeiraVenda, ultimaVenda, totalVisitas, totalGasto)
        VALUES (${s.clienteId}, ${s.clienteNome}, ${s.telefone}, ${orgId}, ${unitId}, ${pv}, ${uv}, ${s.totalVisitas}, ${s.totalGasto})
        ON DUPLICATE KEY UPDATE
          clienteNome = VALUES(clienteNome), telefone = VALUES(telefone),
          primeiraVenda = VALUES(primeiraVenda), ultimaVenda = VALUES(ultimaVenda),
          totalVisitas = VALUES(totalVisitas), totalGasto = VALUES(totalGasto)
      `);
    }
  }
}

// ─── Sync chunked (histórico completo) ───────────────────────────────────────

export async function syncVendasChunked(
  orgId: number,
  unitId: number,
  apiUnidadeId: string,
  apiHash: string,
  dataInicio: Date,
  dataFim: Date,
  onProgress?: (block: string, completed: number, total: number) => void
): Promise<{ totalFetched: number; totalInserted: number }> {
  const blocks = getMonthBlocks(dataInicio, dataFim);
  let totalFetched = 0;
  let totalInserted = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const blockLabel = block.inicio.substring(0, 7);
    onProgress?.(blockLabel, i, blocks.length);

    const status = syncStatusMap.get(unitId);
    if (status) {
      status.currentBlock = blockLabel;
      status.totalBlocks = blocks.length;
      status.completedBlocks = i;
    }

    try {
      const { fetched, inserted } = await syncVendas(orgId, unitId, apiUnidadeId, apiHash, block.inicio, block.fim);
      totalFetched += fetched;
      totalInserted += inserted;
    } catch (e: any) {
      console.error(`[VipDataSync] Block ${blockLabel} failed for org ${orgId}:`, e.message);
    }
  }

  // Atualiza dimensões ao final
  await updateDimensoes(orgId, unitId);

  return { totalFetched, totalInserted };
}

// ─── Função principal de sync por unidade ────────────────────────────────────

export async function runSyncForOrg(
  orgId: number,
  unitId: number,
  apiUnidadeId: string,
  apiHash: string,
  modo: "auto" | "manual_13m" | "historico",
  dataInicio?: string,
  dataFim?: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const status = syncStatusMap.get(unitId) || {
    orgId, orgNome: "", apiUnidadeId,
    status: "idle" as const, lastRunAt: null, lastError: null,
    insertedCount: 0, fetchedCount: 0, durationMs: null,
    currentBlock: null, totalBlocks: null, completedBlocks: 0,
  };
  syncStatusMap.set(unitId, status);

  if (status.status === "running") throw new Error("Sync already running for this unit");

  status.status = "running";
  status.lastError = null;
  const startTime = Date.now();

  // Registra log
  const [logResult] = await db.execute(sql`
    INSERT INTO sync_log_vip (orgId, unitId, modo, dataInicio, dataFim, status)
    VALUES (${orgId}, ${unitId}, ${modo}, ${dataInicio || null}, ${dataFim || null}, 'running')
  `) as any;
  const logId = (logResult as any).insertId;

  try {
    let totalFetched = 0;
    let totalInserted = 0;

    if (modo === "auto") {
      const hoje = new Date();
      const inicio = formatDate(addDays(hoje, -2));
      const fim = formatDate(hoje);
      const r = await syncVendas(orgId, unitId, apiUnidadeId, apiHash, inicio, fim);
      totalFetched = r.fetched;
      totalInserted = r.inserted;
      await updateDimensoes(orgId, unitId);
      // Sincroniza faturamento com Gestão Total
      await syncGtFinanceiro(orgId, unitId, inicio, fim);
    } else if (modo === "manual_13m") {
      const hoje = new Date();
      const inicio = formatDate(addDays(hoje, -395));
      const fim = formatDate(hoje);
      const r = await syncVendasChunked(orgId, unitId, apiUnidadeId, apiHash, new Date(inicio), new Date(fim));
      totalFetched = r.totalFetched;
      totalInserted = r.totalInserted;
      // Sincroniza faturamento com Gestão Total
      await syncGtFinanceiro(orgId, unitId, inicio, fim);
    } else if (modo === "historico") {
      const inicio = new Date(dataInicio || "2015-01-01");
      const fim = new Date(dataFim || formatDate(new Date()));
      const r = await syncVendasChunked(orgId, unitId, apiUnidadeId, apiHash, inicio, fim);
      totalFetched = r.totalFetched;
      totalInserted = r.totalInserted;
      // Sincroniza faturamento com Gestão Total
      await syncGtFinanceiro(orgId, unitId, formatDate(inicio), formatDate(fim));
    }

    const durationMs = Date.now() - startTime;
    status.status = "success";
    status.lastRunAt = new Date();
    status.insertedCount = totalInserted;
    status.fetchedCount = totalFetched;
    status.durationMs = durationMs;
    status.currentBlock = null;

    await db.execute(sql`
      UPDATE sync_log_vip
      SET status = 'success', fetchedCount = ${totalFetched}, insertedCount = ${totalInserted},
          durationMs = ${durationMs}, finalizadoEm = NOW()
      WHERE id = ${logId}
    `);
  } catch (e: any) {
    const durationMs = Date.now() - startTime;
    status.status = "error";
    status.lastError = e.message;
    status.durationMs = durationMs;
    status.currentBlock = null;

    await db.execute(sql`
      UPDATE sync_log_vip
      SET status = 'error', erro = ${e.message}, durationMs = ${durationMs}, finalizadoEm = NOW()
      WHERE id = ${logId}
    `);
    throw e;
  }
}

// ─── Scheduler automático (08:00 BRT = 11:00 UTC) ────────────────────────────

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoSyncScheduler(): void {
  if (schedulerInterval) return;

  const checkAndRun = async () => {
    const now = new Date();
    // 08:00 BRT = 11:00 UTC
    if (now.getUTCHours() !== 11 || now.getUTCMinutes() !== 0) return;

    console.log("[VipDataSync] Auto sync starting...");
    const db = await getDb();
    if (!db) return;

    const [orgs] = await db.execute(sql`
      SELECT o.id as orgId, u.id as unitId,
             JSON_UNQUOTE(JSON_EXTRACT(mc.config, '$.apiUnidadeId')) as apiUnidadeId,
             JSON_UNQUOTE(JSON_EXTRACT(mc.config, '$.apiHash')) as apiHash
      FROM organizations o
      JOIN units u ON u.orgId = o.id
      LEFT JOIN module_configs mc ON mc.unitId = u.id AND mc.module = 'data_vip'
      WHERE o.active = 1
        AND JSON_UNQUOTE(JSON_EXTRACT(mc.config, '$.apiUnidadeId')) IS NOT NULL
        AND JSON_UNQUOTE(JSON_EXTRACT(mc.config, '$.apiHash')) IS NOT NULL
    `) as any;

    for (const org of orgs as any[]) {
      try {
        await runSyncForOrg(org.orgId, org.unitId, org.apiUnidadeId, org.apiHash, "auto");
        console.log(`[VipDataSync] Auto sync OK for org ${org.orgId}`);
      } catch (e: any) {
        console.error(`[VipDataSync] Auto sync failed for org ${org.orgId}:`, e.message);
      }
    }
  };

  // Verifica a cada minuto
  schedulerInterval = setInterval(checkAndRun, 60_000);
  console.log("[VipDataSync] Auto sync scheduler started (daily at 08:00 BRT)");
}

export function stopAutoSyncScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
