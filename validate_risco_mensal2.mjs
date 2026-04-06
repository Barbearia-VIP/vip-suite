import { createConnection } from 'mysql2/promise';
import { createServer } from 'net';
import { Client } from 'ssh2';

const SSH_HOST = process.env.SSH_TUNNEL_HOST;
const SSH_PORT = parseInt(process.env.SSH_TUNNEL_PORT || '22');
const SSH_USER = process.env.SSH_TUNNEL_USER;
const SSH_PASS = process.env.SSH_TUNNEL_PASS;
const DB_HOST = process.env.DB_EXT_HOST;
const DB_PORT = parseInt(process.env.DB_EXT_PORT || '3306');
const DB_USER = process.env.DB_EXT_USER;
const DB_PASS = process.env.DB_EXT_PASS;
const DB_NAME = process.env.DB_EXT_NAME;

const LOCAL_PORT = 13400;

function createTunnel() {
  return new Promise((resolve, reject) => {
    const ssh = new Client();
    ssh.on('ready', () => {
      const server = createServer((sock) => {
        ssh.forwardOut('127.0.0.1', LOCAL_PORT, DB_HOST, DB_PORT, (err, stream) => {
          if (err) { sock.destroy(); return; }
          sock.pipe(stream).pipe(sock);
        });
      });
      server.listen(LOCAL_PORT, '127.0.0.1', () => resolve({ ssh, server }));
    });
    ssh.on('error', reject);
    ssh.connect({ host: SSH_HOST, port: SSH_PORT, username: SSH_USER, password: SSH_PASS });
  });
}

async function main() {
  const { ssh, server } = await createTunnel();
  const conn = await createConnection({
    host: '127.0.0.1', port: LOCAL_PORT,
    user: DB_USER, password: DB_PASS, database: DB_NAME,
  });

  // Parâmetros: Joinville (unidade 29), Jan/26–Abr/26
  const unitId = 29;
  const dataInicio = '2026-01-01';
  const dataFim = '2026-04-30';
  const dataInicio12m = '2025-04-30'; // dataFim - 365d

  const unitCondV = `uu.unidade = ${unitId}`;
  const unitCondV2 = `uu2.unidade = ${unitId}`;

  const ultimaVendaSubquery = `(
    SELECT v.cliente, MAX(DATE(v.data_criacao)) as ultima_venda
    FROM vendas v
    JOIN usuarios uu ON v.usuario = uu.id
    WHERE ${unitCondV}
      AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
      AND v.cliente IS NOT NULL AND v.cliente != 2
    GROUP BY v.cliente
  )`;

  const baseS12mSubquery = `(
    SELECT uv.cliente, uv.ultima_venda
    FROM ${ultimaVendaSubquery} uv
    WHERE uv.ultima_venda >= '${dataInicio12m}' AND uv.ultima_venda <= '${dataFim}'
  )`;

  const visitasHistoricasSubquery = `(
    SELECT v.cliente, COUNT(*) as total_visitas
    FROM vendas v
    JOIN usuarios uu ON v.usuario = uu.id
    WHERE ${unitCondV}
      AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
      AND v.cliente IS NOT NULL AND v.cliente != 2
    GROUP BY v.cliente
  )`;

  const query = `
    SELECT
      meses.mes,
      COUNT(DISTINCT CASE
        WHEN DATEDIFF(meses.fim_mes, uv_ate_mes.ultima_venda_ate) BETWEEN 61 AND 90
          AND COALESCE(vh_rm.total_visitas, 0) > 1
        THEN bs.cliente END) as em_risco,
      COUNT(DISTINCT CASE
        WHEN DATEDIFF(meses.fim_mes, uv_ate_mes.ultima_venda_ate) > 90
          AND COALESCE(vh_rm.total_visitas, 0) > 1
        THEN bs.cliente END) as churn_novos,
      COUNT(DISTINCT CASE
        WHEN DATEDIFF(meses.fim_mes, uv_ate_mes.ultima_venda_ate) <= 60
        THEN bs.cliente END) as total_ativos_mes
    FROM (
      SELECT DISTINCT
        DATE_FORMAT(v.data_criacao, '%Y-%m') as mes,
        LAST_DAY(v.data_criacao) as fim_mes
      FROM vendas v
      JOIN usuarios uu ON v.usuario = uu.id
      WHERE ${unitCondV}
        AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
        AND DATE(v.data_criacao) >= '${dataInicio}' AND DATE(v.data_criacao) <= '${dataFim}'
    ) meses
    JOIN ${baseS12mSubquery} bs ON 1=1
    LEFT JOIN (
      SELECT v2.cliente, DATE_FORMAT(v2.data_criacao, '%Y-%m') as mes_ref,
             MAX(DATE(v2.data_criacao)) as ultima_venda_ate
      FROM vendas v2
      JOIN usuarios uu2 ON v2.usuario = uu2.id
      WHERE ${unitCondV2}
        AND v2.comanda_temp = 0 AND v2.cancelado_motivo IS NULL AND v2.status != 0
        AND v2.cliente IS NOT NULL AND v2.cliente != 2
        AND DATE(v2.data_criacao) >= '${dataInicio12m}'
      GROUP BY v2.cliente, DATE_FORMAT(v2.data_criacao, '%Y-%m')
    ) uv_ate_mes ON uv_ate_mes.cliente = bs.cliente AND uv_ate_mes.mes_ref <= meses.mes
    LEFT JOIN ${visitasHistoricasSubquery} vh_rm ON vh_rm.cliente = bs.cliente
    GROUP BY meses.mes, meses.fim_mes
    ORDER BY meses.mes
  `;

  console.log('Executando query de riscoMensal...\n');
  const [rows] = await conn.query(query);
  console.log('Resultados por mês:');
  console.table(rows);

  // Calcular churnPct e emRiscoPct
  for (const r of rows) {
    const base = Number(r.total_ativos_mes) + Number(r.em_risco) + Number(r.churn_novos);
    r.churnPct = base > 0 ? Math.round((Number(r.churn_novos) / base) * 100) : 0;
    r.emRiscoPct = base > 0 ? Math.round((Number(r.em_risco) / base) * 100) : 0;
  }
  console.log('\nCom percentuais calculados:');
  console.table(rows);

  await conn.end();
  server.close();
  ssh.end();
}

main().catch(e => { console.error(e); process.exit(1); });
