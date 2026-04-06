/**
 * investigate_exact.mjs
 * Joinville (id=29), período 1/abr/2025–31/mar/2026, janela 60d
 * Referência: Base=999, Perdidos=249, Churn=20%, Resgatados=80, TempoMédioResgate=109.1d
 *
 * Resultado anterior:
 * - Base Atual (60d antes do FIM) = 1000 ✓ (quase exato!)
 * - Janela 75d para Base Início = 1007, Perdidos=163 (mais próximo mas ainda não bate)
 * - Janela 90d para Base Início = 1074, Perdidos=196
 *
 * Nova hipótese:
 * - "Perdidos" no contexto de Churn & Saúde = clientes da base atual que estão há mais de janelaDias sem vir
 * - Mas calculado sobre a BASE DOS 12 MESES, não apenas do período
 * - Ou seja: de todos que vieram nos últimos 12m, quantos estão há mais de 60d sem vir?
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
const LOCAL_PORT = 13406;

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

    console.log(`\n=== Joinville (id=${EXT_ID}) | Ref: Base=999, Perdidos=249, Churn=20%, Resgatados=80 ===\n`);

    // Hipótese L: Base = clientes com última visita nos últimos 12m antes do FIM
    // Perdidos = desses, quem está há mais de janelaDias sem vir
    // Base Ativa = desses, quem está há menos de janelaDias sem vir
    const data12mAntesFim = "2025-03-31"; // 12m antes do FIM
    const [hL] = await q(`
      SELECT 
        COUNT(DISTINCT cliente) as total_12m,
        COUNT(DISTINCT CASE WHEN dias_sem_vir <= ${JANELA} THEN cliente END) as base_ativa,
        COUNT(DISTINCT CASE WHEN dias_sem_vir > ${JANELA} THEN cliente END) as perdidos
      FROM (
        SELECT v.cliente, DATEDIFF('${DATA_FIM}', MAX(DATE(v.data_criacao))) as dias_sem_vir
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND DATE(v.data_criacao) >= '${data12mAntesFim}'
          AND DATE(v.data_criacao) <= '${DATA_FIM}'
          AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
        GROUP BY v.cliente
      ) sub
    `);
    console.log(`[L] Base 12m antes do FIM (${data12mAntesFim}–${DATA_FIM}):`);
    console.log(`    Total: ${hL.total_12m}, Base Ativa: ${hL.base_ativa}, Perdidos: ${hL.perdidos}`);
    console.log(`    Churn: ${(hL.perdidos/hL.total_12m*100).toFixed(1)}%`);

    // Hipótese M: Testar janelas diferentes de "base" (quantos meses atrás olhar)
    console.log(`\n=== Testando janelas de base (meses antes do FIM) ===`);
    for (const meses of [3, 6, 9, 12, 15, 18, 24]) {
      const dataBase = new Date(new Date(DATA_FIM).getTime() - meses * 30 * 86400000).toISOString().split("T")[0];
      const [row] = await q(`
        SELECT 
          COUNT(DISTINCT cliente) as total,
          COUNT(DISTINCT CASE WHEN dias_sem_vir <= ${JANELA} THEN cliente END) as base_ativa,
          COUNT(DISTINCT CASE WHEN dias_sem_vir > ${JANELA} THEN cliente END) as perdidos
        FROM (
          SELECT v.cliente, DATEDIFF('${DATA_FIM}', MAX(DATE(v.data_criacao))) as dias_sem_vir
          FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
          WHERE uu.unidade = ${EXT_ID}
            AND DATE(v.data_criacao) >= '${dataBase}'
            AND DATE(v.data_criacao) <= '${DATA_FIM}'
            AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
          GROUP BY v.cliente
        ) sub
      `);
      console.log(`  ${meses}m (de ${dataBase}): Total=${row.total}, Base=${row.base_ativa}, Perdidos=${row.perdidos}, Churn=${(row.perdidos/row.total*100).toFixed(1)}%`);
    }

    // Hipótese N: Resgatados = clientes que vieram no período APÓS ausência de mais de janelaDias
    // Usando LAG para encontrar a visita anterior
    console.log(`\n=== Resgatados (voltaram após >${JANELA}d de ausência no período) ===`);
    const [hN] = await q(`
      SELECT COUNT(DISTINCT cliente) as resgatados, AVG(gap) as tempo_medio
      FROM (
        SELECT v.cliente, 
          DATEDIFF(DATE(v.data_criacao), 
            (SELECT MAX(DATE(v2.data_criacao)) 
             FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
             WHERE uu2.unidade = ${EXT_ID}
               AND v2.cliente = v.cliente
               AND DATE(v2.data_criacao) < DATE(v.data_criacao)
               AND v2.comanda_temp = 0 AND v2.status != 0
            )
          ) as gap
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND DATE(v.data_criacao) >= '${DATA_INICIO}'
          AND DATE(v.data_criacao) <= '${DATA_FIM}'
          AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
        GROUP BY v.cliente, DATE(v.data_criacao)
        HAVING gap > ${JANELA}
      ) sub
    `);
    console.log(`  Resgatados: ${hN.resgatados}, Tempo médio: ${Number(hN.tempo_medio).toFixed(1)}d`);
    console.log(`  Referência: Resgatados=80, TempoMédio=109.1d`);

    // Hipótese O: Resgatados = clientes que vieram no período mas não vieram nos janelaDias antes do início
    console.log(`\n=== Resgatados (vieram no período mas não nos ${JANELA}d antes do início) ===`);
    const dataJanelaAntes = new Date(new Date(DATA_INICIO).getTime() - JANELA * 86400000).toISOString().split("T")[0];
    const [hO] = await q(`
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
            AND DATE(v2.data_criacao) >= '${dataJanelaAntes}'
            AND DATE(v2.data_criacao) < '${DATA_INICIO}'
            AND v2.comanda_temp = 0 AND v2.status != 0
        )
        AND EXISTS (
          SELECT 1 FROM vendas v3 JOIN usuarios uu3 ON v3.usuario = uu3.id
          WHERE uu3.unidade = ${EXT_ID}
            AND v3.cliente = v.cliente
            AND DATE(v3.data_criacao) < '${dataJanelaAntes}'
            AND v3.comanda_temp = 0 AND v3.status != 0
        )
    `);
    console.log(`  Resgatados: ${hO.resgatados} (ref: 80)`);

    // Hipótese P: Valor perdido estimado
    // Valor perdido = perdidos × ticket médio do período
    const [ticketMedio] = await q(`
      SELECT AVG(v.valor_total) as ticket_medio
      FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
      WHERE uu.unidade = ${EXT_ID}
        AND DATE(v.data_criacao) >= '${DATA_INICIO}'
        AND DATE(v.data_criacao) <= '${DATA_FIM}'
        AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
    `);
    console.log(`\n=== Ticket médio do período ===`);
    console.log(`  Ticket médio: R$ ${Number(ticketMedio.ticket_medio).toFixed(2)}`);
    console.log(`  Valor perdido (249 × ticket): R$ ${(249 * Number(ticketMedio.ticket_medio)).toFixed(2)}`);
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
