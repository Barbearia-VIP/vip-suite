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
 * Agrega as vendas do Data VIP por dia (via sync_vendas.valor_total — padrão definitivo)
 * e cria/atualiza lançamentos de receita no gt_financeiro.
 * Usa INSERT ... ON DUPLICATE KEY UPDATE para idempotência.
 * Chave de deduplicação: dataVipRef = 'datavip:{unitId}:{YYYY-MM-DD}'
 *
 * Fonte: sync_vendas (mesma lógica do Data VIP e Dashboard Principal)
 * - v.unidade_id = externalId da unidade
 * - v.status = 1 (apenas vendas finalizadas)
 * - v.comanda_temp = 0
 * - v.cancelado_motivo IS NULL
 */
export async function syncGtFinanceiro(orgId: number, unitId: number, inicio: string, fim: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Buscar o externalId da unidade (mapeamento unitId interno → unidade externa)
  const [extRows] = await db.execute(
    sql`SELECT externalId FROM units WHERE id = ${unitId} AND externalId IS NOT NULL`
  ) as any;
  const extIdRaw = (extRows as any[])[0]?.externalId;
  if (!extIdRaw) {
    console.warn(`[syncGtFinanceiro] unitId=${unitId} sem externalId — pulando`);
    return;
  }
  const extId = Number(extIdRaw);

  // Buscar faturamento diário via sync_vendas.valor_total (padrão definitivo do sistema)
  // Usa v.unidade_id para filtrar por unidade — mesmo critério do Data VIP e Dashboard Principal
  const { queryLocal } = await import("./db-local");
  const diasRows = await queryLocal<{
    dia: string;
    totalFaturamento: number;
    qtd: number;
  }>(`
    SELECT
      DATE(v.data_criacao) AS dia,
      COALESCE(SUM(v.valor_total), 0) AS totalFaturamento,
      COUNT(DISTINCT v.id) AS qtd
    FROM sync_vendas v
    WHERE v.unidade_id = ${extId}
      AND v.comanda_temp = 0
      AND v.cancelado_motivo IS NULL
      AND v.status = 1
      AND DATE(v.data_criacao) BETWEEN '${inicio.slice(0, 10)}' AND '${fim.slice(0, 10)}'
    GROUP BY DATE(v.data_criacao)
    ORDER BY dia
  `);

  if (diasRows.length === 0) return;

  // Upsert de cada dia no gt_financeiro
  for (const row of diasRows) {
    const dia = typeof row.dia === 'string' ? row.dia.slice(0, 10) : new Date(row.dia).toISOString().slice(0, 10);
    const valor = parseFloat(String(row.totalFaturamento));
    const qtd = Number(row.qtd);
    if (valor <= 0) continue;
    const referencia = dia.slice(0, 7); // YYYY-MM
    const dataVipRef = `datavip:${unitId}:${dia}`;
    const descricao = `Faturamento Data VIP - ${dia} (${qtd} atendimentos)`;
    await db.execute(sql`
      INSERT INTO gt_financeiro
        (orgId, unitId, tipo, categoria, descricao, valor, vencimento, pago, paidAt, referencia, dataVipRef)
      VALUES
        (${orgId}, ${unitId}, 'receita', 'Faturamento Data VIP', ${descricao}, ${valor}, ${dia}, 1, ${dia}, ${referencia}, ${dataVipRef})
      ON DUPLICATE KEY UPDATE
        valor = VALUES(valor),
        descricao = VALUES(descricao),
        referencia = VALUES(referencia),
        updatedAt = NOW()
    `);
  }
}

// ─── Sincroniza comissões com Gestão Total (gt_financeiro como despesa) ─────────

/**
 * Calcula as comissões dos colaboradores por dia (via sync_vendas_produtos + regras_comissao)
 * e cria/atualiza lançamentos de despesa no gt_financeiro.
 * Chave de deduplicação: dataVipRef = 'comissao:{unitId}:{YYYY-MM-DD}'
 *
 * Lógica:
 * - Serviços (tipo='ser'): % de comissão de serviços (regras_comissao.percentual)
 * - Produtos (tipo like 'pro%' ou 'pac'): % de comissão de produtos (regras_comissao.pctComissaoProdutos)
 * - Bônus de meta: diferença entre % da faixa atingida e % base, sobre total de serviços
 */
