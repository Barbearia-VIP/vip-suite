/**
 * validate_churn.mjs
 * Valida os números de Churn & Saúde da Base para o período 1/abr/2025–31/mar/2026
 * com janela 60d, comparando com o sistema de referência.
 */
import { createRequire } from "module";
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
const LOCAL_PORT = 13399;

// Parâmetros do teste
const DATA_INICIO = "2025-04-01";
const DATA_FIM = "2026-03-31";
const DATA_FIM_EXCL = "2026-04-01";
const JANELA_DIAS = 60;

// Unidade de teste: Florianópolis - Santa Mônica
// Precisamos descobrir o extId dela
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
      server.listen(LOCAL_PORT, "127.0.0.1", () => {
        console.log(`Túnel SSH ativo na porta ${LOCAL_PORT}`);
        resolve({ ssh, server });
      });
    });
    ssh.on("error", reject);
    ssh.connect({ host: SSH_HOST, port: SSH_PORT, username: SSH_USER, password: SSH_PASS });
  });
}

async function main() {
  let tunnel;
  let pool;
  try {
    tunnel = await createTunnel();
    pool = await mysql.createPool({
      host: "127.0.0.1",
      port: LOCAL_PORT,
      user: DB_USER,
      password: DB_PASS,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 3,
    });

    const q = async (sql, params = []) => {
      const [rows] = await pool.execute(sql, params);
      return rows;
    };

    // 1. Descobrir o extId da unidade Florianópolis - Santa Mônica
    const unidades = await q("SELECT id, nome FROM unidades WHERE nome LIKE '%Santa M%' OR nome LIKE '%Florian%' LIMIT 10");
    console.log("\n=== Unidades encontradas ===");
    unidades.forEach(u => console.log(`  id=${u.id} nome=${u.nome}`));

    // Usar a primeira unidade encontrada
    const extId = unidades[0]?.id;
    if (!extId) {
      console.log("ERRO: Nenhuma unidade encontrada!");
      return;
    }
    console.log(`\nUsando unidade: id=${extId} nome=${unidades[0].nome}`);

    const unitCond = `uu.unidade = ${extId}`;
    const unitCondV2 = `uu2.unidade = ${extId}`;

    // 2. BASE ATIVA: clientes únicos no período
    const [baseRow] = await q(`
      SELECT COUNT(DISTINCT v.cliente) as total,
             COALESCE(SUM(v.valor_total) / COUNT(DISTINCT v.id), 0) as ticket_medio
      FROM vendas v
      JOIN usuarios uu ON v.usuario = uu.id
      WHERE ${unitCond}
        AND v.data_criacao >= ?
        AND v.data_criacao < ?
        AND v.comanda_temp = 0
        AND v.status != 0
        AND v.cliente IS NOT NULL
    `, [DATA_INICIO, DATA_FIM_EXCL]);
    console.log(`\n=== BASE ATIVA ===`);
    console.log(`  Total: ${baseRow.total} (referência: ~999)`);
    console.log(`  Ticket médio: R$ ${Number(baseRow.ticket_medio).toFixed(2)}`);

    // 3. PERDIDOS: última visita há mais de 60d antes do FIM do período
    const [perdidosRow] = await q(`
      SELECT COUNT(*) as total
      FROM (
        SELECT v.cliente, MAX(v.data_criacao) as ultima_visita
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitCond}
          AND v.data_criacao >= ?
          AND v.data_criacao < ?
          AND v.comanda_temp = 0
          AND v.status != 0
          AND v.cliente IS NOT NULL
        GROUP BY v.cliente
        HAVING DATEDIFF(?, MAX(v.data_criacao)) > ?
      ) sub
    `, [DATA_INICIO, DATA_FIM_EXCL, DATA_FIM_EXCL, JANELA_DIAS]);
    console.log(`\n=== PERDIDOS (janela ${JANELA_DIAS}d) ===`);
    console.log(`  Total: ${perdidosRow.total} (referência: ~249)`);
    const churnPct = baseRow.total > 0 ? (perdidosRow.total / baseRow.total * 100).toFixed(1) : 0;
    console.log(`  Churn %: ${churnPct}% (referência: ~20%)`);

    // 4. Também testar com DATEDIFF(NOW(), ...) para comparar
    const [perdidosNow] = await q(`
      SELECT COUNT(*) as total
      FROM (
        SELECT v.cliente, MAX(v.data_criacao) as ultima_visita
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitCond}
          AND v.data_criacao >= ?
          AND v.data_criacao < ?
          AND v.comanda_temp = 0
          AND v.status != 0
          AND v.cliente IS NOT NULL
        GROUP BY v.cliente
        HAVING DATEDIFF(NOW(), MAX(v.data_criacao)) > ?
      ) sub
    `, [DATA_INICIO, DATA_FIM_EXCL, JANELA_DIAS]);
    console.log(`\n=== PERDIDOS com DATEDIFF(NOW()) para comparação ===`);
    console.log(`  Total: ${perdidosNow.total}`);
    const churnNow = baseRow.total > 0 ? (perdidosNow.total / baseRow.total * 100).toFixed(1) : 0;
    console.log(`  Churn %: ${churnNow}%`);

    // 5. Distribuição por faixas de dias sem vir (relativo ao FIM do período)
    const diasRows = await q(`
      SELECT 
        SUM(CASE WHEN DATEDIFF(?, MAX(v.data_criacao)) <= 20 THEN 1 ELSE 0 END) as ate20,
        SUM(CASE WHEN DATEDIFF(?, MAX(v.data_criacao)) BETWEEN 21 AND 30 THEN 1 ELSE 0 END) as d21_30,
        SUM(CASE WHEN DATEDIFF(?, MAX(v.data_criacao)) BETWEEN 31 AND 45 THEN 1 ELSE 0 END) as d31_45,
        SUM(CASE WHEN DATEDIFF(?, MAX(v.data_criacao)) BETWEEN 46 AND 75 THEN 1 ELSE 0 END) as d46_75,
        SUM(CASE WHEN DATEDIFF(?, MAX(v.data_criacao)) > 75 THEN 1 ELSE 0 END) as mais75
      FROM (
        SELECT v.cliente, MAX(v.data_criacao) as ultima
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitCond}
          AND v.data_criacao >= ?
          AND v.data_criacao < ?
          AND v.comanda_temp = 0
          AND v.status != 0
          AND v.cliente IS NOT NULL
        GROUP BY v.cliente
      ) sub
      JOIN vendas v ON v.cliente = sub.cliente
    `, [DATA_FIM_EXCL, DATA_FIM_EXCL, DATA_FIM_EXCL, DATA_FIM_EXCL, DATA_FIM_EXCL, DATA_INICIO, DATA_FIM_EXCL]);

    // Simpler query for dias distribution
    const diasRows2 = await q(`
      SELECT 
        SUM(CASE WHEN dias <= 20 THEN 1 ELSE 0 END) as ate20,
        SUM(CASE WHEN dias BETWEEN 21 AND 30 THEN 1 ELSE 0 END) as d21_30,
        SUM(CASE WHEN dias BETWEEN 31 AND 45 THEN 1 ELSE 0 END) as d31_45,
        SUM(CASE WHEN dias BETWEEN 46 AND 75 THEN 1 ELSE 0 END) as d46_75,
        SUM(CASE WHEN dias > 75 THEN 1 ELSE 0 END) as mais75
      FROM (
        SELECT v.cliente, DATEDIFF(?, MAX(v.data_criacao)) as dias
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitCond}
          AND v.data_criacao >= ?
          AND v.data_criacao < ?
          AND v.comanda_temp = 0
          AND v.status != 0
          AND v.cliente IS NOT NULL
        GROUP BY v.cliente
      ) sub
    `, [DATA_FIM_EXCL, DATA_INICIO, DATA_FIM_EXCL]);

    console.log(`\n=== DISTRIBUIÇÃO POR DIAS SEM VIR (relativo ao FIM do período) ===`);
    const d = diasRows2[0];
    console.log(`  ≤20d: ${d.ate20} (referência: 576)`);
    console.log(`  21-30d: ${d.d21_30} (referência: 130)`);
    console.log(`  31-45d: ${d.d31_45} (referência: 168)`);
    console.log(`  46-75d: ${d.d46_75} (referência: 196)`);
    console.log(`  >75d: ${d.mais75} (referência: 722)`);
    const total = Number(d.ate20)+Number(d.d21_30)+Number(d.d31_45)+Number(d.d46_75)+Number(d.mais75);
    console.log(`  TOTAL: ${total} (referência: 1.792)`);

    console.log(`\n=== RESUMO ===`);
    console.log(`  Base Ativa: ${baseRow.total} (ref: 999)`);
    console.log(`  Perdidos (dataFim): ${perdidosRow.total} (ref: 249)`);
    console.log(`  Churn % (dataFim): ${churnPct}% (ref: 20%)`);
    console.log(`  Perdidos (NOW): ${perdidosNow.total}`);
    console.log(`  Churn % (NOW): ${churnNow}%`);

  } catch (err) {
    console.error("ERRO:", err.message);
  } finally {
    if (pool) await pool.end();
    if (tunnel) {
      tunnel.server.close();
      tunnel.ssh.destroy();
    }
    process.exit(0);
  }
}

main();
