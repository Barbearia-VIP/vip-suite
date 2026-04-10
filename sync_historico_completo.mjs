/**
 * sync_historico_completo.mjs
 * Sincroniza TODOS os meses históricos de faturamento (receita) e comissões (despesas)
 * no Gestão Total para todas as unidades ativas do sistema.
 *
 * Execução: node sync_historico_completo.mjs
 */

import mysql from 'mysql2/promise';

// ─── Conexão com banco local ──────────────────────────────────────────────────
const url = new URL(process.env.DATABASE_URL);
const conn = await mysql.createConnection({
  host: url.hostname,
  port: parseInt(url.port || '3306'),
  user: url.username,
  password: url.password,
  database: url.pathname.replace('/', ''),
  ssl: { rejectUnauthorized: false },
});

function fmt(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}
function log(...args) { console.log(new Date().toISOString().slice(11, 19), ...args); }

// ─── Buscar todas as unidades ativas ─────────────────────────────────────────
const [units] = await conn.query(`
  SELECT u.id as unitId, u.orgId, u.name, u.externalId
  FROM units u
  WHERE u.externalId IS NOT NULL
  ORDER BY u.id
`);
log(`Total de unidades: ${units.length}`);

// ─── Determinar range de meses a sincronizar ──────────────────────────────────
const [[rangeRow]] = await conn.query(`
  SELECT MIN(DATE_FORMAT(v.data_criacao, '%Y-%m-01')) as primeiro_mes
  FROM sync_vendas_produtos vp
  JOIN sync_vendas v ON v.id = vp.venda
  WHERE v.status = 1 AND v.comanda_temp = 0
`);

const agora = new Date();
const mesAtual = new Date(agora.getFullYear(), agora.getMonth(), 1);
const primeiroMes = new Date(rangeRow.primeiro_mes);

// Gerar lista de todos os meses
const meses = [];
let cursor = new Date(primeiroMes);
while (cursor <= mesAtual) {
  const ano = cursor.getFullYear();
  const mes = cursor.getMonth() + 1;
  const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const proximoMes = mes === 12 ? 1 : mes + 1;
  const anoProximo = mes === 12 ? ano + 1 : ano;
  const fim = `${anoProximo}-${String(proximoMes).padStart(2, '0')}-01`;
  meses.push({ inicio, fim, label: `${ano}-${String(mes).padStart(2, '0')}` });
  cursor.setMonth(cursor.getMonth() + 1);
}
log(`Meses a sincronizar: ${meses.length} (${meses[0].label} → ${meses[meses.length-1].label})`);

// ─── Função: sincronizar faturamento de um mês/unidade ───────────────────────
async function syncFaturamento(orgId, unitId, extId, inicio, fim) {
  const [rows] = await conn.query(`
    SELECT
      DATE(v.data_criacao) as dia,
      COALESCE(SUM(vp.valor_total), 0) as faturamento,
      COUNT(DISTINCT v.id) as atendimentos
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON v.id = vp.venda
    WHERE vp.unidade_id = ?
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
    GROUP BY DATE(v.data_criacao)
    ORDER BY dia
  `, [extId, inicio, fim]);

  for (const row of rows) {
    const dia = fmt(row.dia);
    const valor = parseFloat(row.faturamento).toFixed(2);
    const descricao = `Faturamento Data VIP — ${row.atendimentos} atend.`;
    const dataVipRef = `datavip:${unitId}:${dia}`;

    await conn.execute(`
      INSERT INTO gt_financeiro
        (orgId, unitId, tipo, categoria, descricao, valor, vencimento, pago, paidAt, dataVipRef)
      VALUES
        (?, ?, 'receita', 'Faturamento Data VIP', ?, ?, ?, 1, ?, ?)
      ON DUPLICATE KEY UPDATE
        valor = VALUES(valor),
        descricao = VALUES(descricao),
        updatedAt = NOW()
    `, [orgId, unitId, descricao, valor, dia, dia, dataVipRef]);
  }
  return rows.length;
}

