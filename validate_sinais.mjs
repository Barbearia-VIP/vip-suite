import { createConnection } from 'mysql2/promise';
import { createTunnel } from 'tunnel-ssh';

const sshConfig = {
  host: process.env.SSH_TUNNEL_HOST,
  port: parseInt(process.env.SSH_TUNNEL_PORT || '22'),
  username: process.env.SSH_TUNNEL_USER,
  password: process.env.SSH_TUNNEL_PASS,
};

const forwardConfig = {
  srcHost: '127.0.0.1',
  srcPort: 13308,
  dstHost: process.env.DB_EXT_HOST,
  dstPort: parseInt(process.env.DB_EXT_PORT || '3306'),
};

const [server] = await createTunnel({ autoClose: true }, { port: 13308 }, sshConfig, forwardConfig);

const conn = await createConnection({
  host: '127.0.0.1',
  port: 13308,
  user: process.env.DB_EXT_USER,
  password: process.env.DB_EXT_PASS,
  database: process.env.DB_EXT_NAME,
});

const unitId = 29; // Joinville
const dataInicio = '2026-01-01';
const dataFim = '2026-04-30';
const dataInicio12m = '2025-04-30'; // 12m antes do dataFim

const unitCondV = `uu.unidade = ${unitId}`;

// Subquery ultima_venda (MAX vendas.data_criacao por cliente/unidade)
const baseS12mSQL = `
  SELECT DISTINCT v.cliente,
    MAX(DATE(v.data_criacao)) as ultima_venda
  FROM vendas v
  JOIN usuarios uu ON v.usuario = uu.id
  WHERE ${unitCondV}
    AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
    AND v.cliente IS NOT NULL AND v.cliente != 2
    AND DATE(v.data_criacao) >= '${dataInicio12m}' AND DATE(v.data_criacao) <= '${dataFim}'
  GROUP BY v.cliente
`;

// Sinais da Base
const [sinaisRows] = await conn.query(`
  SELECT
    COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) <= 45 THEN bs.cliente END) as ativos,
    COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) BETWEEN 46 AND 90 THEN bs.cliente END) as em_risco,
    COUNT(DISTINCT CASE WHEN DATEDIFF('${dataFim}', bs.ultima_venda) > 90 THEN bs.cliente END) as perdidos,
    COUNT(DISTINCT CASE WHEN vh.total_visitas = 1 AND DATEDIFF('${dataFim}', bs.ultima_venda) >= 46 THEN bs.cliente END) as one_shot_urgente,
    COUNT(DISTINCT CASE WHEN vh.total_visitas = 1 AND DATEDIFF('${dataFim}', bs.ultima_venda) BETWEEN 46 AND 90 THEN bs.cliente END) as one_shot_risco,
    COUNT(DISTINCT CASE WHEN vh.total_visitas = 1 AND DATEDIFF('${dataFim}', bs.ultima_venda) > 90 THEN bs.cliente END) as one_shot_perdido,
    COUNT(DISTINCT bs.cliente) as total_base
  FROM (${baseS12mSQL}) bs
  JOIN clientes c ON c.id = bs.cliente AND c.status = 1
  LEFT JOIN (
    SELECT v.cliente, COUNT(*) as total_visitas
    FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
    WHERE ${unitCondV}
      AND v.comanda_temp = 0 AND v.cancelado_motivo IS NULL AND v.status != 0
      AND v.cliente IS NOT NULL AND v.cliente != 2
    GROUP BY v.cliente
  ) vh ON vh.cliente = bs.cliente
`);

console.log('\n=== SINAIS DA BASE (Sistema Atual) ===');
console.log('Período:', dataInicio, '->', dataFim, '| REF:', dataFim);
console.log('Base S 12m (dataInicio12m:', dataInicio12m, ')');
const s = sinaisRows[0];
console.log('\nAtivos (≤45d):', s.ativos, '| Ref: 767');
console.log('Em Risco (46-90d):', s.em_risco, '| Ref: 425');
console.log('Perdidos (>90d):', s.perdidos, '| Ref: 481');
console.log('One-shot urgente:', s.one_shot_urgente, '| Ref: 276');
console.log('One-shot risco:', s.one_shot_risco, '| Ref: 44');
console.log('One-shot perdido:', s.one_shot_perdido, '| Ref: 232');
console.log('Total base S 12m:', s.total_base, '| Ref: 1.738');

// Verificar com dataFim = hoje (06/04/2026) vs 30/04/2026
const hoje = '2026-04-06';
const [sinaisHoje] = await conn.query(`
  SELECT
    COUNT(DISTINCT CASE WHEN DATEDIFF('${hoje}', bs.ultima_venda) <= 45 THEN bs.cliente END) as ativos,
    COUNT(DISTINCT CASE WHEN DATEDIFF('${hoje}', bs.ultima_venda) BETWEEN 46 AND 90 THEN bs.cliente END) as em_risco,
    COUNT(DISTINCT CASE WHEN DATEDIFF('${hoje}', bs.ultima_venda) > 90 THEN bs.cliente END) as perdidos,
    COUNT(DISTINCT bs.cliente) as total_base
  FROM (${baseS12mSQL}) bs
  JOIN clientes c ON c.id = bs.cliente AND c.status = 1
`);

console.log('\n=== Com REF = HOJE (06/04/2026) ===');
const h = sinaisHoje[0];
console.log('Ativos (≤45d):', h.ativos, '| Ref: 767');
console.log('Em Risco (46-90d):', h.em_risco, '| Ref: 425');
console.log('Perdidos (>90d):', h.perdidos, '| Ref: 481');
console.log('Total base S 12m:', h.total_base, '| Ref: 1.738');

await conn.end();
server.close();
