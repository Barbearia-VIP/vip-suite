const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env') });
const dbUrl = process.env.DATABASE_URL;

async function run() {
  const conn = await mysql.createConnection(dbUrl);

  // Verificar unidades e extIds
  const [units] = await conn.execute(`SELECT id, name, externalId FROM units WHERE orgId = 1`);
  console.log("Unidades:", JSON.stringify(units));

  const extIds = units.filter(u => u.externalId).map(u => u.externalId);
  console.log("ExtIds:", extIds);

  const unitCond = extIds.length === 1
    ? `v.usuario IN (SELECT id FROM sync_usuarios WHERE unidade = ${extIds[0]})`
    : extIds.length > 1
    ? `v.usuario IN (SELECT id FROM sync_usuarios WHERE unidade IN (${extIds.join(",")}))`
    : "1=1";

  // Query COM cadastro (mesma do dashboard)
  const [[comCad]] = await conn.execute(`
    SELECT COUNT(*) as total_atend, COALESCE(SUM(v.valor_total), 0) as fat_total
    FROM sync_vendas v
    WHERE ${unitCond}
      AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
      AND v.cliente IS NOT NULL AND v.cliente != 2
      AND DATE(v.data_criacao) >= '2026-04-01' AND DATE(v.data_criacao) <= '2026-04-30'
  `);

  // Query SEM cadastro (mesma do dashboard)
  const [[semCad]] = await conn.execute(`
    SELECT COUNT(*) as total_atend, COALESCE(SUM(v.valor_total), 0) as fat_total
    FROM sync_vendas v
    WHERE ${unitCond}
      AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
      AND (v.cliente IS NULL OR v.cliente = 2)
      AND DATE(v.data_criacao) >= '2026-04-01' AND DATE(v.data_criacao) <= '2026-04-30'
  `);

  const fatTotal = parseFloat(String(comCad.fat_total)) + parseFloat(String(semCad.fat_total));
  const atendTotal = Number(comCad.total_atend) + Number(semCad.total_atend);
  console.log(`\n=== RESULTADO DASHBOARD (mesma query) ===`);
  console.log(`COM cadastro: R$ ${parseFloat(String(comCad.fat_total)).toFixed(2)} (${comCad.total_atend} atend)`);
  console.log(`SEM cadastro: R$ ${parseFloat(String(semCad.fat_total)).toFixed(2)} (${semCad.total_atend} atend)`);
  console.log(`TOTAL: R$ ${fatTotal.toFixed(2)} | ${atendTotal} atendimentos`);

  // Bruto sem filtros
  const [[bruto]] = await conn.execute(`
    SELECT COUNT(*) as total, COALESCE(SUM(v.valor_total), 0) as fat
    FROM sync_vendas v
    WHERE ${unitCond}
      AND DATE(v.data_criacao) >= '2026-04-01' AND DATE(v.data_criacao) <= '2026-04-30'
  `);
  console.log(`\nBruto (sem filtros): R$ ${parseFloat(String(bruto.fat)).toFixed(2)} (${bruto.total} registros)`);

  // Cancelados
  const [[canc]] = await conn.execute(`
    SELECT COUNT(*) as total, COALESCE(SUM(v.valor_total), 0) as fat
    FROM sync_vendas v
    WHERE ${unitCond} AND v.cancelado_motivo IS NOT NULL
      AND DATE(v.data_criacao) >= '2026-04-01' AND DATE(v.data_criacao) <= '2026-04-30'
  `);
  console.log(`Cancelados: R$ ${parseFloat(String(canc.fat)).toFixed(2)} (${canc.total})`);

  // Comanda temp
  const [[temp]] = await conn.execute(`
    SELECT COUNT(*) as total, COALESCE(SUM(v.valor_total), 0) as fat
    FROM sync_vendas v
    WHERE ${unitCond} AND v.comanda_temp = 1
      AND DATE(v.data_criacao) >= '2026-04-01' AND DATE(v.data_criacao) <= '2026-04-30'
  `);
  console.log(`Comanda temp: R$ ${parseFloat(String(temp.fat)).toFixed(2)} (${temp.total})`);

  // Status != 1
  const [statusOther] = await conn.execute(`
    SELECT v.status, COUNT(*) as total, COALESCE(SUM(v.valor_total), 0) as fat
    FROM sync_vendas v
    WHERE ${unitCond} AND v.status != 1
      AND DATE(v.data_criacao) >= '2026-04-01' AND DATE(v.data_criacao) <= '2026-04-30'
    GROUP BY v.status
  `);
  console.log(`Status != 1:`, JSON.stringify(statusOther));

  // Usando data_fechamento em vez de data_criacao
  const [[porFechamento]] = await conn.execute(`
    SELECT COUNT(*) as total, COALESCE(SUM(v.valor_total), 0) as fat
    FROM sync_vendas v
    WHERE ${unitCond}
      AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status = 1
      AND DATE(v.data_fechamento) >= '2026-04-01' AND DATE(v.data_fechamento) <= '2026-04-30'
  `);
  console.log(`\nUsando data_fechamento: R$ ${parseFloat(String(porFechamento.fat)).toFixed(2)} (${porFechamento.total})`);

  // Diferença entre dashboard (110.023) e sistema de origem (109.896,50)
  const diff = 110023 - 109896.50;
  console.log(`\nDiferença esperada: R$ ${diff.toFixed(2)}`);
  console.log(`Diferença real (dashboard vs origem): R$ ${(fatTotal - 109896.50).toFixed(2)}`);

  await conn.end();
}

run().catch(console.error);
