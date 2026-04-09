/**
 * import-full-history.mjs
 * Importação histórica completa de todas as unidades.
 * Usa o tunnel SSH já ativo na porta 13307 (iniciado pelo servidor).
 * Roda desde o início dos dados até ontem, em blocos mensais.
 *
 * Mapeamento de colunas (externo → local):
 *   vendas            → sync_vendas          (id, unidade_id*, usuario, cliente, caixa, valor_total, desconto_total, cancelado_motivo, data_criacao, data_alteracao, comanda_temp, status)
 *   vendas_produtos   → sync_vendas_produtos  (id, venda, unidade_id*, colaborador, produto, quantidade, valor_unitario, valor_desconto, valor_total, valor_total_relatorio, comissao)
 *   vendas_pagamentos → sync_vendas_pagamentos (id, venda, forma_pagamento, valor)
 *   clientes          → sync_clientes         (id, unidade_id*, nome, telefone, telefone_sem_mascara, email, data_nascimento, ultima_visita, ultima_visita_unidade, ultima_visita_colaborador, status, data_criacao, data_alteracao)
 *   usuarios          → sync_usuarios         (id, unidade, nome, status, visivel_agenda, visivel_pdv, visivel_dashboard, data_criacao, data_alteracao)
 *   produtos          → sync_produtos         (id, unidade, tipo, categoria, nome, valor_venda, status, data_criacao, data_alteracao)
 *   formas_pagamentos → sync_formas_pagamentos (id, nome, tipo)
 *
 * * unidade_id é adicionado pelo script (não existe no banco externo)
 */
import { createPool } from "mysql2/promise";
import { config } from "dotenv";

config({ path: "/home/ubuntu/vip-suite/.env" });

// ─── Pools de conexão ─────────────────────────────────────────────────────────
const extPool = createPool({
  host: "127.0.0.1",
  port: 13307,
  user: process.env.DB_EXT_USER,
  password: process.env.DB_EXT_PASS,
  database: process.env.DB_EXT_NAME,
  connectionLimit: 3,
  connectTimeout: 30000,
  waitForConnections: true,
  // Sem typeCast — datas tratadas via NULLIF no SQL
});

const localUrl = new URL(process.env.DATABASE_URL);
const localPool = createPool({
  host: localUrl.hostname,
  port: parseInt(localUrl.port || "3306"),
  user: localUrl.username,
  password: localUrl.password,
  database: localUrl.pathname.replace("/", ""),
  ssl: { rejectUnauthorized: false },
  connectionLimit: 5,
  connectTimeout: 30000,
  waitForConnections: true,
});

// ─── Helper: upsert em lote ───────────────────────────────────────────────────
async function upsertBatch(conn, table, rows, batchSize = 300) {
  if (rows.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const cols = Object.keys(batch[0]);
    const placeholders = batch.map(() => `(${cols.map(() => "?").join(",")})`).join(",");
    const values = batch.flatMap((r) => cols.map((c) => r[c] ?? null));
    const updateSet = cols.filter(c => c !== "id").map((c) => `${c} = VALUES(${c})`).join(", ");
    const q = `INSERT INTO ${table} (${cols.join(",")}) VALUES ${placeholders} ON DUPLICATE KEY UPDATE ${updateSet}, synced_at = NOW()`;
    await conn.execute(q, values);
    total += batch.length;
  }
  return total;
}

// ─── Helper: query no banco externo ──────────────────────────────────────────
async function queryExt(sql, params = []) {
  const conn = await extPool.getConnection();
  try {
    // Desabilitar modo estrito para aceitar datas 0000-00-00
    // Usar query() em vez de execute() para evitar bug de OFFSET em prepared statements
    await conn.query("SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION'");
    const [rows] = await conn.query(sql, params);
    return rows;
  } finally {
    conn.release();
  }
}

