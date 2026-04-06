/**
 * investigate_final.mjs
 * Joinville (id=29), período 1/abr/2025–31/mar/2026, janela 60d
 * Referência: Base=999, Perdidos=249, Churn=20%, Resgatados=80, TempoMédioResgate=109.1d
 *
 * Hipótese final:
 * - "Churn & Saúde da Base" usa a janela selecionada (60d) como referência de atividade
 * - Base Ativa = clientes que vieram nos últimos janelaDias antes do FIM = 1000 ✓
 * - Perdidos = clientes que estavam na base (vieram nos janelaDias antes do INÍCIO)
 *              mas não vieram no período todo (ficaram perdidos durante o período)
 * - Resgatados = clientes que voltaram após ausência > janelaDias (apenas 1 retorno por cliente)
 *              calculado sobre o período selecionado
 */
import { Client as SshClient } from "ssh2";
import mysql from "mysql2/promise";
import net from "net";
import dotenv from "dotenv";
dotenv.config();

const SSH_HOST = process.env.SSH_TUNNEL_HOST;
const SSH_PORT = parseInt(process.env.SSH_TUNNEL_PORT ?? "22");
const SSH_USER = process.env.SSH_TUNNEL_USER;
const SSH_PASS = process.env.SSH_TUNNEL_PASS;
const DB_USER = process.env.DB_EXT_USER;
const DB_PASS = process.env.DB_EXT_PASS;
const DB_NAME = process.env.DB_EXT_NAME;
const LOCAL_PORT = 13408;

const DATA_INICIO = "2025-04-01";
const DATA_FIM = "2026-03-31";
const DATA_FIM_EXCL = "2026-04-01";
const EXT_ID = 29;

async function createTunnel() {
  return new Promise((resolve, reject) => {
    const ssh = new SshClient();
    ssh.on("ready", () => {
      const server = net.createServer((sock) => {
        ssh.forwardOut("127.0.0.1", LOCAL_PORT, "127.0.0.1", 3306, (err, stream) => {
          if (err) { sock.destroy(); return; }
          sock.pipe(stream).pipe(sock);
        });
      });
      server.listen(LOCAL_PORT, "127.0.0.1", () => resolve({ ssh, server }));
    });
    ssh.on("error", reject);
    ssh.connect({ host: SSH_HOST, port: SSH_PORT, username: SSH_USER, password: SSH_PASS });
  });
}

