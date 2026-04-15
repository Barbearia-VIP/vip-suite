/**
 * syncEngine.ts
 * Motor de replicação local das tabelas externas.
 *
 * - importHistorico(unidadeId): importa todo o histórico de uma unidade por blocos mensais
 * - syncIncremental(unidadeId): busca apenas registros novos/alterados desde a última sync
 * - startSyncScheduler(): inicia o job automático a cada 30 minutos para todas as unidades
 */

import mysql from "mysql2/promise";
import { queryExternal } from "./db-external";
import { getDb } from "./db";
import { sql } from "drizzle-orm";

// ─── Conexão com banco local ─────────────────────────────────────────────────
async function getLocalConn() {
  const url = new URL(process.env.DATABASE_URL!);
  return mysql.createConnection({
    host: url.hostname,
    port: parseInt(url.port || "3306"),
    user: url.username,
    password: url.password,
    database: url.pathname.replace("/", ""),
    ssl: { rejectUnauthorized: false },
    connectTimeout: 30000,
  });
}

// ─── Helpers de upsert em lote ───────────────────────────────────────────────
async function upsertBatch(
  conn: mysql.Connection,
  table: string,
  rows: Record<string, unknown>[],
  conflictCols: string[] = ["id"],
  batchSize = 200
) {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  const updateSet = cols
    .filter((c) => !conflictCols.includes(c))
    .map((c) => `${c} = VALUES(${c})`)
    .join(", ");
  // Processar em lotes para evitar "too many placeholders" (limite MySQL: 65535)
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const placeholders = chunk.map(() => `(${cols.map(() => "?").join(",")})`).join(",");
    const values = chunk.flatMap((r) => cols.map((c) => r[c] ?? null));
    const q = `INSERT INTO ${table} (${cols.join(",")}) VALUES ${placeholders} ON DUPLICATE KEY UPDATE ${updateSet}, synced_at = NOW()`;
    await conn.execute(q, values);
  }
}

// ─── Buscar unidades disponíveis ─────────────────────────────────────────────
export async function getUnidadesExternas(): Promise<number[]> {
  const rows = await queryExternal(
    "SELECT DISTINCT unidade FROM usuarios WHERE status = 1 ORDER BY unidade",
    []
  );
  return (rows as { unidade: number }[]).map((r) => r.unidade);
}

// ─── Sincronizar colaboradores de uma unidade ────────────────────────────────
async function syncUsuarios(conn: mysql.Connection, unidadeId: number) {
  const rows = await queryExternal(
    `SELECT id, unidade, nome, status, visivel_agenda, visivel_pdv, visivel_dashboard,
            comissao_produto, comissao_servico,
            data_criacao, data_alteracao
     FROM usuarios WHERE unidade = ?`,
    [unidadeId]
  );
  if ((rows as unknown[]).length === 0) return 0;
  await upsertBatch(conn, "sync_usuarios", rows as Record<string, unknown>[]);
  return (rows as unknown[]).length;
}

// ─── Sincronizar produtos de uma unidade ─────────────────────────────────────
async function syncProdutos(conn: mysql.Connection, unidadeId: number) {
  const rows = await queryExternal(
    `SELECT id, unidade, tipo, categoria, nome, valor_venda, status, data_criacao, data_alteracao
     FROM produtos WHERE unidade = ?`,
    [unidadeId]
  );
  if ((rows as unknown[]).length === 0) return 0;
  await upsertBatch(conn, "sync_produtos", rows as Record<string, unknown>[]);
  return (rows as unknown[]).length;
}

// ─── Sincronizar formas de pagamento (global, sem filtro de unidade) ──────────
async function syncFormasPagamentos(conn: mysql.Connection) {
  const rows = await queryExternal(
    "SELECT id, nome, tipo FROM formas_pagamentos",
    []
  );
  if ((rows as unknown[]).length === 0) return 0;
  await upsertBatch(conn, "sync_formas_pagamentos", rows as Record<string, unknown>[]);
  return (rows as unknown[]).length;
}