// ─── Gerar lista de meses entre duas datas ───────────────────────────────────
function gerarMeses(dataInicio, dataFim) {
  const meses = [];
  let d = new Date(dataInicio.getFullYear(), dataInicio.getMonth(), 1);
  while (d <= dataFim) {
    const ano = d.getFullYear();
    const mes = d.getMonth();
    const inicio = `${ano}-${String(mes + 1).padStart(2, "0")}-01 00:00:00`;
    const ultimoDia = new Date(ano, mes + 1, 0);
    const fim = `${ultimoDia.getFullYear()}-${String(ultimoDia.getMonth() + 1).padStart(2, "0")}-${String(ultimoDia.getDate()).padStart(2, "0")} 23:59:59`;
    meses.push({ ano, mes: mes + 1, inicio, fim, label: `${ano}-${String(mes + 1).padStart(2, "0")}` });
    d = new Date(ano, mes + 1, 1);
  }
  return meses;
}

// ─── Atualizar controle ───────────────────────────────────────────────────────
async function setControle(conn, unidadeId, data) {
  // Garantir que o registro existe
  await conn.execute(
    `INSERT IGNORE INTO sync_controle (unidade_id, status, total_vendas, total_vp, total_clientes)
     VALUES (?, 'idle', 0, 0, 0)`,
    [unidadeId]
  );
  const fields = Object.keys(data);
  if (fields.length === 0) return;
  const vals = Object.values(data);
  const setClause = fields.map((f) => `\`${f}\` = ?`).join(", ");
  await conn.execute(
    `UPDATE sync_controle SET ${setClause}, updated_at = NOW() WHERE unidade_id = ?`,
    [...vals, unidadeId]
  );
}

// ─── Sincronizar colaboradores ────────────────────────────────────────────────
async function syncUsuarios(conn, unidadeId) {
  const rows = await queryExt(
    `SELECT id, unidade, nome, status, visivel_agenda, visivel_pdv, visivel_dashboard,
            data_criacao, data_alteracao
     FROM usuarios WHERE unidade = ?`,
    [unidadeId]
  );
  if (rows.length === 0) return 0;
  return await upsertBatch(conn, "sync_usuarios", rows);
}

// ─── Sincronizar produtos ─────────────────────────────────────────────────────
async function syncProdutos(conn, unidadeId) {
  const rows = await queryExt(
    `SELECT id, unidade, tipo, categoria, nome, valor_venda, status, data_criacao, data_alteracao
     FROM produtos WHERE unidade = ?`,
    [unidadeId]
  );
  if (rows.length === 0) return 0;
  return await upsertBatch(conn, "sync_produtos", rows);
}

// ─── Sincronizar formas de pagamento ─────────────────────────────────────────
async function syncFormasPagamentos(conn) {
  const rows = await queryExt("SELECT id, nome, tipo FROM formas_pagamentos");
  if (rows.length === 0) return 0;
  return await upsertBatch(conn, "sync_formas_pagamentos", rows);
}

// ─── Sincronizar clientes de uma unidade ─────────────────────────────────────
async function syncClientes(conn, unidadeId) {
  let offset = 0;
  const batchSize = 3000;
  let total = 0;
  while (true) {
    const rows = await queryExt(
      `SELECT id, unidade as unidade_id, nome,
              COALESCE(telefone, '') as telefone,
              COALESCE(telefone_sem_mascara, '') as telefone_sem_mascara,
              COALESCE(email, '') as email,
              NULLIF(NULLIF(data_nascimento, '0000-00-00'), '0000-00-00 00:00:00') as data_nascimento,
              NULLIF(NULLIF(ultima_visita, '0000-00-00'), '0000-00-00 00:00:00') as ultima_visita,
              ultima_visita_unidade, ultima_visita_colaborador,
              status,
              NULLIF(NULLIF(data_criacao, '0000-00-00'), '0000-00-00 00:00:00') as data_criacao,
              NULLIF(NULLIF(data_alteracao, '0000-00-00'), '0000-00-00 00:00:00') as data_alteracao
       FROM clientes WHERE unidade = ? LIMIT ? OFFSET ?`,
      [unidadeId, batchSize, offset]
    );
    if (rows.length === 0) break;
    await upsertBatch(conn, "sync_clientes", rows);
    total += rows.length;
    offset += rows.length;
    if (rows.length < batchSize) break;
  }
  return total;
}