async function main() {
  let tunnel, pool;
  try {
    tunnel = await createTunnel();
    pool = await mysql.createPool({
      host: "127.0.0.1", port: LOCAL_PORT,
      user: DB_USER, password: DB_PASS, database: DB_NAME,
      waitForConnections: true, connectionLimit: 3,
    });
    const q = async (sql) => { const [rows] = await pool.execute(sql); return rows; };

    console.log(`\n=== Joinville (id=${EXT_ID}) | Ref: Base=999, Perdidos=249, Churn=20%, Resgatados=80 ===\n`);

    // Testar: Perdidos = clientes que vieram nos janelaDias antes do INÍCIO mas não vieram no período
    // Churn = Perdidos / Base_Início
    console.log(`=== Testando: Perdidos = vieram nos Xd antes do início mas não no período ===`);
    for (const j of [30, 45, 60, 75, 90, 120, 180]) {
      const dataAntes = new Date(new Date(DATA_INICIO).getTime() - j * 86400000).toISOString().split("T")[0];
      const [row] = await q(`
        SELECT 
          COUNT(DISTINCT base.cliente) as base_inicio,
          COUNT(DISTINCT CASE WHEN NOT EXISTS (
            SELECT 1 FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
            WHERE uu2.unidade = ${EXT_ID}
              AND v2.cliente = base.cliente
              AND DATE(v2.data_criacao) >= '${DATA_INICIO}'
              AND DATE(v2.data_criacao) <= '${DATA_FIM}'
              AND v2.comanda_temp = 0 AND v2.status != 0
          ) THEN base.cliente END) as perdidos
        FROM (
          SELECT DISTINCT v.cliente
          FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
          WHERE uu.unidade = ${EXT_ID}
            AND DATE(v.data_criacao) >= '${dataAntes}'
            AND DATE(v.data_criacao) < '${DATA_INICIO}'
            AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
        ) base
      `);
      console.log(`  ${j}d antes do início (de ${dataAntes}): Base=${row.base_inicio}, Perdidos=${row.perdidos}, Churn=${(row.perdidos/row.base_inicio*100).toFixed(1)}%`);
    }

    // Testar: Resgatados = clientes que vieram no período mas não vieram nos Xd antes do início
    // E que têm histórico anterior (não são novos)
    console.log(`\n=== Resgatados = voltaram no período após ausência de Xd ===`);
    for (const j of [30, 45, 60, 75, 90, 120, 180]) {
      const dataAntes = new Date(new Date(DATA_INICIO).getTime() - j * 86400000).toISOString().split("T")[0];
      const [row] = await q(`
        SELECT COUNT(DISTINCT v.cliente) as resgatados
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND DATE(v.data_criacao) >= '${DATA_INICIO}'
          AND DATE(v.data_criacao) <= '${DATA_FIM}'
          AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
          -- Não veio nos Xd antes do início
          AND NOT EXISTS (
            SELECT 1 FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
            WHERE uu2.unidade = ${EXT_ID}
              AND v2.cliente = v.cliente
              AND DATE(v2.data_criacao) >= '${dataAntes}'
              AND DATE(v2.data_criacao) < '${DATA_INICIO}'
              AND v2.comanda_temp = 0 AND v2.status != 0
          )
          -- Mas tem histórico anterior (não é novo)
          AND EXISTS (
            SELECT 1 FROM vendas v3 JOIN usuarios uu3 ON v3.usuario = uu3.id
            WHERE uu3.unidade = ${EXT_ID}
              AND v3.cliente = v.cliente
              AND DATE(v3.data_criacao) < '${dataAntes}'
              AND v3.comanda_temp = 0 AND v3.status != 0
          )
      `);
      console.log(`  ${j}d: Resgatados=${row.resgatados} (ref: 80)`);
    }

    // Testar tempo médio de resgate para janela 60d
    const dataAntes60 = new Date(new Date(DATA_INICIO).getTime() - 60 * 86400000).toISOString().split("T")[0];
    const [tempoResgate] = await q(`
      SELECT AVG(gap) as tempo_medio, COUNT(DISTINCT cliente) as total
      FROM (
        SELECT v.cliente,
          DATEDIFF(
            MIN(DATE(v.data_criacao)),
            (SELECT MAX(DATE(v2.data_criacao)) 
             FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
             WHERE uu2.unidade = ${EXT_ID}
               AND v2.cliente = v.cliente
               AND DATE(v2.data_criacao) < '${DATA_INICIO}'
               AND v2.comanda_temp = 0 AND v2.status != 0
            )
          ) as gap
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND DATE(v.data_criacao) >= '${DATA_INICIO}'
          AND DATE(v.data_criacao) <= '${DATA_FIM}'
          AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
          AND NOT EXISTS (
            SELECT 1 FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
            WHERE uu2.unidade = ${EXT_ID}
              AND v2.cliente = v.cliente
              AND DATE(v2.data_criacao) >= '${dataAntes60}'
              AND DATE(v2.data_criacao) < '${DATA_INICIO}'
              AND v2.comanda_temp = 0 AND v2.status != 0
          )
          AND EXISTS (
            SELECT 1 FROM vendas v3 JOIN usuarios uu3 ON v3.usuario = uu3.id
            WHERE uu3.unidade = ${EXT_ID}
              AND v3.cliente = v.cliente
              AND DATE(v3.data_criacao) < '${dataAntes60}'
              AND v3.comanda_temp = 0 AND v3.status != 0
          )
        GROUP BY v.cliente
      ) sub
    `);
    console.log(`\n  Tempo médio resgate (janela 60d): ${Number(tempoResgate.tempo_medio).toFixed(1)}d, Total=${tempoResgate.total}`);
    console.log(`  Referência: 109.1d, Total=80`);

    // Valor perdido estimado
    const [ticket] = await q(`
      SELECT AVG(v.valor_total) as ticket
      FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
      WHERE uu.unidade = ${EXT_ID}
        AND DATE(v.data_criacao) >= '${DATA_INICIO}'
        AND DATE(v.data_criacao) <= '${DATA_FIM}'
        AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
    `);
    console.log(`\n  Ticket médio: R$ ${Number(ticket.ticket).toFixed(2)}`);
    console.log(`  Valor perdido (249 × ticket): R$ ${(249 * Number(ticket.ticket)).toFixed(2)}`);
    console.log(`  Referência: R$ 29.095,00 → ticket implícito = R$ ${(29095/249).toFixed(2)}`);

  } catch (err) {
    console.error("ERRO:", err.message);
    console.error(err.stack);
  } finally {
    if (pool) await pool.end();
    if (tunnel) { tunnel.server.close(); tunnel.ssh.destroy(); }
    process.exit(0);
  }
}

main();
