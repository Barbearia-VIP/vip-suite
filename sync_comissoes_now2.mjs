import mysql from '/home/ubuntu/vip-suite/node_modules/.pnpm/mysql2@3.15.1/node_modules/mysql2/promise.js';

const conn = await mysql.createConnection(process.env.DATABASE_URL || '');

// Buscar todas as unidades com externalId
const [units] = await conn.execute('SELECT id, orgId, name, externalId FROM units WHERE externalId IS NOT NULL ORDER BY id');

const hoje = new Date();
const inicio = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
const fim = hoje.toISOString().slice(0, 10);

console.log(`Sincronizando comissões para ${units.length} unidades...`);
console.log(`Período: ${inicio} a ${fim}`);

let totalOk = 0;
let totalErro = 0;

for (const unit of units) {
  try {
    const extId = Number(unit.externalId);
    const unitId = Number(unit.id);
    const orgId = Number(unit.orgId);

    // Buscar regras de comissão da org
    const [regrasRows] = await conn.execute(
      `SELECT colaboradorId, percentual, pctComissaoProdutos FROM regras_comissao WHERE ativo = 1 AND orgId = ${orgId}`
    );
    const regrasMap = {};
    regrasRows.forEach(r => {
      regrasMap[String(r.colaboradorId)] = {
        pct: Number(r.percentual),
        pctProd: Number(r.pctComissaoProdutos || 0),
      };
    });

    if (Object.keys(regrasMap).length === 0) {
      // sem regras cadastradas para esta org
      continue;
    }

    // Buscar faixas de meta para bônus
    const [faixasRows] = await conn.execute(
      `SELECT valorMinServicos, pctComissao FROM meta_faixas WHERE unitId = ${unitId} AND orgId = ${orgId} AND ativo = 1 ORDER BY valorMinServicos ASC`
    );
    const faixasMeta = faixasRows.map(f => ({
      valorMin: Number(f.valorMinServicos),
      pct: Number(f.pctComissao),
    }));

    // Buscar faturamento por colaborador por dia separado por tipo
    const [colabRows] = await conn.execute(`
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
        AND DATE(v.data_criacao) BETWEEN '${inicio}' AND '${fim}'
      GROUP BY vp.colaborador, DATE(v.data_criacao)
    `);

    if (colabRows.length === 0) continue;

    // Calcular comissão total por dia
    const comissoesPorDia = {};
    for (const c of colabRows) {
      const diaRaw = c.dia;
      const dia = diaRaw instanceof Date
        ? diaRaw.toISOString().slice(0, 10)
        : String(diaRaw).length === 10 && String(diaRaw).match(/^\d{4}-\d{2}-\d{2}$/)
          ? String(diaRaw)
          : new Date(diaRaw).toISOString().slice(0, 10);
      const regra = regrasMap[String(c.colaborador)];
      if (!regra) continue;
      const servicos = parseFloat(String(c.servicos || 0));
      const produtos = parseFloat(String(c.produtos || 0));
      const comBase = Math.round((servicos * regra.pct / 100 + produtos * regra.pctProd / 100) * 100) / 100;
      // Bônus de meta
      let bonus = 0;
      if (faixasMeta.length > 0) {
        const sorted = [...faixasMeta].sort((a, b) => b.valorMin - a.valorMin);
        const faixa = sorted.find(f => servicos >= f.valorMin);
        if (faixa) {
          const pctBonus = Math.max(0, faixa.pct - regra.pct);
          bonus = Math.round(servicos * pctBonus / 100 * 100) / 100;
        }
      }
      comissoesPorDia[dia] = (comissoesPorDia[dia] || 0) + comBase + bonus;
    }

    // Upsert no gt_financeiro
    let totalComissao = 0;
    let diasInseridos = 0;
    for (const [dia, valor] of Object.entries(comissoesPorDia)) {
      if (valor <= 0) continue;
      const valorRounded = Math.round(valor * 100) / 100;
      const referencia = dia.slice(0, 7);
      const dataVipRef = `comissao:${unitId}:${dia}`;
      const descricao = `Comissões Data VIP - ${dia}`;
      await conn.execute(
        `INSERT INTO gt_financeiro (orgId, unitId, tipo, categoria, descricao, valor, vencimento, pago, paidAt, referencia, dataVipRef)
         VALUES (?, ?, 'despesa', 'Comissões', ?, ?, ?, 1, ?, ?, ?)
         ON DUPLICATE KEY UPDATE valor = VALUES(valor), descricao = VALUES(descricao), updatedAt = NOW()`,
        [orgId, unitId, descricao, valorRounded, dia, dia, referencia, dataVipRef]
      );
      totalComissao += valorRounded;
      diasInseridos++;
    }

    if (diasInseridos > 0) {
      console.log(`  ${unit.name} (ext=${extId}): R$${totalComissao.toFixed(2)} em ${diasInseridos} dias`);
    }
    totalOk++;
  } catch (e) {
    console.log(`  ERRO ${unit.name}: ${e.message}`);
    totalErro++;
  }
}

console.log(`\nConcluído: ${totalOk} unidades OK, ${totalErro} erros`);
await conn.end();
