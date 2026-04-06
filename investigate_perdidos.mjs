/**
 * investigate_perdidos.mjs
 * Joinville (id=29), período 1/abr/2025–31/mar/2026, janela 60d
 * Referência: Base=999, Perdidos=249, Churn=20%, Resgatados=80, TempoMédioResgate=109.1d
 *
 * Hipótese principal: 
 * - Base Ativa = clientes com última visita ≤60d antes do FIM (1000 ✓)
 * - Perdidos = clientes que ESTAVAM ATIVOS no início do período mas não voltaram no período
 *   (ou seja, base de clientes ativos 60d antes do INÍCIO do período que não vieram no período)
 * - Churn = Perdidos / (Base no início do período)
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
const LOCAL_PORT = 13405;

const DATA_INICIO = "2025-04-01";
const DATA_FIM = "2026-03-31";
const DATA_FIM_EXCL = "2026-04-01";
const JANELA = 60;
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

    console.log(`\n=== Joinville (id=${EXT_ID}) | Referência: Base=999, Perdidos=249, Churn=20% ===\n`);

    // DATA_INICIO_JANELA = 60d antes do início do período = "base de entrada"
    const dataInicioJanela = "2025-02-01"; // 60d antes de 2025-04-01

    // Hipótese J: 
    // Base Início = clientes ativos nos 60d antes do início do período
    // Perdidos = clientes da Base Início que não vieram no período
    // Base Atual = clientes ativos nos 60d antes do FIM
    // Churn = Perdidos / Base Início
    const [hJ_base_inicio] = await q(`
      SELECT COUNT(DISTINCT v.cliente) as total
      FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
      WHERE uu.unidade = ${EXT_ID}
        AND DATE(v.data_criacao) >= '${dataInicioJanela}'
        AND DATE(v.data_criacao) < '${DATA_INICIO}'
        AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
    `);
    
    const [hJ_perdidos] = await q(`
      SELECT COUNT(DISTINCT v.cliente) as total
      FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
      WHERE uu.unidade = ${EXT_ID}
        AND DATE(v.data_criacao) >= '${dataInicioJanela}'
        AND DATE(v.data_criacao) < '${DATA_INICIO}'
        AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
        AND NOT EXISTS (
          SELECT 1 FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
          WHERE uu2.unidade = ${EXT_ID}
            AND v2.cliente = v.cliente
            AND DATE(v2.data_criacao) >= '${DATA_INICIO}'
            AND DATE(v2.data_criacao) <= '${DATA_FIM}'
            AND v2.comanda_temp = 0 AND v2.status != 0
        )
    `);

    const [hJ_base_atual] = await q(`
      SELECT COUNT(DISTINCT v.cliente) as total
      FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
      WHERE uu.unidade = ${EXT_ID}
        AND DATEDIFF('${DATA_FIM}', DATE(v.data_criacao)) <= ${JANELA}
        AND DATE(v.data_criacao) <= '${DATA_FIM}'
        AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
    `);

    console.log(`[J] Lógica de saldo:`);
    console.log(`    Base Início (ativos 60d antes do início): ${hJ_base_inicio.total}`);
    console.log(`    Perdidos (não voltaram no período): ${hJ_perdidos.total}`);
    console.log(`    Base Atual (ativos 60d antes do FIM): ${hJ_base_atual.total}`);
    console.log(`    Churn: ${(hJ_perdidos.total/hJ_base_inicio.total*100).toFixed(1)}%`);
    console.log(`    Referência: Base=999, Perdidos=249, Churn=20%`);

    // Testar com diferentes janelas para Base Início
    console.log(`\n=== Testando janelas para Base Início ===`);
    for (const j of [30, 45, 60, 75, 90]) {
      const dataJ = new Date(new Date(DATA_INICIO).getTime() - j * 86400000).toISOString().split("T")[0];
      const [bi] = await q(`
        SELECT COUNT(DISTINCT v.cliente) as total
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND DATE(v.data_criacao) >= '${dataJ}'
          AND DATE(v.data_criacao) < '${DATA_INICIO}'
          AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
      `);
      const [pd] = await q(`
        SELECT COUNT(DISTINCT v.cliente) as total
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND DATE(v.data_criacao) >= '${dataJ}'
          AND DATE(v.data_criacao) < '${DATA_INICIO}'
          AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
          AND NOT EXISTS (
            SELECT 1 FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
            WHERE uu2.unidade = ${EXT_ID}
              AND v2.cliente = v.cliente
              AND DATE(v2.data_criacao) >= '${DATA_INICIO}'
              AND DATE(v2.data_criacao) <= '${DATA_FIM}'
              AND v2.comanda_temp = 0 AND v2.status != 0
          )
      `);
      console.log(`  Janela ${j}d (de ${dataJ}): Base Início=${bi.total}, Perdidos=${pd.total}, Churn=${(pd.total/bi.total*100).toFixed(1)}%`);
    }

    // Hipótese K: Resgatados = clientes que vieram no período mas não vieram nos 60d antes do início
    console.log(`\n=== Resgatados = voltaram após ausência ===`);
    for (const j of [30, 45, 60, 75, 90]) {
      const dataJ = new Date(new Date(DATA_INICIO).getTime() - j * 86400000).toISOString().split("T")[0];
      const [res] = await q(`
        SELECT COUNT(DISTINCT v.cliente) as resgatados
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND DATE(v.data_criacao) >= '${DATA_INICIO}'
          AND DATE(v.data_criacao) <= '${DATA_FIM}'
          AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
          AND NOT EXISTS (
            SELECT 1 FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
            WHERE uu2.unidade = ${EXT_ID}
              AND v2.cliente = v.cliente
              AND DATE(v2.data_criacao) >= '${dataJ}'
              AND DATE(v2.data_criacao) < '${DATA_INICIO}'
              AND v2.comanda_temp = 0 AND v2.status != 0
          )
          AND EXISTS (
            SELECT 1 FROM vendas v3 JOIN usuarios uu3 ON v3.usuario = uu3.id
            WHERE uu3.unidade = ${EXT_ID}
              AND v3.cliente = v.cliente
              AND DATE(v3.data_criacao) < '${dataJ}'
              AND v3.comanda_temp = 0 AND v3.status != 0
          )
      `);
      console.log(`  Janela ${j}d: Resgatados=${res.resgatados} (ref: 80)`);
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