// ─── Sincronizar clientes de uma unidade ─────────────────────────────────────
async function syncClientes(
  conn: mysql.Connection,
  unidadeId: number,
  dataInicio?: string,
  dataFim?: string
) {
  let where = "c.unidade = ?";
  const params: unknown[] = [unidadeId];
  if (dataInicio && dataFim) {
    where += " AND (c.data_criacao >= ? OR c.ultima_visita >= ?)";
    params.push(dataInicio, dataInicio);
  }
  const rows = await queryExternal(
    `SELECT c.id, c.unidade AS unidade_id, c.nome, c.telefone, c.telefone_sem_mascara,
            c.email, c.data_nascimento, c.ultima_visita, c.ultima_visita_unidade,
            c.ultima_visita_colaborador, c.status, c.data_criacao, c.data_alteracao
     FROM clientes c WHERE ${where}`,
    params
  );
  if ((rows as unknown[]).length === 0) return 0;
  await upsertBatch(conn, "sync_clientes", rows as Record<string, unknown>[]);
  return (rows as unknown[]).length;
}

// ─── Sincronizar vendas de um período ────────────────────────────────────────
async function syncVendasPeriodo(
  conn: mysql.Connection,
  colabIds: number[],
  unidadeId: number,
  dataInicio: string,
  dataFim: string
): Promise<{ vendas: number; vp: number; vp_ids: number[] }> {
  if (colabIds.length === 0) return { vendas: 0, vp: 0, vp_ids: [] };

  const inPlaceholder = colabIds.map(() => "?").join(",");

  // Buscar vendas_produtos do período
  const vpRows = await queryExternal(
    `SELECT vp.id, vp.venda, ? AS unidade_id, vp.colaborador, vp.produto,
            vp.quantidade, vp.valor_unitario, vp.valor_desconto, vp.valor_total,
            vp.valor_total_relatorio, vp.comissao
     FROM vendas_produtos vp
     JOIN vendas v ON v.id = vp.venda
     WHERE vp.colaborador IN (${inPlaceholder})
       AND v.data_criacao >= ? AND v.data_criacao <= ?
       AND v.comanda_temp = 0`,
    [unidadeId, ...colabIds, dataInicio, dataFim]
  );

  if ((vpRows as unknown[]).length === 0) return { vendas: 0, vp: 0, vp_ids: [] };

  // Extrair IDs de venda únicos
  const vendaIdSet = new Set((vpRows as { venda: number }[]).map((r) => r.venda));
  const vendaIds = Array.from(vendaIdSet);
  const vpIds = (vpRows as { id: number }[]).map((r) => r.id);

  // Buscar vendas
  const vendaPlaceholder = vendaIds.map(() => "?").join(",");
  const vendaRows = await queryExternal(
    `SELECT v.id, ? AS unidade_id, v.usuario, v.cliente, v.caixa,
            v.valor_total, v.desconto_total, v.cancelado_motivo,
            v.data_criacao, v.data_alteracao, v.comanda_temp, v.status
     FROM vendas v WHERE v.id IN (${vendaPlaceholder})`,
    [unidadeId, ...vendaIds]
  );

  // Buscar pagamentos
  const pagRows = await queryExternal(
    `SELECT id, venda, forma_pagamento, valor
     FROM vendas_pagamentos WHERE venda IN (${vendaPlaceholder})`,
    vendaIds
  );

  // Upsert em lote
  await upsertBatch(conn, "sync_vendas_produtos", vpRows as Record<string, unknown>[]);
  await upsertBatch(conn, "sync_vendas", vendaRows as Record<string, unknown>[]);
  if ((pagRows as unknown[]).length > 0) {
    await upsertBatch(conn, "sync_vendas_pagamentos", pagRows as Record<string, unknown>[]);
  }

  return {
    vendas: vendaIds.length,
    vp: (vpRows as unknown[]).length,
    vp_ids: vpIds,
  };
}

// ─── Atualizar controle de sync ───────────────────────────────────────────────
async function updateControle(
  conn: mysql.Connection,
  unidadeId: number,
  status: "idle" | "syncing" | "error",
  extras: Partial<{
    ultima_sync: string;
    ultima_venda_id: number;
    total_vendas: number;
    total_vp: number;
    total_clientes: number;
    erro_msg: string;
  }> = {}
) {
  const fields = ["status = ?"];
  const vals: unknown[] = [status];
  for (const [k, v] of Object.entries(extras)) {
    fields.push(`${k} = ?`);
    vals.push(v);
  }
  vals.push(unidadeId);
  await conn.execute(
    `INSERT INTO sync_controle (unidade_id, status) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE ${fields.join(", ")}`,
    [unidadeId, status, ...Object.values(extras), unidadeId].slice(0, 2 + fields.length + 1)
  );
  // Usar upsert simples
  await conn.execute(
    `INSERT INTO sync_controle (unidade_id, status) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE ${fields.join(", ")}`,
    [unidadeId, status, ...vals.slice(0, vals.length - 1)]
  );
}

