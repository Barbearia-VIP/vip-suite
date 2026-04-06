/**
 * validate_cadencia.mjs
 * Testa a lógica de cadência individual para chegar nos números do sistema de referência:
 * Joinville: Base=1795, Perdidos=~560, Churn=~31%
 * (Nota: os prints mostram 560 perdidos para a unidade dos prints)
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
const LOCAL_PORT = 13403;

const DATA_INICIO = "2025-04-01";
const DATA_FIM_EXCL = "2026-04-01";
const EXT_ID = 29; // Joinville

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

    const unitCond = `uu.unidade = ${EXT_ID}`;
    console.log(`\n=== Joinville (id=${EXT_ID}) | Período: ${DATA_INICIO}–${DATA_FIM_EXCL} ===\n`);

    // Distribuição por dias sem vir (relativo ao FIM do período) - query simplificada
    const diasRows = await q(`
      SELECT 
        dias,
        COUNT(*) as cnt
      FROM (
        SELECT v.cliente, DATEDIFF('${DATA_FIM_EXCL}', MAX(v.data_criacao)) as dias
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND v.data_criacao >= '${DATA_INICIO}'
          AND v.data_criacao < '${DATA_FIM_EXCL}'
          AND v.comanda_temp = 0
          AND v.status != 0
          AND v.cliente IS NOT NULL
        GROUP BY v.cliente
      ) sub
      GROUP BY dias
      ORDER BY dias
    `);

    // Agregar manualmente
    let ate20=0, d21_30=0, d31_45=0, d46_75=0, mais75=0, total=0;
    for (const row of diasRows) {
      const d = Number(row.dias);
      const c = Number(row.cnt);
      total += c;
      if (d <= 20) ate20 += c;
      else if (d <= 30) d21_30 += c;
      else if (d <= 45) d31_45 += c;
      else if (d <= 75) d46_75 += c;
      else mais75 += c;
    }
    console.log(`DISTRIBUIÇÃO DIAS SEM VIR (relativo ao FIM ${DATA_FIM_EXCL}):`);
    console.log(`  ≤20d: ${ate20} | 21-30d: ${d21_30} | 31-45d: ${d31_45} | 46-75d: ${d46_75} | >75d: ${mais75} | total: ${total}`);
    console.log(`  Referência: 576 | 130 | 168 | 196 | 722 | 1.792`);

    // Distribuição por status usando cadência individual
    const statusRows = await q(`
      SELECT 
        n_visitas,
        dias_sem_vir,
        cadencia,
        CASE 
          WHEN n_visitas = 1 AND dias_sem_vir <= 30 THEN '1a_vez'
          WHEN n_visitas = 1 AND dias_sem_vir BETWEEN 31 AND 75 THEN 'em_risco_1v'
          WHEN n_visitas = 1 AND dias_sem_vir > 75 THEN 'perdido_1v'
          WHEN n_visitas >= 2 AND dias_sem_vir <= cadencia * 0.8 THEN 'assiduo'
          WHEN n_visitas >= 2 AND dias_sem_vir <= cadencia * 1.2 THEN 'regular'
          WHEN n_visitas >= 2 AND dias_sem_vir <= cadencia * 1.8 THEN 'espacando'
          WHEN n_visitas >= 2 AND dias_sem_vir <= cadencia * 2.5 THEN 'em_risco'
          ELSE 'perdido'
        END as status
      FROM (
        SELECT 
          v.cliente,
          COUNT(DISTINCT v.id) as n_visitas,
          DATEDIFF('${DATA_FIM_EXCL}', MAX(v.data_criacao)) as dias_sem_vir,
          CASE 
            WHEN COUNT(DISTINCT v.id) > 1 
            THEN DATEDIFF(MAX(v.data_criacao), MIN(v.data_criacao)) / (COUNT(DISTINCT v.id) - 1)
            ELSE 30
          END as cadencia
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND v.data_criacao >= '${DATA_INICIO}'
          AND v.data_criacao < '${DATA_FIM_EXCL}'
          AND v.comanda_temp = 0
          AND v.status != 0
          AND v.cliente IS NOT NULL
        GROUP BY v.cliente
      ) sub
    `);

    // Agregar por status
    const counts = {};
    for (const row of statusRows) {
      counts[row.status] = (counts[row.status] || 0) + 1;
    }
    const perdidoTotal = (counts['perdido'] || 0) + (counts['perdido_1v'] || 0);
    const emRiscoTotal = (counts['em_risco'] || 0) + (counts['em_risco_1v'] || 0);
    const totalStatus = Object.values(counts).reduce((a, b) => a + b, 0);
    const churnCad = totalStatus > 0 ? (perdidoTotal / totalStatus * 100).toFixed(1) : 0;

    console.log(`\nDISTRIBUIÇÃO POR STATUS (cadência individual, relativo ao FIM):`);
    console.log(`  Assíduo: ${counts['assiduo'] || 0}`);
    console.log(`  Regular: ${counts['regular'] || 0}`);
    console.log(`  Espaçando: ${counts['espacando'] || 0}`);
    console.log(`  Em Risco: ${emRiscoTotal} (${counts['em_risco_1v'] || 0} 1v + ${counts['em_risco'] || 0} 2v+)`);
    console.log(`  Perdido: ${perdidoTotal} (${counts['perdido_1v'] || 0} 1v + ${counts['perdido'] || 0} 2v+)`);
    console.log(`  1ª Vez (≤30d): ${counts['1a_vez'] || 0}`);
    console.log(`  Total: ${totalStatus} | Churn (cadência): ${churnCad}%`);
    console.log(`\nReferência: Assíduo=712 | Regular=206 | Espaçando=136 | Em Risco=130 | Perdido=560 | 1ªVez=48`);
    console.log(`Referência: Churn=31.3%`);

    // Testar com janela fixa de 75d (threshold de perdido para 1 visita)
    console.log(`\n=== Teste com janela fixa 75d ===`);
    const [p75] = await q(`
      SELECT COUNT(*) as total
      FROM (
        SELECT v.cliente, DATEDIFF('${DATA_FIM_EXCL}', MAX(v.data_criacao)) as dias
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND v.data_criacao >= '${DATA_INICIO}'
          AND v.data_criacao < '${DATA_FIM_EXCL}'
          AND v.comanda_temp = 0
          AND v.status != 0
          AND v.cliente IS NOT NULL
        GROUP BY v.cliente
        HAVING DATEDIFF('${DATA_FIM_EXCL}', MAX(v.data_criacao)) > 75
      ) sub
    `);
    console.log(`  Perdidos (>75d): ${p75.total} | Churn: ${(Number(p75.total)/total*100).toFixed(1)}%`);
    console.log(`  Referência: 560 perdidos (31.3%)`);

    // Verificar: os prints de status mostram 560 perdidos e 1792 total
    // Isso bate com Joinville (1795 total)!
    // Mas os prints de Churn & Saúde mostram Base=999, Perdidos=249, Churn=20%
    // Isso é com janela 60d - talvez seja outra unidade
    console.log(`\n=== ANÁLISE FINAL ===`);
    console.log(`Joinville tem ${total} clientes no período - BATE com o print de distribuição (1792)`);
    console.log(`Mas o print de Churn & Saúde mostra Base=999 - isso é OUTRA unidade ou outra lógica`);
    console.log(`\nPossibilidade: Churn & Saúde usa apenas clientes com 2+ visitas no período`);
    const [p2v] = await q(`
      SELECT COUNT(*) as total
      FROM (
        SELECT v.cliente, COUNT(DISTINCT v.id) as n_vis
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND v.data_criacao >= '${DATA_INICIO}'
          AND v.data_criacao < '${DATA_FIM_EXCL}'
          AND v.comanda_temp = 0
          AND v.status != 0
          AND v.cliente IS NOT NULL
        GROUP BY v.cliente
        HAVING n_vis >= 2
      ) sub
    `);
    console.log(`  Clientes com 2+ visitas: ${p2v.total}`);
    
    // Perdidos entre os de 2+ visitas com janela 60d
    const [p2vPerd] = await q(`
      SELECT COUNT(*) as total
      FROM (
        SELECT v.cliente, COUNT(DISTINCT v.id) as n_vis, DATEDIFF('${DATA_FIM_EXCL}', MAX(v.data_criacao)) as dias
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE uu.unidade = ${EXT_ID}
          AND v.data_criacao >= '${DATA_INICIO}'
          AND v.data_criacao < '${DATA_FIM_EXCL}'
          AND v.comanda_temp = 0
          AND v.status != 0
          AND v.cliente IS NOT NULL
        GROUP BY v.cliente
        HAVING n_vis >= 2 AND DATEDIFF('${DATA_FIM_EXCL}', MAX(v.data_criacao)) > 60
      ) sub
    `);
    console.log(`  Perdidos (2v+, >60d): ${p2vPerd.total} | Churn: ${(Number(p2vPerd.total)/Number(p2v.total)*100).toFixed(1)}%`);

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
