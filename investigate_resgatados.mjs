/**
 * investigate_resgatados.mjs
 * Joinville (id=29), período 1/abr/2025–31/mar/2026, janela 60d
 * Referência: Resgatados=80, Tempo Médio=109.1d
 *
 * Hipóteses a testar:
 * A) Clientes que vieram no período E cuja última visita ANTES do período foi há mais de 60d
 * B) Clientes que vieram no período E cuja última visita ANTES do período foi há mais de 110d
 * C) Clientes que vieram no período E não vieram nos 110d antes do início (mas têm histórico anterior)
 * D) Clientes que vieram no período E não vieram nos 60d antes do início (mas têm histórico)
 * E) Clientes que vieram no período E não vieram nos janelaEntrada=110d antes do início
 *    E o gap médio é calculado como DATEDIFF(primeira_visita_no_periodo, ultima_visita_antes)
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
const LOCAL_PORT = 13415;

const DATA_INICIO = "2025-04-01";
const DATA_FIM = "2026-03-31";
const EXT_ID = 29;
const JANELA = 60;
const JANELA_ENTRADA = Math.round(JANELA * 1.833); // 110d

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
    const q = async (sql, params = []) => {
      const [rows] = await pool.execute(sql, params);
      return rows;
    };

    console.log(`\n=== Joinville (id=${EXT_ID}) | Ref: Resgatados=80, Tempo Médio=109.1d ===`);
    console.log(`Período: ${DATA_INICIO} a ${DATA_FIM}, Janela=${JANELA}d, JanelaEntrada=${JANELA_ENTRADA}d\n`);

    // Hipótese A: clientes que vieram no período E última visita antes do período foi há > JANELA dias
    const [hA] = await q(`
      SELECT COUNT(DISTINCT sub.cliente) as total, AVG(sub.gap) as tempo_medio
      FROM (
        SELECT v.cliente,
          DATEDIFF(
            (SELECT MIN(DATE(v2.data_criacao)) FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
             WHERE uu2.unidade = ${EXT_ID} AND v2.cliente = v.cliente
               AND DATE(v2.data_criacao) >= '${DATA_INICIO}' AND DATE(v2.data_criacao) <= '${DATA_FIM}'
               AND v2.comanda_temp = 0 AND v2.status != 0),
            (SELECT MAX(DATE(v3.data_criacao)) FROM vendas v3 JOIN usuarios uu3 ON v3.usuario = uu3.id
             WHERE uu3.unidade = ${EXT_ID} AND v3.cliente = v.cliente
               AND DATE(v3.data_criacao) < '${DATA_INICIO}'
               AND v3.comanda_temp = 0 AND v3.status != 0)
          ) as gap
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND DATE(v.data_criacao) >= '${DATA_INICIO}' AND DATE(v.data_criacao) <= '${DATA_FIM}'
          AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
        GROUP BY v.cliente
        HAVING gap > ${JANELA}
      ) sub
    `);
    console.log(`[A] Gap > ${JANELA}d: Resgatados=${hA.total}, Tempo Médio=${Number(hA.tempo_medio).toFixed(1)}d`);

    // Hipótese B: clientes que vieram no período E última visita antes foi há > 90d
    const [hB] = await q(`
      SELECT COUNT(DISTINCT sub.cliente) as total, AVG(sub.gap) as tempo_medio
      FROM (
        SELECT v.cliente,
          DATEDIFF(
            (SELECT MIN(DATE(v2.data_criacao)) FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
             WHERE uu2.unidade = ${EXT_ID} AND v2.cliente = v.cliente
               AND DATE(v2.data_criacao) >= '${DATA_INICIO}' AND DATE(v2.data_criacao) <= '${DATA_FIM}'
               AND v2.comanda_temp = 0 AND v2.status != 0),
            (SELECT MAX(DATE(v3.data_criacao)) FROM vendas v3 JOIN usuarios uu3 ON v3.usuario = uu3.id
             WHERE uu3.unidade = ${EXT_ID} AND v3.cliente = v.cliente
               AND DATE(v3.data_criacao) < '${DATA_INICIO}'
               AND v3.comanda_temp = 0 AND v3.status != 0)
          ) as gap
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND DATE(v.data_criacao) >= '${DATA_INICIO}' AND DATE(v.data_criacao) <= '${DATA_FIM}'
          AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
        GROUP BY v.cliente
        HAVING gap > 90
      ) sub
    `);
    console.log(`[B] Gap > 90d: Resgatados=${hB.total}, Tempo Médio=${Number(hB.tempo_medio).toFixed(1)}d`);

    // Hipótese C: clientes que vieram no período E não vieram nos 110d antes do início (mas têm histórico)
    const dataAntes110 = new Date(new Date(DATA_INICIO + "T12:00:00Z").getTime() - JANELA_ENTRADA * 86400000).toISOString().slice(0, 10);
    const [hC] = await q(`
      SELECT COUNT(DISTINCT sub.cliente) as total, AVG(sub.gap) as tempo_medio
      FROM (
        SELECT v.cliente,
          DATEDIFF(
            (SELECT MIN(DATE(v2.data_criacao)) FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
             WHERE uu2.unidade = ${EXT_ID} AND v2.cliente = v.cliente
               AND DATE(v2.data_criacao) >= '${DATA_INICIO}' AND DATE(v2.data_criacao) <= '${DATA_FIM}'
               AND v2.comanda_temp = 0 AND v2.status != 0),
            (SELECT MAX(DATE(v3.data_criacao)) FROM vendas v3 JOIN usuarios uu3 ON v3.usuario = uu3.id
             WHERE uu3.unidade = ${EXT_ID} AND v3.cliente = v.cliente
               AND DATE(v3.data_criacao) < '${DATA_INICIO}'
               AND v3.comanda_temp = 0 AND v3.status != 0)
          ) as gap
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND DATE(v.data_criacao) >= '${DATA_INICIO}' AND DATE(v.data_criacao) <= '${DATA_FIM}'
          AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
          AND NOT EXISTS (
            SELECT 1 FROM vendas v4 JOIN usuarios uu4 ON v4.usuario = uu4.id
            WHERE uu4.unidade = ${EXT_ID} AND v4.cliente = v.cliente
              AND DATE(v4.data_criacao) >= '${dataAntes110}'
              AND DATE(v4.data_criacao) < '${DATA_INICIO}'
              AND v4.comanda_temp = 0 AND v4.status != 0
          )
          AND EXISTS (
            SELECT 1 FROM vendas v5 JOIN usuarios uu5 ON v5.usuario = uu5.id
            WHERE uu5.unidade = ${EXT_ID} AND v5.cliente = v.cliente
              AND DATE(v5.data_criacao) < '${dataAntes110}'
              AND v5.comanda_temp = 0 AND v5.status != 0
          )
        GROUP BY v.cliente
      ) sub
    `);
    console.log(`[C] Não vieram nos ${JANELA_ENTRADA}d antes do início (mas têm histórico anterior): Resgatados=${hC.total}, Tempo Médio=${Number(hC.tempo_medio).toFixed(1)}d`);

    // Hipótese D: clientes que vieram no período E não vieram nos 60d antes do início (mas têm histórico)
    const dataAntes60 = new Date(new Date(DATA_INICIO + "T12:00:00Z").getTime() - JANELA * 86400000).toISOString().slice(0, 10);
    const [hD] = await q(`
      SELECT COUNT(DISTINCT sub.cliente) as total, AVG(sub.gap) as tempo_medio
      FROM (
        SELECT v.cliente,
          DATEDIFF(
            (SELECT MIN(DATE(v2.data_criacao)) FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
             WHERE uu2.unidade = ${EXT_ID} AND v2.cliente = v.cliente
               AND DATE(v2.data_criacao) >= '${DATA_INICIO}' AND DATE(v2.data_criacao) <= '${DATA_FIM}'
               AND v2.comanda_temp = 0 AND v2.status != 0),
            (SELECT MAX(DATE(v3.data_criacao)) FROM vendas v3 JOIN usuarios uu3 ON v3.usuario = uu3.id
             WHERE uu3.unidade = ${EXT_ID} AND v3.cliente = v.cliente
               AND DATE(v3.data_criacao) < '${DATA_INICIO}'
               AND v3.comanda_temp = 0 AND v3.status != 0)
          ) as gap
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND DATE(v.data_criacao) >= '${DATA_INICIO}' AND DATE(v.data_criacao) <= '${DATA_FIM}'
          AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
          AND NOT EXISTS (
            SELECT 1 FROM vendas v4 JOIN usuarios uu4 ON v4.usuario = uu4.id
            WHERE uu4.unidade = ${EXT_ID} AND v4.cliente = v.cliente
              AND DATE(v4.data_criacao) >= '${dataAntes60}'
              AND DATE(v4.data_criacao) < '${DATA_INICIO}'
              AND v4.comanda_temp = 0 AND v4.status != 0
          )
          AND EXISTS (
            SELECT 1 FROM vendas v5 JOIN usuarios uu5 ON v5.usuario = uu5.id
            WHERE uu5.unidade = ${EXT_ID} AND v5.cliente = v.cliente
              AND DATE(v5.data_criacao) < '${dataAntes60}'
              AND v5.comanda_temp = 0 AND v5.status != 0
          )
        GROUP BY v.cliente
      ) sub
    `);
    console.log(`[D] Não vieram nos ${JANELA}d antes do início (mas têm histórico anterior): Resgatados=${hD.total}, Tempo Médio=${Number(hD.tempo_medio).toFixed(1)}d`);

    // Hipótese E: clientes que vieram no período E gap > JANELA_ENTRADA (110d)
    const [hE] = await q(`
      SELECT COUNT(DISTINCT sub.cliente) as total, AVG(sub.gap) as tempo_medio
      FROM (
        SELECT v.cliente,
          DATEDIFF(
            (SELECT MIN(DATE(v2.data_criacao)) FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
             WHERE uu2.unidade = ${EXT_ID} AND v2.cliente = v.cliente
               AND DATE(v2.data_criacao) >= '${DATA_INICIO}' AND DATE(v2.data_criacao) <= '${DATA_FIM}'
               AND v2.comanda_temp = 0 AND v2.status != 0),
            (SELECT MAX(DATE(v3.data_criacao)) FROM vendas v3 JOIN usuarios uu3 ON v3.usuario = uu3.id
             WHERE uu3.unidade = ${EXT_ID} AND v3.cliente = v.cliente
               AND DATE(v3.data_criacao) < '${DATA_INICIO}'
               AND v3.comanda_temp = 0 AND v3.status != 0)
          ) as gap
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND DATE(v.data_criacao) >= '${DATA_INICIO}' AND DATE(v.data_criacao) <= '${DATA_FIM}'
          AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
        GROUP BY v.cliente
        HAVING gap > ${JANELA_ENTRADA}
      ) sub
    `);
    console.log(`[E] Gap > ${JANELA_ENTRADA}d: Resgatados=${hE.total}, Tempo Médio=${Number(hE.tempo_medio).toFixed(1)}d`);

    // Hipótese F: Resgatados = clientes que estavam na lista de "Perdidos" do período ANTERIOR
    // e voltaram neste período. Período anterior = 1/abr/2024–31/mar/2025
    const DATA_INICIO_ANT = "2024-04-01";
    const DATA_FIM_ANT = "2025-03-31";
    const dataAntes110_ant = new Date(new Date(DATA_INICIO_ANT + "T12:00:00Z").getTime() - JANELA_ENTRADA * 86400000).toISOString().slice(0, 10);
    const [hF] = await q(`
      SELECT COUNT(DISTINCT sub.cliente) as total, AVG(sub.gap) as tempo_medio
      FROM (
        SELECT perdidos_ant.cliente,
          DATEDIFF(
            (SELECT MIN(DATE(v2.data_criacao)) FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
             WHERE uu2.unidade = ${EXT_ID} AND v2.cliente = perdidos_ant.cliente
               AND DATE(v2.data_criacao) >= '${DATA_INICIO}' AND DATE(v2.data_criacao) <= '${DATA_FIM}'
               AND v2.comanda_temp = 0 AND v2.status != 0),
            (SELECT MAX(DATE(v3.data_criacao)) FROM vendas v3 JOIN usuarios uu3 ON v3.usuario = uu3.id
             WHERE uu3.unidade = ${EXT_ID} AND v3.cliente = perdidos_ant.cliente
               AND DATE(v3.data_criacao) < '${DATA_INICIO}'
               AND v3.comanda_temp = 0 AND v3.status != 0)
          ) as gap
        FROM (
          SELECT DISTINCT v.cliente
          FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
          WHERE uu.unidade = ${EXT_ID}
            AND DATE(v.data_criacao) >= '${dataAntes110_ant}'
            AND DATE(v.data_criacao) < '${DATA_INICIO_ANT}'
            AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
        ) perdidos_ant
        WHERE NOT EXISTS (
          SELECT 1 FROM vendas v4 JOIN usuarios uu4 ON v4.usuario = uu4.id
          WHERE uu4.unidade = ${EXT_ID} AND v4.cliente = perdidos_ant.cliente
            AND DATE(v4.data_criacao) >= '${DATA_INICIO_ANT}' AND DATE(v4.data_criacao) <= '${DATA_FIM_ANT}'
            AND v4.comanda_temp = 0 AND v4.status != 0
        )
        AND EXISTS (
          SELECT 1 FROM vendas v5 JOIN usuarios uu5 ON v5.usuario = uu5.id
          WHERE uu5.unidade = ${EXT_ID} AND v5.cliente = perdidos_ant.cliente
            AND DATE(v5.data_criacao) >= '${DATA_INICIO}' AND DATE(v5.data_criacao) <= '${DATA_FIM}'
            AND v5.comanda_temp = 0 AND v5.status != 0
        )
      ) sub
    `);
    console.log(`[F] Perdidos do período anterior que voltaram neste: Resgatados=${hF.total}, Tempo Médio=${Number(hF.tempo_medio).toFixed(1)}d`);

    // Hipótese G: Resgatados dentro da janela selecionada (60d × N)
    // Clientes que vieram no período E não vieram nos últimos X dias antes do início
    for (const dias of [60, 75, 90, 100, 110, 120, 150, 180]) {
      const dataRef = new Date(new Date(DATA_INICIO + "T12:00:00Z").getTime() - dias * 86400000).toISOString().slice(0, 10);
      const [hG] = await q(`
        SELECT COUNT(DISTINCT sub.cliente) as total, AVG(sub.gap) as tempo_medio
        FROM (
          SELECT v.cliente,
            DATEDIFF(
              (SELECT MIN(DATE(v2.data_criacao)) FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
               WHERE uu2.unidade = ${EXT_ID} AND v2.cliente = v.cliente
                 AND DATE(v2.data_criacao) >= '${DATA_INICIO}' AND DATE(v2.data_criacao) <= '${DATA_FIM}'
                 AND v2.comanda_temp = 0 AND v2.status != 0),
              (SELECT MAX(DATE(v3.data_criacao)) FROM vendas v3 JOIN usuarios uu3 ON v3.usuario = uu3.id
               WHERE uu3.unidade = ${EXT_ID} AND v3.cliente = v.cliente
                 AND DATE(v3.data_criacao) < '${DATA_INICIO}'
                 AND v3.comanda_temp = 0 AND v3.status != 0)
            ) as gap
          FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
          WHERE uu.unidade = ${EXT_ID}
            AND DATE(v.data_criacao) >= '${DATA_INICIO}' AND DATE(v.data_criacao) <= '${DATA_FIM}'
            AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL AND v.cliente != 2
            AND NOT EXISTS (
              SELECT 1 FROM vendas v4 JOIN usuarios uu4 ON v4.usuario = uu4.id
              WHERE uu4.unidade = ${EXT_ID} AND v4.cliente = v.cliente
                AND DATE(v4.data_criacao) >= '${dataRef}'
                AND DATE(v4.data_criacao) < '${DATA_INICIO}'
                AND v4.comanda_temp = 0 AND v4.status != 0
            )
            AND EXISTS (
              SELECT 1 FROM vendas v5 JOIN usuarios uu5 ON v5.usuario = uu5.id
              WHERE uu5.unidade = ${EXT_ID} AND v5.cliente = v.cliente
                AND DATE(v5.data_criacao) < '${dataRef}'
                AND v5.comanda_temp = 0 AND v5.status != 0
            )
          GROUP BY v.cliente
        ) sub
      `);
      const match = Math.abs(hG.total - 80) <= 10 ? " ← PRÓXIMO!" : "";
      const tmatch = Math.abs(Number(hG.tempo_medio) - 109.1) <= 10 ? " ← TEMPO PRÓXIMO!" : "";
      console.log(`[G-${dias}d] Ausência >${dias}d antes do início: Resgatados=${hG.total}, Tempo=${Number(hG.tempo_medio).toFixed(1)}d${match}${tmatch}`);
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