export async function syncGtComissoes(orgId: number, unitId: number, inicio: string, fim: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Buscar externalId da unidade
  const [extRows] = await db.execute(
    sql`SELECT externalId FROM units WHERE id = ${unitId} AND externalId IS NOT NULL`
  ) as any;
  const extIdRaw = (extRows as any[])[0]?.externalId;
  if (!extIdRaw) {
    console.warn(`[syncGtComissoes] unitId=${unitId} sem externalId — pulando`);
    return;
  }
  const extId = Number(extIdRaw);

  const { queryLocal } = await import("./db-local");

  // Buscar regras de comissão da org (tabela regras_comissao — aba Colaboradores)
  const [regrasRows] = await db.execute(
    sql`SELECT colaboradorId, percentual, pctComissaoProdutos FROM regras_comissao WHERE ativo = 1 AND orgId = ${orgId}`
  ) as any;
  const regrasMap: Record<string, { pct: number; pctProd: number }> = {};
  for (const r of regrasRows as any[]) {
    regrasMap[String(r.colaboradorId)] = {
      pct: Number(r.percentual),
      pctProd: Number(r.pctComissaoProdutos ?? 0),
    };
  }
  if (Object.keys(regrasMap).length === 0) return; // sem regras cadastradas

  // Buscar faixas de meta para bônus (por unitId)
  const [faixasRows] = await db.execute(
    sql`SELECT valorMinServicos, pctComissao FROM meta_faixas WHERE unitId = ${unitId} AND orgId = ${orgId} AND ativo = 1 ORDER BY valorMinServicos ASC`
  ) as any;
  const faixasMeta: { valorMin: number; pct: number }[] = (faixasRows as any[]).map((f: any) => ({
    valorMin: Number(f.valorMinServicos),
    pct: Number(f.pctComissao),
  }));

  // Buscar faturamento total de serviços por colaborador por dia (para bônus de meta)
  const fatServicosRows = await queryLocal<{ colaborador: number; dia: string; totalServicos: number }>(`
    SELECT
      vp.colaborador,
      DATE(v.data_criacao) AS dia,
      SUM(CASE WHEN p.tipo = 'ser' THEN vp.valor_total ELSE 0 END) AS totalServicos
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON v.id = vp.venda
    JOIN sync_usuarios u ON u.id = vp.colaborador
    LEFT JOIN sync_produtos p ON p.id = vp.produto
    WHERE u.unidade = ${extId}
      AND v.status = 1
      AND v.comanda_temp = 0
      AND v.cancelado_motivo IS NULL
      AND DATE(v.data_criacao) BETWEEN '${inicio.slice(0, 10)}' AND '${fim.slice(0, 10)}'
    GROUP BY vp.colaborador, DATE(v.data_criacao)
  `);

  // Buscar faturamento por colaborador por dia separado por tipo
  const colabRows = await queryLocal<{ colaborador: number; dia: string; servicos: number; produtos: number }>(`
    SELECT
      vp.colaborador,
      DATE(v.data_criacao) AS dia,
      SUM(CASE WHEN p.tipo = 'ser' THEN vp.valor_total ELSE 0 END) AS servicos,
      SUM(CASE WHEN p.tipo LIKE 'pro%' OR p.tipo = 'pac' THEN vp.valor_total ELSE 0 END) AS produtos
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON v.id = vp.venda
    JOIN sync_usuarios u ON u.id = vp.colaborador
    LEFT JOIN sync_produtos p ON p.id = vp.produto
    WHERE u.unidade = ${extId}
      AND v.status = 1
      AND v.comanda_temp = 0
      AND v.cancelado_motivo IS NULL
      AND DATE(v.data_criacao) BETWEEN '${inicio.slice(0, 10)}' AND '${fim.slice(0, 10)}'
    GROUP BY vp.colaborador, DATE(v.data_criacao)
  `);

  if (colabRows.length === 0) return;

  // Calcular comissão total por dia
  const comissoesPorDia: Record<string, number> = {};
  for (const c of colabRows) {
    const diaStr = String(c.dia);
    const dia = diaStr.match(/^\d{4}-\d{2}-\d{2}$/) ? diaStr : new Date(diaStr).toISOString().slice(0, 10);
    const regra = regrasMap[String(c.colaborador)];
    if (!regra) continue;
    const servicos = parseFloat(String(c.servicos || 0));
    const produtos = parseFloat(String(c.produtos || 0));
    // Comissão base
    const comBase = Math.round((servicos * regra.pct / 100 + produtos * regra.pctProd / 100) * 100) / 100;
    // Bônus de meta: % faixa - % base sobre total serviços do colaborador no dia
    let bonus = 0;
    if (faixasMeta.length > 0) {
      const fatRow = fatServicosRows.find(
        r => String(r.colaborador) === String(c.colaborador) &&
        String(r.dia).slice(0, 10) === dia
      );
      const fatServicos = fatRow ? parseFloat(String(fatRow.totalServicos || 0)) : 0;
      const sorted = [...faixasMeta].sort((a, b) => b.valorMin - a.valorMin);
      const faixa = sorted.find(f => fatServicos >= f.valorMin);
      if (faixa) {
        const pctBonus = Math.max(0, faixa.pct - regra.pct);
        bonus = Math.round(servicos * pctBonus / 100 * 100) / 100;
      }
    }
    comissoesPorDia[dia] = (comissoesPorDia[dia] || 0) + comBase + bonus;
  }

  // Upsert de cada dia no gt_financeiro como despesa
  for (const [dia, valor] of Object.entries(comissoesPorDia)) {
    if (valor <= 0) continue;
    const valorRounded = Math.round(valor * 100) / 100;
    const referencia = dia.slice(0, 7);
    const dataVipRef = `comissao:${unitId}:${dia}`;
    const descricao = `Comissões Data VIP - ${dia}`;
    await db.execute(sql`
      INSERT INTO gt_financeiro
        (orgId, unitId, tipo, categoria, descricao, valor, vencimento, pago, paidAt, referencia, dataVipRef)
      VALUES
        (${orgId}, ${unitId}, 'despesa', 'Comissões', ${descricao}, ${valorRounded}, ${dia}, 1, ${dia}, ${referencia}, ${dataVipRef})
      ON DUPLICATE KEY UPDATE
        valor = VALUES(valor),
        descricao = VALUES(descricao),
        updatedAt = NOW()
    `);
  }
}

