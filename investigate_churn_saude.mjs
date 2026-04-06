/**
 * investigate_churn_saude.mjs
 * Joinville (id=29), período 1/abr/2025–31/mar/2026, janela 60d
 * Sistema de referência: Base=999, Perdidos=249, Churn=20%, Resgatados=80, TempoMédioResgate=109.1d
 * 
 * Hipótese principal: o sistema usa apenas clientes que vieram no período
 * E "Base Ativa" = clientes cuja ÚLTIMA visita foi dentro dos últimos janelaDias do período
 * "Perdidos" = clientes que vieram no período mas cuja última visita foi há mais de janelaDias
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
const LOCAL_PORT = 13404;

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
    const q = async (sql, params = []) => { const [rows] = await pool.execute(sql, params); return rows; };

    console.log(`\n=== Joinville (id=${EXT_ID}) | ${DATA_INICIO}–${DATA_FIM} | Janela ${JANELA}d ===\n`);
    console.log(`Referência: Base=999, Perdidos=249, Churn=20%, Resgatados=80, TempoMédioResgate=109.1d\n`);

    // Hipótese A: Base = clientes com última visita nos últimos janelaDias antes do FIM
    // Perdidos = clientes do período cuja última visita foi há mais de janelaDias
    const [hA] = await q(`
      SELECT 
        COUNT(DISTINCT CASE WHEN DATEDIFF('${DATA_FIM}', ultima_visita) <= ${JANELA} THEN cliente END) as base_ativa,
        COUNT(DISTINCT CASE WHEN DATEDIFF('${DATA_FIM}', ultima_visita) > ${JANELA} THEN cliente END) as perdidos,
        COUNT(DISTINCT cliente) as total
      FROM (
        SELECT v.cliente, MAX(DATE(v.data_criacao)) as ultima_visita
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND v.data_criacao >= '${DATA_INICIO}' AND v.data_criacao < '${DATA_FIM_EXCL}'
          AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL
        GROUP BY v.cliente
      ) sub
    `);
    console.log(`[A] Base=última visita ≤${JANELA}d antes do FIM:`);
    console.log(`    Base Ativa: ${hA.base_ativa}, Perdidos: ${hA.perdidos}, Total: ${hA.total}`);
    console.log(`    Churn: ${(hA.perdidos/hA.total*100).toFixed(1)}%`);

    // Hipótese B: Usar apenas clientes com 2+ visitas no período
    const [hB] = await q(`
      SELECT 
        COUNT(DISTINCT CASE WHEN DATEDIFF('${DATA_FIM}', ultima_visita) <= ${JANELA} THEN cliente END) as base_ativa,
        COUNT(DISTINCT CASE WHEN DATEDIFF('${DATA_FIM}', ultima_visita) > ${JANELA} THEN cliente END) as perdidos,
        COUNT(DISTINCT cliente) as total
      FROM (
        SELECT v.cliente, MAX(DATE(v.data_criacao)) as ultima_visita, COUNT(DISTINCT v.id) as n_vis
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND v.data_criacao >= '${DATA_INICIO}' AND v.data_criacao < '${DATA_FIM_EXCL}'
          AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL
        GROUP BY v.cliente
        HAVING n_vis >= 2
      ) sub
    `);
    console.log(`\n[B] Apenas clientes com 2+ visitas no período:`);
    console.log(`    Base Ativa: ${hB.base_ativa}, Perdidos: ${hB.perdidos}, Total: ${hB.total}`);
    console.log(`    Churn: ${(hB.perdidos/hB.total*100).toFixed(1)}%`);

    // Hipótese C: "Base Ativa" = clientes que vieram nos últimos 12 meses antes do FIM
    // Mas "Perdidos" = quem não veio nos últimos janelaDias
    // E "Resgatados" = quem veio no período mas não havia vindo nos 12m anteriores ao início
    const dataInicio12mAntes = "2024-04-01"; // 12 meses antes do início do período
    const [hC] = await q(`
      SELECT 
        COUNT(DISTINCT CASE WHEN DATEDIFF('${DATA_FIM}', ultima_visita) <= ${JANELA} THEN cliente END) as base_ativa,
        COUNT(DISTINCT CASE WHEN DATEDIFF('${DATA_FIM}', ultima_visita) > ${JANELA} THEN cliente END) as perdidos,
        COUNT(DISTINCT cliente) as total
      FROM (
        SELECT v.cliente, MAX(DATE(v.data_criacao)) as ultima_visita
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND v.data_criacao >= '${dataInicio12mAntes}' AND v.data_criacao < '${DATA_FIM_EXCL}'
          AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL
        GROUP BY v.cliente
      ) sub
    `);
    console.log(`\n[C] Janela 24m (${dataInicio12mAntes}–${DATA_FIM}):`);
    console.log(`    Base Ativa: ${hC.base_ativa}, Perdidos: ${hC.perdidos}, Total: ${hC.total}`);
    console.log(`    Churn: ${(hC.perdidos/hC.total*100).toFixed(1)}%`);

    // Hipótese D: Usar vp.colaborador (barbeiro) em vez de v.usuario (caixa)
    const [hD] = await q(`
      SELECT 
        COUNT(DISTINCT CASE WHEN DATEDIFF('${DATA_FIM}', ultima_visita) <= ${JANELA} THEN cliente END) as base_ativa,
        COUNT(DISTINCT CASE WHEN DATEDIFF('${DATA_FIM}', ultima_visita) > ${JANELA} THEN cliente END) as perdidos,
        COUNT(DISTINCT cliente) as total
      FROM (
        SELECT v.cliente, MAX(DATE(v.data_criacao)) as ultima_visita
        FROM vendas v 
        JOIN usuarios uu ON v.usuario = uu.id
        JOIN vendas_produtos vp ON vp.venda = v.id
        WHERE uu.unidade = ${EXT_ID}
          AND v.data_criacao >= '${DATA_INICIO}' AND v.data_criacao < '${DATA_FIM_EXCL}'
          AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL
          AND vp.colaborador IS NOT NULL
        GROUP BY v.cliente
      ) sub
    `);
    console.log(`\n[D] Com JOIN vendas_produtos (barbeiro):`);
    console.log(`    Base Ativa: ${hD.base_ativa}, Perdidos: ${hD.perdidos}, Total: ${hD.total}`);
    console.log(`    Churn: ${(hD.perdidos/hD.total*100).toFixed(1)}%`);

    // Hipótese E: Testar diferentes janelas para encontrar 999 ativos e 249 perdidos
    console.log(`\n=== Testando janelas diferentes para encontrar Base=999, Perdidos=249 ===`);
    for (const j of [30, 45, 60, 75, 90, 120]) {
      const [row] = await q(`
        SELECT 
          COUNT(DISTINCT CASE WHEN DATEDIFF('${DATA_FIM}', ultima_visita) <= ${j} THEN cliente END) as base_ativa,
          COUNT(DISTINCT CASE WHEN DATEDIFF('${DATA_FIM}', ultima_visita) > ${j} THEN cliente END) as perdidos,
          COUNT(DISTINCT cliente) as total
        FROM (
          SELECT v.cliente, MAX(DATE(v.data_criacao)) as ultima_visita
          FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
          WHERE uu.unidade = ${EXT_ID}
            AND v.data_criacao >= '${DATA_INICIO}' AND v.data_criacao < '${DATA_FIM_EXCL}'
            AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL
          GROUP BY v.cliente
        ) sub
      `);
      console.log(`  Janela ${j}d: Base=${row.base_ativa}, Perdidos=${row.perdidos}, Churn=${(row.perdidos/row.total*100).toFixed(1)}%`);
    }

    // Hipótese F: O sistema usa apenas clientes que vieram EXATAMENTE no período selecionado
    // E classifica como "perdido" quem não voltou após a última visita (usando cadência)
    // Base Ativa = clientes com cadência não ultrapassada
    console.log(`\n=== Hipótese F: Base Ativa = clientes com cadência não ultrapassada ===`);
    const [hF] = await q(`
      SELECT 
        COUNT(DISTINCT CASE WHEN dias_sem_vir <= cadencia * 2.5 THEN cliente END) as base_ativa,
        COUNT(DISTINCT CASE WHEN dias_sem_vir > cadencia * 2.5 THEN cliente END) as perdidos,
        COUNT(DISTINCT cliente) as total
      FROM (
        SELECT v.cliente, 
          DATEDIFF('${DATA_FIM}', MAX(DATE(v.data_criacao))) as dias_sem_vir,
          CASE WHEN COUNT(DISTINCT v.id) > 1 
            THEN DATEDIFF(MAX(DATE(v.data_criacao)), MIN(DATE(v.data_criacao))) / (COUNT(DISTINCT v.id) - 1)
            ELSE 30 END as cadencia
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND v.data_criacao >= '${DATA_INICIO}' AND v.data_criacao < '${DATA_FIM_EXCL}'
          AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL
        GROUP BY v.cliente
      ) sub
    `);
    console.log(`  Base Ativa: ${hF.base_ativa}, Perdidos: ${hF.perdidos}, Total: ${hF.total}`);
    console.log(`  Churn: ${(hF.perdidos/hF.total*100).toFixed(1)}%`);

    // Hipótese G: Resgatados = clientes que voltaram após longa ausência
    // Tempo médio resgate = 109.1d → clientes que ficaram ~109d sem vir e voltaram
    console.log(`\n=== Hipótese G: Resgatados = voltaram após >${JANELA}d de ausência ===`);
    const [hG] = await q(`
      SELECT COUNT(DISTINCT v.cliente) as resgatados,
             AVG(DATEDIFF(DATE(v.data_criacao), prev_visita)) as tempo_medio_resgate
      FROM (
        SELECT v.cliente, DATE(v.data_criacao) as data_visita,
          LAG(DATE(v.data_criacao)) OVER (PARTITION BY v.cliente ORDER BY v.data_criacao) as prev_visita
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND v.data_criacao >= '${DATA_INICIO}' AND v.data_criacao < '${DATA_FIM_EXCL}'
          AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL
      ) v
      WHERE prev_visita IS NOT NULL AND DATEDIFF(data_visita, prev_visita) > ${JANELA}
    `);
    console.log(`  Resgatados: ${hG.resgatados}, Tempo médio: ${Number(hG.tempo_medio_resgate).toFixed(1)}d`);
    console.log(`  Referência: Resgatados=80, TempoMédio=109.1d`);

    // Hipótese H: Usar apenas clientes com pelo menos 1 visita nos 12m ANTERIORES ao período
    // (clientes "conhecidos" da base)
    console.log(`\n=== Hipótese H: Base = apenas clientes que já vieram antes do período ===`);
    const [hH] = await q(`
      SELECT 
        COUNT(DISTINCT CASE WHEN DATEDIFF('${DATA_FIM}', ultima_visita) <= ${JANELA} THEN cliente END) as base_ativa,
        COUNT(DISTINCT CASE WHEN DATEDIFF('${DATA_FIM}', ultima_visita) > ${JANELA} THEN cliente END) as perdidos,
        COUNT(DISTINCT cliente) as total
      FROM (
        SELECT v.cliente, MAX(DATE(v.data_criacao)) as ultima_visita
        FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND v.data_criacao >= '${DATA_INICIO}' AND v.data_criacao < '${DATA_FIM_EXCL}'
          AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
            WHERE uu2.unidade = ${EXT_ID}
              AND v2.cliente = v.cliente
              AND v2.data_criacao < '${DATA_INICIO}'
              AND v2.comanda_temp = 0 AND v2.status != 0
          )
        GROUP BY v.cliente
      ) sub
    `);
    console.log(`  Base Ativa: ${hH.base_ativa}, Perdidos: ${hH.perdidos}, Total: ${hH.total}`);
    console.log(`  Churn: ${(hH.perdidos/hH.total*100).toFixed(1)}%`);

    // Hipótese I: "Base Ativa" = clientes que vieram no período E têm pelo menos 1 visita anterior
    // E "Perdidos" = clientes que vieram ANTES do período mas não vieram no período
    console.log(`\n=== Hipótese I: Perdidos = vieram antes mas não no período ===`);
    // Base = clientes ativos nos 12m antes do início
    const [baseAntes] = await q(`
      SELECT COUNT(DISTINCT v.cliente) as total
      FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
      WHERE uu.unidade = ${EXT_ID}
        AND v.data_criacao >= DATE_SUB('${DATA_INICIO}', INTERVAL 12 MONTH)
        AND v.data_criacao < '${DATA_INICIO}'
        AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL
    `);
    // Perdidos = quem estava na base mas não voltou no período
    const [perdidosAntes] = await q(`
      SELECT COUNT(DISTINCT v.cliente) as total
      FROM vendas v JOIN usuarios uu ON v.usuario = uu.id
      WHERE uu.unidade = ${EXT_ID}
        AND v.data_criacao >= DATE_SUB('${DATA_INICIO}', INTERVAL 12 MONTH)
        AND v.data_criacao < '${DATA_INICIO}'
        AND v.comanda_temp = 0 AND v.status != 0 AND v.cliente IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM vendas v2 JOIN usuarios uu2 ON v2.usuario = uu2.id
          WHERE uu2.unidade = ${EXT_ID}
            AND v2.cliente = v.cliente
            AND v2.data_criacao >= '${DATA_INICIO}' AND v2.data_criacao < '${DATA_FIM_EXCL}'
            AND v2.comanda_temp = 0 AND v2.status != 0
        )
    `);
    console.log(`  Base (12m antes): ${baseAntes.total}`);
    console.log(`  Perdidos (não voltaram): ${perdidosAntes.total}`);
    console.log(`  Churn: ${(perdidosAntes.total/baseAntes.total*100).toFixed(1)}%`);

  } catch (err) {
    console.error("ERRO:", err.message);
  } finally {
    if (pool) await pool.end();
    if (tunnel) { tunnel.server.close(); tunnel.ssh.destroy(); }
    process.exit(0);
  }
}

main();
