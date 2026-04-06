/**
 * investigate_denom.mjs
 * Joinville (id=29), período 1/abr/2025–31/mar/2026
 * Referência: Base=999, Perdidos=249, Churn=20%
 *
 * Resultado anterior:
 * - 110d antes do início: Base=1153, Perdidos=249 ← Perdidos exato!
 * - Base Atual (60d antes do FIM) = 1000 ✓
 * - Churn = 249/1000 = 24.9% (não 20%)
 * - Churn = 249/1153 = 21.6% (não 20%)
 * - Para churn = 20%: denominador = 249/0.20 = 1245
 *
 * Hipótese: denominador = clientes que vieram nos 110d antes do início + novos do período
 * Ou: denominador = total de clientes únicos no período + base anterior
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
const LOCAL_PORT = 13412;

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
    console.log(`Para Churn=20%: denominador = 249/0.20 = 1245\n`);

    // Hipótese: denominador = clientes que vieram nos 110d antes do início UNION clientes do período
    const [hA] = await q(`
      SELECT COUNT(DISTINCT cliente) as total
      FROM (
        SELECT DISTINCT v.cliente
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND DATE(v.data_criacao) >= '2024-12-12'
          AND DATE(v.data_criacao) < '${DATA_INICIO}'
          AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
        UNION
        SELECT DISTINCT v.cliente
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND DATE(v.data_criacao) >= '${DATA_INICIO}'
          AND DATE(v.data_criacao) <= '${DATA_FIM}'
          AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
      ) u
    `);
    console.log(`[A] Base Início (110d) UNION Período: ${hA.total} (esperado: 1245)`);

    // Hipótese: denominador = clientes que vieram nos 110d antes do início + clientes novos do período
    const [hB] = await q(`
      SELECT COUNT(DISTINCT v.cliente) as novos_periodo
      FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
      WHERE uu.unidade = ${EXT_ID}
        AND DATE(v.data_criacao) >= '${DATA_INICIO}'
        AND DATE(v.data_criacao) <= '${DATA_FIM}'
        AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
        AND NOT EXISTS (
          SELECT 1 FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
          WHERE uu2.unidade = ${EXT_ID}
            AND v2.cliente = v.cliente
            AND DATE(v2.data_criacao) < '${DATA_INICIO}'
            AND v2.comanda_temp = 0 AND v2.status != 0
        )
    `);
    console.log(`[B] Novos no período (sem histórico anterior): ${hB.novos_periodo}`);
    console.log(`    Base 110d (1153) + Novos (${hB.novos_periodo}) = ${1153 + hB.novos_periodo}`);

    // Hipótese: denominador = Base Ativa (60d antes do FIM) + Perdidos
    // = 1000 + 249 = 1249 → Churn = 249/1249 = 19.9% ≈ 20% ← POSSÍVEL!
    console.log(`\n[C] Base Ativa (1000) + Perdidos (249) = 1249 → Churn = ${(249/1249*100).toFixed(1)}%`);
    console.log(`    ← HIPÓTESE MAIS PROVÁVEL: Churn = Perdidos / (Base Ativa + Perdidos)`);

    // Verificar com diferentes janelas de perdidos
    console.log(`\n=== Testando: Churn = Perdidos / (Base Ativa + Perdidos) ===`);
    const [baseAtiva] = await q(`
      SELECT COUNT(DISTINCT v.cliente) as total
      FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
      WHERE uu.unidade = ${EXT_ID}
        AND DATEDIFF('${DATA_FIM}', DATE(v.data_criacao)) <= 60
        AND DATE(v.data_criacao) <= '${DATA_FIM}'
        AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
    `);
    const ba = baseAtiva.total;
    console.log(`  Base Ativa (60d antes FIM) = ${ba}`);
    
    for (const j of [90, 95, 100, 105, 110, 115, 120]) {
      const dataAntes = new Date(new Date(DATA_INICIO).getTime() - j * 86400000).toISOString().split("T")[0];
      const [row] = await q(`
        SELECT 
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
      const p = row.perdidos;
      const churn = (p/(ba+p)*100).toFixed(1);
      const match = Math.abs(p - 249) < 20 ? " ← PERDIDOS PRÓXIMO!" : "";
      const churnMatch = Math.abs(parseFloat(churn) - 20.0) < 1 ? " ← CHURN PRÓXIMO!" : "";
      console.log(`  ${j}d (de ${dataAntes}): Perdidos=${p}, Churn=${churn}%${match}${churnMatch}`);
    }

    // Hipótese D: Churn = Perdidos / total de clientes únicos no período
    const [totalPeriodo] = await q(`
      SELECT COUNT(DISTINCT v.cliente) as total
      FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
      WHERE uu.unidade = ${EXT_ID}
        AND DATE(v.data_criacao) >= '${DATA_INICIO}'
        AND DATE(v.data_criacao) <= '${DATA_FIM}'
        AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
    `);
    console.log(`\n[D] Total período = ${totalPeriodo.total}`);
    console.log(`    Churn = 249/${totalPeriodo.total} = ${(249/totalPeriodo.total*100).toFixed(1)}%`);

    // Hipótese E: Resgatados = clientes que vieram no período após ausência de 110d
    const dataAntes110 = "2024-12-12";
    const [resE] = await q(`
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
              AND DATE(v2.data_criacao) >= '${dataAntes110}'
              AND DATE(v2.data_criacao) < '${DATA_INICIO}'
              AND v2.comanda_temp = 0 AND v2.status != 0
          )
          AND EXISTS (
            SELECT 1 FROM vendas v3 JOIN usuarios uu3 ON v3.usuario = uu3.id
            WHERE uu3.unidade = ${EXT_ID}
              AND v3.cliente = v.cliente
              AND DATE(v3.data_criacao) < '${dataAntes110}'
              AND v3.comanda_temp = 0 AND v3.status != 0
          )
        GROUP BY v.cliente
      ) sub
    `);
    console.log(`\n[E] Resgatados (ausência >110d): ${resE.resgatados}, Tempo médio: ${Number(resE.tempo_medio).toFixed(1)}d`);
    console.log(`    Referência: 80, 109.1d`);

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