async function setControle(
  conn: mysql.Connection,
  unidadeId: number,
  data: Partial<{
    status: string;
    ultima_sync: string;
    ultima_venda_id: number;
    total_vendas: number;
    total_vp: number;
    total_clientes: number;
    erro_msg: string | null;
  }>
) {
  const fields = Object.keys(data);
  if (fields.length === 0) return;
  const vals = Object.values(data);
  const setClause = fields.map((f) => `${f} = ?`).join(", ");
  await conn.execute(
    `INSERT INTO sync_controle (unidade_id, ${fields.join(", ")}) VALUES (?, ${fields.map(() => "?").join(", ")})
     ON DUPLICATE KEY UPDATE ${setClause}`,
    [unidadeId, ...vals, ...vals]
  );
}

// ─── Importação histórica completa de uma unidade ────────────────────────────
export async function importHistorico(
  unidadeId: number,
  onProgress?: (msg: string) => void
): Promise<{ ok: boolean; totalVendas: number; totalVp: number; totalClientes: number }> {
  const log = onProgress ?? console.log;
  log(`[Sync] Iniciando importação histórica da unidade ${unidadeId}`);

  const conn = await getLocalConn();
  await setControle(conn, unidadeId, { status: "syncing", erro_msg: null });

  try {
    // 1. Colaboradores e produtos
    const nUsuarios = await syncUsuarios(conn, unidadeId);
    log(`[Sync] ${nUsuarios} colaboradores sincronizados`);

    const nProdutos = await syncProdutos(conn, unidadeId);
    log(`[Sync] ${nProdutos} produtos sincronizados`);

    // 2. Formas de pagamento (global)
    const nFp = await syncFormasPagamentos(conn);
    log(`[Sync] ${nFp} formas de pagamento sincronizadas`);

    // 3. Buscar IDs dos colaboradores da unidade
    const colabRows = await queryExternal(
      "SELECT id FROM usuarios WHERE unidade = ? AND status = 1",
      [unidadeId]
    );
    const colabIds = (colabRows as { id: number }[]).map((r) => r.id);
    if (colabIds.length === 0) {
      log(`[Sync] Nenhum colaborador ativo na unidade ${unidadeId}`);
      await setControle(conn, unidadeId, { status: "idle", ultima_sync: new Date().toISOString().slice(0, 19).replace("T", " ") });
      await conn.end();
      return { ok: true, totalVendas: 0, totalVp: 0, totalClientes: 0 };
    }
    log(`[Sync] ${colabIds.length} colaboradores ativos: ${colabIds.join(", ")}`);

    // 4. Importar por blocos mensais (últimos 24 meses + mês atual)
    let totalVendas = 0;
    let totalVp = 0;
    const now = new Date();
    const meses: { inicio: string; fim: string }[] = [];

    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const inicio = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01 00:00:00`;
      const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const fim = `${ultimo.getFullYear()}-${String(ultimo.getMonth() + 1).padStart(2, "0")}-${String(ultimo.getDate()).padStart(2, "0")} 23:59:59`;
      meses.push({ inicio, fim });
    }
    // Mês atual até hoje
    const inicioMesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01 00:00:00`;
    const fimHoje = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} 23:59:59`;
    meses.push({ inicio: inicioMesAtual, fim: fimHoje });

    for (const { inicio, fim } of meses) {
      const result = await syncVendasPeriodo(conn, colabIds, unidadeId, inicio, fim);
      totalVendas += result.vendas;
      totalVp += result.vp;
      if (result.vendas > 0) {
        log(`[Sync] ${inicio.slice(0, 7)}: ${result.vendas} vendas, ${result.vp} itens`);
      }
    }

    // 5. Clientes
    const nClientes = await syncClientes(conn, unidadeId);
    log(`[Sync] ${nClientes} clientes sincronizados`);

    // 6. Atualizar controle
    await setControle(conn, unidadeId, {
      status: "idle",
      ultima_sync: new Date().toISOString().slice(0, 19).replace("T", " "),
      total_vendas: totalVendas,
      total_vp: totalVp,
      total_clientes: nClientes,
      erro_msg: null,
    });

    log(`[Sync] Unidade ${unidadeId} concluída: ${totalVendas} vendas, ${totalVp} itens, ${nClientes} clientes`);
    await conn.end();
    return { ok: true, totalVendas, totalVp, totalClientes: nClientes };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[Sync] ERRO na unidade ${unidadeId}: ${msg}`);
    await setControle(conn, unidadeId, { status: "error", erro_msg: msg });
    await conn.end();
    return { ok: false, totalVendas: 0, totalVp: 0, totalClientes: 0 };
  }
}

