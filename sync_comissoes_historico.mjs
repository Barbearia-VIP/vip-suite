/**
 * Sincroniza TODOS os meses históricos de comissões (despesas) no GT financeiro
 * Usa o campo comissao de sync_vendas_produtos (valor já calculado pelo sistema de origem)
 */
import mysql from 'mysql2/promise';

const url = new URL(process.env.DATABASE_URL);
const conn = await mysql.createConnection({
  host: url.hostname,
  port: parseInt(url.port || '3306'),
  user: url.username,
  password: url.password,
  database: url.pathname.replace('/', ''),
  ssl: { rejectUnauthorized: false }
});

function log(msg) {
  const ts = new Date().toTimeString().slice(0, 8);
  console.log(`${ts} ${msg}`);
}

// Buscar todas as unidades ativas com orgId e externalId
const [units] = await conn.query(`
  SELECT u.id as unitId, u.orgId, u.externalId, u.name
  FROM units u
  WHERE u.active = 1 AND u.externalId IS NOT NULL
  ORDER BY u.id
`);

log(`Iniciando sincronização de comissões históricas para ${units.length} unidades`);

// Buscar alcance de datas em sync_vendas
const [[dateRange]] = await conn.query(`
  SELECT MIN(DATE_FORMAT(sv.data_criacao, '%Y-%m')) as inicio, 
         MAX(DATE_FORMAT(sv.data_criacao, '%Y-%m')) as fim
  FROM sync_vendas sv
  WHERE sv.status = 1 AND sv.comanda_temp = 0
`);

log(`Alcance de dados: ${dateRange.inicio} até ${dateRange.fim}`);

// Gerar lista de meses
function getMeses(inicio, fim) {
  const meses = [];
  const [anoIni, mesIni] = inicio.split('-').map(Number);
  const [anoFim, mesFim] = fim.split('-').map(Number);
  let ano = anoIni, mes = mesIni;
  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    meses.push(`${ano}-${String(mes).padStart(2, '0')}`);
    mes++;
    if (mes > 12) { mes = 1; ano++; }
  }
  return meses;
}

const meses = getMeses(dateRange.inicio, dateRange.fim);
log(`Total de meses a processar: ${meses.length}`);

let totalInseridos = 0;
let totalErros = 0;

for (const unit of units) {
  const { unitId, orgId, externalId, name } = unit;
  log(`\n[${unitId}] ${name} (extId=${externalId})`);
  
  let diasUnit = 0;
  
  for (const mes of meses) {
    const [ano, mesNum] = mes.split('-').map(Number);
    const inicio = `${mes}-01`;
    const fimDate = new Date(ano, mesNum, 0); // último dia do mês
    const fim = `${mes}-${String(fimDate.getDate()).padStart(2, '0')}`;
    
    try {
      // Usar vp.comissao diretamente — valor já calculado pelo sistema de origem
      const [rows] = await conn.query(`
        SELECT 
          DATE(sv.data_criacao) as dia,
          SUM(vp.comissao) as comissao_total
        FROM sync_vendas_produtos vp
        JOIN sync_vendas sv ON sv.id = vp.venda AND sv.status = 1 AND sv.comanda_temp = 0
        WHERE vp.unidade_id = ?
          AND DATE(sv.data_criacao) BETWEEN ? AND ?
          AND vp.colaborador IS NOT NULL
          AND vp.colaborador != 0
          AND vp.comissao > 0
        GROUP BY DATE(sv.data_criacao)
        HAVING comissao_total > 0
      `, [externalId, inicio, fim]);
      
      if (rows.length === 0) continue;
      
      // Inserir/atualizar no gt_financeiro
      for (const row of rows) {
        const dia = row.dia instanceof Date 
          ? row.dia.toISOString().slice(0, 10)
          : String(row.dia).slice(0, 10);
        
        const dataVipRef = `comissao:${unitId}:${dia}`;
        const valor = parseFloat(row.comissao_total).toFixed(2);
        const referencia = `${dia.slice(0, 7)}`; // YYYY-MM
        const descricao = `Comissões Data VIP`;
        
        await conn.query(`
          INSERT INTO gt_financeiro (orgId, unitId, tipo, categoria, descricao, valor, vencimento, pago, paidAt, referencia, dataVipRef)
          VALUES (?, ?, 'despesa', 'Comissões', ?, ?, ?, 1, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            valor = VALUES(valor),
            descricao = VALUES(descricao),
            updatedAt = NOW()
        `, [orgId, unitId, descricao, valor, dia, dia, referencia, dataVipRef]);
        
        diasUnit++;
        totalInseridos++;
      }
      
      process.stdout.write(`\r   ${mes}: ${rows.length} dias`);
      
    } catch (err) {
      log(`   ERRO em ${mes}: ${err.message}`);
      totalErros++;
    }
  }
  
  log(`   Total: ${diasUnit} dias de comissões sincronizados`);
}

log(`\n=== CONCLUÍDO ===`);
log(`Total inseridos/atualizados: ${totalInseridos}`);
log(`Total erros: ${totalErros}`);

await conn.end();
