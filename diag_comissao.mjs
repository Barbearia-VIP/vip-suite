/**
 * Diagnóstico de comissões: João Flávio em Joinville (março/2026)
 */
import mysql from 'mysql2/promise';

const pool = mysql.createPool({ uri: process.env.DATABASE_URL, waitForConnections: true, connectionLimit: 5 });

async function run() {
  // 1. Encontrar a unidade de Joinville
  const [units] = await pool.query(`SELECT id, name, externalId FROM units WHERE name LIKE '%joinville%' OR name LIKE '%Joinville%'`);
  console.log('=== UNIDADES JOINVILLE ===');
  console.table(units);

  if (!units.length) { console.log('Nenhuma unidade encontrada'); await pool.end(); return; }

  const unit = units[0];
  const orgId = 1; // assumindo orgId=1
  console.log(`\nUnidade: ${unit.name} (id=${unit.id}, externalId=${unit.externalId})`);

  // 2. Encontrar João Flávio nos colaboradores sincronizados
  const extId = Number(unit.externalId);
  const [colabs] = await pool.query(`
    SELECT id, nome, unitId FROM sync_usuarios 
    WHERE unitId = ? AND nome LIKE '%flavio%' OR (unitId = ? AND nome LIKE '%flávio%')
    LIMIT 10
  `, [extId, extId]);
  console.log('\n=== JOÃO FLÁVIO NO BANCO EXTERNO ===');
  console.table(colabs);

  // 3. Verificar regras de comissão cadastradas para esse colaborador
  if (colabs.length > 0) {
    const colabId = colabs[0].id;
    console.log(`\nColaborador ID externo: ${colabId}`);
    
    const [regras] = await pool.query(`
      SELECT * FROM regras_comissao WHERE orgId = ? AND colaboradorId = ?
    `, [orgId, String(colabId)]);
    console.log('\n=== REGRAS DE COMISSÃO PARA JOÃO FLÁVIO ===');
    console.table(regras);

    if (!regras.length) {
      console.log('⚠️  PROBLEMA: Nenhuma regra de comissão encontrada para este colaboradorId!');
      
      // Verificar se há regras com nome similar
      const [todasRegras] = await pool.query(`
        SELECT rc.*, su.nome as nomeColab 
        FROM regras_comissao rc
        LEFT JOIN sync_usuarios su ON su.id = CAST(rc.colaboradorId AS UNSIGNED)
        WHERE rc.orgId = ?
        ORDER BY rc.id DESC
        LIMIT 20
      `, [orgId]);
      console.log('\n=== TODAS AS REGRAS DA ORG (últimas 20) ===');
      console.table(todasRegras);
    }
  }

  // 4. Verificar faturamento real do João Flávio em março/2026
  if (colabs.length > 0) {
    const colabId = colabs[0].id;
    const [fat] = await pool.query(`
      SELECT 
        colab.id, colab.nome,
        SUM(vp.valor_total) as faturamento,
        COUNT(DISTINCT v.id) as atendimentos,
        SUM(CASE WHEN p.tipo = 'ser' THEN vp.valor_total END) as servicos,
        SUM(CASE WHEN p.tipo IN ('probar','proemp','proins') THEN vp.valor_total END) as produtos
      FROM sync_vendas_produtos vp
      JOIN sync_usuarios colab ON colab.id = vp.colaborador
      JOIN sync_vendas v ON v.id = vp.venda
      JOIN sync_produtos p ON p.id = vp.produto
      WHERE vp.colaborador = ?
        AND v.data_criacao >= '2026-03-01'
        AND v.data_criacao < '2026-04-01'
        AND v.comanda_temp = 0
        AND v.status = 1
      GROUP BY colab.id, colab.nome
    `, [colabId]);
    console.log('\n=== FATURAMENTO JOÃO FLÁVIO MARÇO/2026 ===');
    console.table(fat);
  }

  // 5. Verificar faixas de meta para a unidade
  const [faixas] = await pool.query(`
    SELECT * FROM meta_faixas WHERE unitId = ? AND orgId = ?
  `, [unit.id, orgId]);
  console.log('\n=== FAIXAS DE META DA UNIDADE ===');
  console.table(faixas);

  await pool.end();
}

run().catch(console.error);