// ─── Sincronização incremental (últimas 48h) ─────────────────────────────────
export async function syncIncremental(
  unidadeId: number,
  onProgress?: (msg: string) => void
): Promise<{ ok: boolean; novas: number }> {
  const log = onProgress ?? (() => {});

  const conn = await getLocalConn();
  try {
    // Verificar última sync
    const [ctrlRows] = await conn.execute(
      "SELECT ultima_sync FROM sync_controle WHERE unidade_id = ?",
      [unidadeId]
    );
    const ctrl = (ctrlRows as { ultima_sync: string | null }[])[0];

    // Janela: desde 48h atrás (segurança para capturar edições tardias)
    const desde = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const dataInicio = desde.toISOString().slice(0, 19).replace("T", " ");
    const dataFim = new Date().toISOString().slice(0, 19).replace("T", " ");

    // Colaboradores
    await syncUsuarios(conn, unidadeId);
    await syncProdutos(conn, unidadeId);
    await syncFormasPagamentos(conn);

    // IDs dos colaboradores
    const colabRows = await queryExternal(
      "SELECT id FROM usuarios WHERE unidade = ? AND status = 1",
      [unidadeId]
    );
    const colabIds = (colabRows as { id: number }[]).map((r) => r.id);
    if (colabIds.length === 0) {
      await conn.end();
      return { ok: true, novas: 0 };
    }

    const result = await syncVendasPeriodo(conn, colabIds, unidadeId, dataInicio, dataFim);

    // Clientes com visita recente
    await syncClientes(conn, unidadeId, dataInicio, dataFim);

    await setControle(conn, unidadeId, {
      status: "idle",
      ultima_sync: dataFim,
      erro_msg: null,
    });

    log(`[Sync Incremental] Unidade ${unidadeId}: ${result.vendas} vendas novas/atualizadas`);

    // Sincroniza faturamento com Gestão Total (gt_financeiro) via sync_vendas
    try {
      const db = await getDb();
      if (db) {
        const [unitRows] = await db.execute(
          sql`SELECT id, orgId FROM units WHERE externalId = ${String(unidadeId)} LIMIT 1`
        ) as any;
        const unitRow = (unitRows as any[])[0];
        if (unitRow) {
          const { syncGtFinanceiro, syncGtComissoes, syncRegrasComissao } = await import("./vipDataSync");
          await syncGtFinanceiro(
            Number(unitRow.orgId),
            Number(unitRow.id),
            dataInicio.slice(0, 10),
            dataFim.slice(0, 10)
          );
          log(`[Sync Incremental] GT Financeiro sincronizado para unidade ${unidadeId}`);
          await syncGtComissoes(
            Number(unitRow.orgId),
            Number(unitRow.id),
            dataInicio.slice(0, 10),
            dataFim.slice(0, 10)
          );
          log(`[Sync Incremental] GT Comissões sincronizadas para unidade ${unidadeId}`);
          // Sincroniza regras_comissao (aba Colaboradores) com percentuais nativos do banco externo
          await syncRegrasComissao(Number(unitRow.orgId));
          log(`[Sync Incremental] Regras de comissão sincronizadas para org ${unitRow.orgId}`);
        }
      }
    } catch (gtErr) {
      // Não falha o sync principal se o GT financeiro falhar
      log(`[Sync Incremental] Aviso: GT Financeiro falhou para unidade ${unidadeId}: ${gtErr}`);
    }

    await conn.end();
    return { ok: true, novas: result.vendas };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setControle(conn, unidadeId, { status: "error", erro_msg: msg });
    await conn.end();
    return { ok: false, novas: 0 };
  }
}