// ─── Função: sincronizar comissões de um mês/unidade ─────────────────────────
async function syncComissoes(orgId, unitId, extId, inicio, fim) {
  // Buscar regras de comissão da unidade (percentual = serviços, pctComissaoProdutos = produtos)
  const [regras] = await conn.query(`
    SELECT colaboradorId, percentual as percServicos, pctComissaoProdutos as percProdutos
    FROM regras_comissao
    WHERE orgId = ? AND unitId = ? AND ativo = 1
  `, [orgId, unitId]);

  if (regras.length === 0) return 0;

  const regrasMap = {};
  for (const r of regras) {
    regrasMap[String(r.colaboradorId)] = {
      percServicos: parseFloat(r.percServicos || 0) / 100,
      percProdutos: parseFloat(r.percProdutos || 0) / 100,
    };
  }

  // Buscar vendas por colaborador por dia
  const [vendas] = await conn.query(`
    SELECT
      DATE(v.data_criacao) as dia,
      vp.colaborador,
      SUM(CASE WHEN vp.tipo IN ('ser','ser_extra') THEN vp.valor_total ELSE 0 END) as fat_servicos,
      SUM(CASE WHEN vp.tipo LIKE 'pro%' THEN vp.valor_total ELSE 0 END) as fat_produtos
    FROM sync_vendas_produtos vp
    JOIN sync_vendas v ON v.id = vp.venda
    WHERE vp.unidade_id = ?
      AND v.data_criacao >= ?
      AND v.data_criacao < ?
      AND v.comanda_temp = 0
      AND v.status = 1
      AND vp.colaborador IS NOT NULL
    GROUP BY DATE(v.data_criacao), vp.colaborador
    ORDER BY dia
  `, [extId, inicio, fim]);

  // Agregar comissão total por dia
  const comissaoPorDia = {};
  for (const row of vendas) {
    const dia = fmt(row.dia);
    const regra = regrasMap[String(row.colaborador)];
    if (!regra) continue;

    const comServicos = parseFloat(row.fat_servicos) * regra.percServicos;
    const comProdutos = parseFloat(row.fat_produtos) * regra.percProdutos;
    const total = comServicos + comProdutos;

    if (!comissaoPorDia[dia]) comissaoPorDia[dia] = 0;
    comissaoPorDia[dia] += total;
  }

  // Upsert no gt_financeiro
  let count = 0;
  for (const [dia, valorTotal] of Object.entries(comissaoPorDia)) {
    if (valorTotal <= 0) continue;
    const valor = valorTotal.toFixed(2);
    const descricao = `Comissões Data VIP`;
    const dataVipRef = `comissao:${unitId}:${dia}`;

    await conn.execute(`
      INSERT INTO gt_financeiro
        (orgId, unitId, tipo, categoria, descricao, valor, vencimento, pago, paidAt, dataVipRef)
      VALUES
        (?, ?, 'despesa', 'Comissões', ?, ?, ?, 1, ?, ?)
      ON DUPLICATE KEY UPDATE
        valor = VALUES(valor),
        descricao = VALUES(descricao),
        updatedAt = NOW()
    `, [orgId, unitId, descricao, valor, dia, dia, dataVipRef]);
    count++;
  }
  return count;
}

// ─── Loop principal: por unidade, por mês ────────────────────────────────────
let totalFat = 0;
let totalCom = 0;
let totalErros = 0;

for (const unit of units) {
  const { unitId, orgId, name, externalId } = unit;
  const extId = parseInt(externalId);
  log(`\n[${unitId}] ${name} (extId=${extId})`);

  for (const { inicio, fim, label } of meses) {
    try {
      const diasFat = await syncFaturamento(orgId, unitId, extId, inicio, fim);
      const diasCom = await syncComissoes(orgId, unitId, extId, inicio, fim);
      if (diasFat > 0 || diasCom > 0) {
        log(`  ${label}: ${diasFat} dias fat, ${diasCom} dias com`);
        totalFat += diasFat;
        totalCom += diasCom;
      }
    } catch (err) {
      log(`  ERRO ${label}:`, err.message);
      totalErros++;
    }
  }
}

log(`\n✅ Sincronização histórica concluída!`);
log(`   Faturamento: ${totalFat} registros inseridos/atualizados`);
log(`   Comissões:   ${totalCom} registros inseridos/atualizados`);
log(`   Erros:       ${totalErros}`);

await conn.end();