// ─── Sincronizar vendas de um período ────────────────────────────────────────
async function syncVendasPeriodo(conn, colabIds, unidadeId, inicio, fim) {
  if (colabIds.length === 0) return { vendas: 0, vp: 0 };

  const inPlaceholder = colabIds.map(() => "?").join(",");

  // Buscar vendas_produtos do período
  const vpRows = await queryExt(
    `SELECT vp.id, vp.venda, vp.colaborador, vp.produto, vp.quantidade,
            vp.valor_unitario, vp.valor_desconto, vp.valor_total, vp.valor_total_relatorio, vp.comissao,
            ${unidadeId} as unidade_id
     FROM vendas_produtos vp
     JOIN vendas v ON v.id = vp.venda
     WHERE vp.colaborador IN (${inPlaceholder})
       AND v.data_criacao >= ?
       AND v.data_criacao <= ?
       AND v.comanda_temp = 0`,
    [...colabIds, inicio, fim]
  );

  if (vpRows.length === 0) return { vendas: 0, vp: 0 };

  const vendaIds = [...new Set(vpRows.map((r) => r.venda))];
  const vendaInPlaceholder = vendaIds.map(() => "?").join(",");

  // Buscar vendas completas
  const vendaRows = await queryExt(
    `SELECT id, ${unidadeId} as unidade_id, usuario, cliente, caixa, valor_total, desconto_total,
            cancelado_motivo, data_criacao, data_alteracao, comanda_temp, status
     FROM vendas WHERE id IN (${vendaInPlaceholder})`,
    vendaIds
  );

  // Buscar pagamentos
  const pagRows = await queryExt(
    `SELECT id, venda, forma_pagamento, valor
     FROM vendas_pagamentos WHERE venda IN (${vendaInPlaceholder})`,
    vendaIds
  );

  // Upsert em lote
  await upsertBatch(conn, "sync_vendas_produtos", vpRows);
  await upsertBatch(conn, "sync_vendas", vendaRows);
  if (pagRows.length > 0) {
    await upsertBatch(conn, "sync_vendas_pagamentos", pagRows);
  }

  return { vendas: vendaIds.length, vp: vpRows.length };
}