// ─── Status de sincronização ─────────────────────────────────────────────────
export async function getSyncStatus(): Promise<
  {
    unidade_id: number;
    ultima_sync: string | null;
    total_vendas: number;
    total_vp: number;
    total_clientes: number;
    status: string;
    erro_msg: string | null;
  }[]
> {
  const conn = await getLocalConn();
  const [rows] = await conn.execute(
    "SELECT unidade_id, ultima_sync, total_vendas, total_vp, total_clientes, status, erro_msg FROM sync_controle ORDER BY unidade_id"
  );
  await conn.end();
  return rows as ReturnType<typeof getSyncStatus> extends Promise<infer T> ? T : never;
}

// ─── Scheduler automático ────────────────────────────────────────────────────
const SYNC_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 horas
let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let schedulerStartedAt: Date | null = null;
let lastCycleAt: Date | null = null;
let nextCycleAt: Date | null = null;

export function getSchedulerInfo() {
  return {
    ativo: schedulerTimer !== null,
    intervaloHoras: SYNC_INTERVAL_MS / (60 * 60 * 1000),
    iniciouEm: schedulerStartedAt?.toISOString() ?? null,
    ultimoCiclo: lastCycleAt?.toISOString() ?? null,
    proximoCiclo: nextCycleAt?.toISOString() ?? null,
  };
}

export function startSyncScheduler() {
  if (schedulerTimer) return;
  schedulerStartedAt = new Date();
  console.log("[Sync Scheduler] Iniciado — sincronização incremental a cada 4 horas");

  const runCycle = async () => {
    lastCycleAt = new Date();
    nextCycleAt = new Date(Date.now() + SYNC_INTERVAL_MS);
    try {
      const unidades = await getUnidadesExternas();
      console.log(`[Sync Scheduler] Ciclo iniciado para ${unidades.length} unidades`);
      for (const uid of unidades) {
        await syncIncremental(uid);
      }
      console.log("[Sync Scheduler] Ciclo concluído");
    } catch (err) {
      console.error("[Sync Scheduler] Erro no ciclo:", err);
    }
  };

  // Verificar se a última sync foi há mais de SYNC_INTERVAL_MS (4h)
  // Se sim, executar imediatamente no boot para cobrir o gap causado por restarts
  const checkAndRunOnBoot = async () => {
    try {
      const conn = await getLocalConn();
      const [rows] = await conn.execute(
        "SELECT MAX(ultima_sync) as ultima FROM sync_controle WHERE ultima_sync IS NOT NULL"
      );
      await conn.end();
      const ultimaSync = (rows as { ultima: string | null }[])[0]?.ultima;
      if (!ultimaSync) {
        console.log("[Sync Scheduler] Nenhuma sync anterior encontrada — executando ciclo inicial no boot");
        await runCycle();
        return;
      }
      const diffMs = Date.now() - new Date(ultimaSync).getTime();
      if (diffMs > SYNC_INTERVAL_MS) {
        const diffH = (diffMs / (1000 * 60 * 60)).toFixed(1);
        console.log(`[Sync Scheduler] Última sync foi há ${diffH}h — executando ciclo de recuperação no boot`);
        await runCycle();
      } else {
        const proxH = ((SYNC_INTERVAL_MS - diffMs) / (1000 * 60 * 60)).toFixed(1);
        console.log(`[Sync Scheduler] Última sync recente — próximo ciclo em ${proxH}h`);
        nextCycleAt = new Date(Date.now() + (SYNC_INTERVAL_MS - diffMs));
      }
    } catch (err) {
      console.error("[Sync Scheduler] Erro ao verificar sync no boot:", err);
      // Em caso de erro na verificação, executar ciclo por segurança
      await runCycle();
    }
  };

  // Executar verificação no boot (sem bloquear o startup do servidor)
  checkAndRunOnBoot();

  // Ciclos regulares a cada 4 horas
  schedulerTimer = setInterval(runCycle, SYNC_INTERVAL_MS);
}

export function stopSyncScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log("[Sync Scheduler] Parado");
  }
}