// ─── Sincroniza regras_comissao a partir dos percentuais nativos de sync_usuarios ─────────────

export async function syncRegrasComissao(orgId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const { queryLocal } = await import("./db-local");

  // Buscar todos os colaboradores (barbeiros) com percentuais nativos do banco externo
  const colaboradores = await queryLocal<{
    id: number;
    nome: string;
    comissao_servico: number;
    comissao_produto: number;
  }>(
    `SELECT su.id, su.nome, COALESCE(su.comissao_servico, 0) AS comissao_servico, COALESCE(su.comissao_produto, 0) AS comissao_produto
     FROM sync_usuarios su
     INNER JOIN units u ON u.externalId = CAST(su.unidade AS CHAR) AND u.orgId = ${orgId}
     WHERE su.visivel_agenda != 'nenhuma' AND su.status = 1`
  );

  if (colaboradores.length === 0) return;

  // Upsert em lote: sempre sobrescreve com os valores do banco externo
  const BATCH = 100;
  for (let i = 0; i < colaboradores.length; i += BATCH) {
    const batch = colaboradores.slice(i, i + BATCH);
    for (const c of batch) {
      await db.execute(sql`
        INSERT INTO regras_comissao (orgId, colaboradorId, percentual, pctComissaoProdutos, ativo)
        VALUES (${orgId}, ${String(c.id)}, ${c.comissao_servico}, ${c.comissao_produto}, 1)
        ON DUPLICATE KEY UPDATE
          percentual = VALUES(percentual),
          pctComissaoProdutos = VALUES(pctComissaoProdutos),
          ativo = 1,
          updatedAt = NOW()
      `);
    }
  }
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

  // Registra log — omite dataInicio/dataFim quando não fornecidos (MySQL rejeita string vazia em campo DATE)
  const [logResult] = await db.execute(
    dataInicio && dataFim
      ? sql`INSERT INTO sync_log (orgId, unitId, modo, dataInicio, dataFim, status) VALUES (${orgId}, ${unitId}, ${modo}, ${dataInicio}, ${dataFim}, 'running')`
      : sql`INSERT INTO sync_log (orgId, unitId, modo, status) VALUES (${orgId}, ${unitId}, ${modo}, 'running')`
  ) as any;
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
      UPDATE sync_log
      SET status = 'success', fetchedCount = ${totalFetched}, insertedCount = ${totalInserted},
          registrosInseridos = ${totalInserted}, durationMs = ${durationMs}, finalizadoEm = NOW()
      WHERE id = ${logId}
    `);
  } catch (e: any) {
    const durationMs = Date.now() - startTime;
    status.status = "error";
    status.lastError = e.message;
    status.durationMs = durationMs;
    status.currentBlock = null;

    await db.execute(sql`
      UPDATE sync_log
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

  // Limpar registros 'running' presos de execuções anteriores (reinicializações do servidor)
  getDb().then(db => {
    if (!db) return;
    db.execute(sql`
      UPDATE sync_log
      SET status = 'error', erro = 'Interrompido: servidor reiniciado'
      WHERE status = 'running'
        AND iniciadoEm < DATE_SUB(NOW(), INTERVAL 10 MINUTE)
    `).catch(() => {});
  }).catch(() => {});

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
