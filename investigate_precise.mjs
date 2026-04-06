/**
 * investigate_precise.mjs
 * Joinville (id=29), período 1/abr/2025–31/mar/2026
 * Referência: Base=999, Perdidos=249, Churn=20%, Resgatados=80, TempoMédioResgate=109.1d
 *
 * Resultado anterior:
 * - 90d antes do início (2025-01-01): Base=1074, Perdidos=196, Churn=18.2%
 * - 120d antes do início (2024-12-02): Base=1192, Perdidos=276, Churn=23.2%
 * - Base Atual (60d antes do FIM) = 1000 ✓
 *
 * Hipótese: o sistema usa janelaDias × 1.75 para calcular a "base de entrada"
 * (60d × 1.75 = 105d antes do início)
 * Ou usa janelaDias × 2 = 120d
 * Ou usa janelaDias × 1.5 = 90d
 *
 * Vou testar 95d, 100d, 105d, 110d, 115d para encontrar o match exato
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
const LOCAL_PORT = 13410;

const DATA_INICIO = "2025-04-01";
const DATA_FIM = "2026-03-31";
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

    console.log(`\n=== Joinville (id=${EXT_ID}) | Ref: Base=999, Perdidos=249, Churn=20% ===\n`);

    // Testar valores precisos entre 90d e 120d
    console.log(`=== Testando valores precisos (90d-120d) ===`);
    for (const j of [90, 95, 100, 105, 110, 115, 120]) {
      const dataAntes = new Date(new Date(DATA_INICIO).getTime() - j * 86400000).toISOString().split("T")[0];
      const [row] = await q(`
        SELECT 
          COUNT(DISTINCT base.cliente) as base_inicio,
          SUM(CASE WHEN NOT EXISTS (
            SELECT 1 FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
            WHERE uu2.unidade = ${EXT_ID}
              AND v2.cliente = base.cliente
              AND DATE(v2.data_criacao) >= '${DATA_INICIO}'
              AND DATE(v2.data_criacao) <= '${DATA_FIM}'
              AND v2.comanda_temp = 0 AND v2.status != 0
          ) THEN 1 ELSE 0 END) as perdidos
        FROM (
          SELECT DISTINCT v.cliente
          FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
          WHERE uu.unidade = ${EXT_ID}
            AND DATE(v.data_criacao) >= '${dataAntes}'
            AND DATE(v.data_criacao) < '${DATA_INICIO}'
            AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
        ) base
      `);
      const churn = (row.perdidos/row.base_inicio*100).toFixed(1);
      const match = Math.abs(row.base_inicio - 999) < 30 && Math.abs(row.perdidos - 249) < 30 ? " ← PRÓXIMO!" : "";
      console.log(`  ${j}d (de ${dataAntes}): Base=${row.base_inicio}, Perdidos=${row.perdidos}, Churn=${churn}%${match}`);
    }

    // Testar também: janelaDias * N para N em {1, 1.5, 2, 2.5, 3}
    console.log(`\n=== Testando múltiplos da janela (60d × N) ===`);
    for (const n of [1, 1.5, 2, 2.5, 3]) {
      const j = Math.round(60 * n);
      const dataAntes = new Date(new Date(DATA_INICIO).getTime() - j * 86400000).toISOString().split("T")[0];
      const [row] = await q(`
        SELECT 
          COUNT(DISTINCT base.cliente) as base_inicio,
          SUM(CASE WHEN NOT EXISTS (
            SELECT 1 FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
            WHERE uu2.unidade = ${EXT_ID}
              AND v2.cliente = base.cliente
              AND DATE(v2.data_criacao) >= '${DATA_INICIO}'
              AND DATE(v2.data_criacao) <= '${DATA_FIM}'
              AND v2.comanda_temp = 0 AND v2.status != 0
          ) THEN 1 ELSE 0 END) as perdidos
        FROM (
          SELECT DISTINCT v.cliente
          FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
          WHERE uu.unidade = ${EXT_ID}
            AND DATE(v.data_criacao) >= '${dataAntes}'
            AND DATE(v.data_criacao) < '${DATA_INICIO}'
            AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
        ) base
      `);
      const churn = (row.perdidos/row.base_inicio*100).toFixed(1);
      console.log(`  ${n}× (${j}d, de ${dataAntes}): Base=${row.base_inicio}, Perdidos=${row.perdidos}, Churn=${churn}%`);
    }

    // Testar: Resgatados com janela 60d
    console.log(`\n=== Resgatados com janela 60d ===`);
    const dataAntes60 = new Date(new Date(DATA_INICIO).getTime() - 60 * 86400000).toISOString().split("T")[0];
    const [res] = await q(`
      SELECT COUNT(DISTINCT v.cliente) as resgatados, AVG(gap) as tempo_medio
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
    console.log(`  Resgatados: ${res.resgatados}, Tempo médio: ${Number(res.tempo_medio).toFixed(1)}d`);
    console.log(`  Referência: 80, 109.1d`);

    // Testar: Resgatados com janelas diferentes
    console.log(`\n=== Resgatados com diferentes janelas ===`);
    for (const j of [30, 45, 60, 75, 90, 120]) {
      const dataAntes = new Date(new Date(DATA_INICIO).getTime() - j * 86400000).toISOString().split("T")[0];
      const [row] = await q(`
        SELECT COUNT(DISTINCT v.cliente) as resgatados, AVG(gap) as tempo_medio
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
                AND DATE(v2.data_criacao) >= '${dataAntes}'
                AND DATE(v2.data_criacao) < '${DATA_INICIO}'
                AND v2.comanda_temp = 0 AND v2.status != 0
            )
            AND EXISTS (
              SELECT 1 FROM vendas v3 JOIN usuarios uu3 ON v3.usuario = uu3.id
              WHERE uu3.unidade = ${EXT_ID}
                AND v3.cliente = v.cliente
                AND DATE(v3.data_criacao) < '${dataAntes}'
                AND v3.comanda_temp = 0 AND v3.status != 0
            )
          GROUP BY v.cliente
        ) sub
      `);
      const match = Math.abs(row.resgatados - 80) < 15 ? " ← PRÓXIMO!" : "";
      console.log(`  ${j}d: Resgatados=${row.resgatados}, Tempo médio: ${Number(row.tempo_medio).toFixed(1)}d${match}`);
    }

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