// ─── Importar uma unidade completa ───────────────────────────────────────────
async function importarUnidade(unidadeId, meses) {
  const conn = await localPool.getConnection();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[Unidade ${unidadeId}] Iniciando importação (${meses.length} meses)`);

  await setControle(conn, unidadeId, { status: "syncing", erro_msg: null });

  try {
    // 1. Colaboradores, produtos, formas de pagamento
    const nUsuarios = await syncUsuarios(conn, unidadeId);
    const nProdutos = await syncProdutos(conn, unidadeId);
    const nFp = await syncFormasPagamentos(conn);
    console.log(`[Unidade ${unidadeId}] ${nUsuarios} colaboradores, ${nProdutos} produtos, ${nFp} formas pag.`);

    // 2. IDs dos colaboradores (todos, incluindo inativos — para histórico completo)
    const colabRows = await queryExt(
      "SELECT id FROM usuarios WHERE unidade = ?",
      [unidadeId]
    );
    const colabIds = colabRows.map((r) => r.id);
    if (colabIds.length === 0) {
      console.log(`[Unidade ${unidadeId}] Nenhum colaborador encontrado, pulando.`);
      await setControle(conn, unidadeId, { status: "idle", ultima_sync: new Date().toISOString().slice(0, 19).replace("T", " ") });
      conn.release();
      return { ok: true, totalVendas: 0, totalVp: 0, totalClientes: 0 };
    }
    console.log(`[Unidade ${unidadeId}] ${colabIds.length} colaboradores (ativos + inativos)`);

    // 3. Importar por mês
    let totalVendas = 0;
    let totalVp = 0;
    for (const mes of meses) {
      const result = await syncVendasPeriodo(conn, colabIds, unidadeId, mes.inicio, mes.fim);
      totalVendas += result.vendas;
      totalVp += result.vp;
      if (result.vendas > 0) {
        process.stdout.write(`  ${mes.label}: ${result.vendas} vendas, ${result.vp} itens\n`);
      }
    }

    // 4. Clientes
    const nClientes = await syncClientes(conn, unidadeId);
    console.log(`[Unidade ${unidadeId}] ${nClientes} clientes`);

    // 5. Atualizar controle
    await setControle(conn, unidadeId, {
      status: "idle",
      ultima_sync: new Date().toISOString().slice(0, 19).replace("T", " "),
      total_vendas: totalVendas,
      total_vp: totalVp,
      total_clientes: nClientes,
      erro_msg: null,
    });

    console.log(`[Unidade ${unidadeId}] ✓ CONCLUÍDA: ${totalVendas} vendas, ${totalVp} itens, ${nClientes} clientes`);
    conn.release();
    return { ok: true, totalVendas, totalVp, totalClientes: nClientes };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Unidade ${unidadeId}] ✗ ERRO: ${msg}`);
    if (err.sql) console.error(`  SQL: ${err.sql.slice(0, 200)}`);
    await setControle(conn, unidadeId, { status: "error", erro_msg: msg.slice(0, 500) }).catch(() => {});
    conn.release();
    return { ok: false, totalVendas: 0, totalVp: 0, totalClientes: 0 };
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=".repeat(60));
  console.log("IMPORTAÇÃO HISTÓRICA COMPLETA — VIP SUITE");
  console.log("=".repeat(60));

  // Verificar conexão com tunnel
  try {
    await queryExt("SELECT 1");
    console.log("✓ Tunnel SSH ativo (porta 13307)");
  } catch (e) {
    console.error("✗ Tunnel SSH não disponível. Certifique-se que o servidor está rodando.");
    console.error("  Erro:", e.message);
    process.exit(1);
  }

  // Descobrir data mais antiga
  const rows = await queryExt("SELECT MIN(data_criacao) as mais_antiga FROM vendas WHERE data_criacao IS NOT NULL");
  const dataInicio = rows[0]?.mais_antiga ? new Date(rows[0].mais_antiga) : new Date(2015, 0, 1);
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  ontem.setHours(23, 59, 59, 0);

  console.log(`\nPeríodo: ${dataInicio.toISOString().slice(0,10)} → ${ontem.toISOString().slice(0,10)}`);

  // Gerar lista de meses
  const meses = gerarMeses(dataInicio, ontem);
  console.log(`Total de meses a importar: ${meses.length}`);
  console.log(`Primeiro: ${meses[0]?.label} | Último: ${meses[meses.length - 1]?.label}`);

  // Reimportar apenas unidades que falharam
  const unidades = [29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60];
  console.log(`\nUnidades: ${unidades.join(", ")}`);
  console.log(`Total: ${unidades.length} unidades\n`);

  // Importar uma unidade por vez
  const inicio = Date.now();
  let sucesso = 0;
  let falha = 0;
  let grandeTotalVendas = 0;
  let grandeTotalVp = 0;
  let grandeTotalClientes = 0;

  for (const unidadeId of unidades) {
    const result = await importarUnidade(unidadeId, meses);
    if (result.ok) {
      sucesso++;
      grandeTotalVendas += result.totalVendas;
      grandeTotalVp += result.totalVp;
      grandeTotalClientes += result.totalClientes;
    } else {
      falha++;
    }
  }

  const duracao = Math.round((Date.now() - inicio) / 1000);
  const min = Math.floor(duracao / 60);
  const seg = duracao % 60;

  console.log("\n" + "=".repeat(60));
  console.log("IMPORTAÇÃO CONCLUÍDA");
  console.log("=".repeat(60));
  console.log(`Unidades: ${sucesso} com sucesso, ${falha} com erro`);
  console.log(`Total vendas: ${grandeTotalVendas.toLocaleString("pt-BR")}`);
  console.log(`Total itens:  ${grandeTotalVp.toLocaleString("pt-BR")}`);
  console.log(`Total clientes: ${grandeTotalClientes.toLocaleString("pt-BR")}`);
  console.log(`Duração: ${min}m ${seg}s`);

  await extPool.end();
  await localPool.end();
}

main().catch((err) => {
  console.error("ERRO FATAL:", err);
  process.exit(1);
});
