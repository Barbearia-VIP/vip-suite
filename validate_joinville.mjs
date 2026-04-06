/**
 * validate_joinville.mjs
 * Valida os números de Churn & Saúde da Base para a unidade Joinville (id=29)
 * Período: 1/abr/2025–31/mar/2026, janela 60d
 * Referência do sistema: Base Ativa ~999, Perdidos ~249, Churn ~20%
 * (Os prints mostram esses números — agora testamos com Joinville)
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
const LOCAL_PORT = 13402;

const DATA_INICIO = "2025-04-01";
const DATA_FIM_EXCL = "2026-04-01";
const JANELA_DIAS = 60;
const EXT_ID = 29; // Brasil - SC - Joinville - América

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
    console.log(`\n=== Validação Joinville (id=${EXT_ID}) | Período: ${DATA_INICIO} – ${DATA_FIM_EXCL} | Janela: ${JANELA_DIAS}d ===\n`);

    // BASE ATIVA: clientes únicos no período
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
    const baseAtiva = Number(baseRow.total);
    const ticketMedio = Number(baseRow.ticket_medio);
    console.log(`BASE ATIVA: ${baseAtiva} | Ticket médio: R$ ${ticketMedio.toFixed(2)}`);

    // PERDIDOS com DATEDIFF(dataFim, ultima_visita) > janelaDias
    const [perdidosFim] = await q(`
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
    const perdidos = Number(perdidosFim.total);
    const churnPct = baseAtiva > 0 ? (perdidos / baseAtiva * 100).toFixed(1) : 0;
    console.log(`PERDIDOS (DATEDIFF dataFim): ${perdidos} | Churn: ${churnPct}%`);

    // PERDIDOS com DATEDIFF(NOW(), ultima_visita) > janelaDias
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
    const churnNow = baseAtiva > 0 ? (Number(perdidosNow.total) / baseAtiva * 100).toFixed(1) : 0;
    console.log(`PERDIDOS (DATEDIFF NOW):     ${perdidosNow.total} | Churn: ${churnNow}%`);

    // DISTRIBUIÇÃO POR DIAS SEM VIR (relativo ao FIM do período)
    const [diasFim] = await q(`
      SELECT 
        SUM(CASE WHEN dias <= 20 THEN 1 ELSE 0 END) as ate20,
        SUM(CASE WHEN dias BETWEEN 21 AND 30 THEN 1 ELSE 0 END) as d21_30,
        SUM(CASE WHEN dias BETWEEN 31 AND 45 THEN 1 ELSE 0 END) as d31_45,
        SUM(CASE WHEN dias BETWEEN 46 AND 75 THEN 1 ELSE 0 END) as d46_75,
        SUM(CASE WHEN dias > 75 THEN 1 ELSE 0 END) as mais75,
        COUNT(*) as total
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

    // DISTRIBUIÇÃO POR DIAS SEM VIR (relativo ao NOW)
    const [diasNow] = await q(`
      SELECT 
        SUM(CASE WHEN dias <= 20 THEN 1 ELSE 0 END) as ate20,
        SUM(CASE WHEN dias BETWEEN 21 AND 30 THEN 1 ELSE 0 END) as d21_30,
        SUM(CASE WHEN dias BETWEEN 31 AND 45 THEN 1 ELSE 0 END) as d31_45,
        SUM(CASE WHEN dias BETWEEN 46 AND 75 THEN 1 ELSE 0 END) as d46_75,
        SUM(CASE WHEN dias > 75 THEN 1 ELSE 0 END) as mais75,
        COUNT(*) as total
      FROM (
        SELECT v.cliente, DATEDIFF(NOW(), MAX(v.data_criacao)) as dias
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
    `, [DATA_INICIO, DATA_FIM_EXCL]);

    console.log(`\nDISTRIBUIÇÃO DIAS SEM VIR (relativo ao FIM do período ${DATA_FIM_EXCL}):`);
    console.log(`  ≤20d: ${diasFim[0].ate20} | 21-30d: ${diasFim[0].d21_30} | 31-45d: ${diasFim[0].d31_45} | 46-75d: ${diasFim[0].d46_75} | >75d: ${diasFim[0].mais75} | total: ${diasFim[0].total}`);
    console.log(`DISTRIBUIÇÃO DIAS SEM VIR (relativo ao NOW):`);
    console.log(`  ≤20d: ${diasNow[0].ate20} | 21-30d: ${diasNow[0].d21_30} | 31-45d: ${diasNow[0].d31_45} | 46-75d: ${diasNow[0].d46_75} | >75d: ${diasNow[0].mais75} | total: ${diasNow[0].total}`);
    console.log(`\nReferência sistema: ≤20d=576 | 21-30d=130 | 31-45d=168 | 46-75d=196 | >75d=722 | total=1.792`);

    // DISTRIBUIÇÃO POR STATUS (cadência)
    const [statusRows] = await q(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN n_visitas = 1 AND dias_sem_vir <= 30 THEN 1 ELSE 0 END) as primeira_vez,
        SUM(CASE WHEN n_visitas = 1 AND dias_sem_vir > 30 AND dias_sem_vir <= 75 THEN 1 ELSE 0 END) as em_risco_1v,
        SUM(CASE WHEN n_visitas = 1 AND dias_sem_vir > 75 THEN 1 ELSE 0 END) as perdido_1v,
        SUM(CASE WHEN n_visitas >= 2 AND dias_sem_vir <= cadencia * 0.8 THEN 1 ELSE 0 END) as assiduo,
        SUM(CASE WHEN n_visitas >= 2 AND dias_sem_vir > cadencia * 0.8 AND dias_sem_vir <= cadencia * 1.2 THEN 1 ELSE 0 END) as regular,
        SUM(CASE WHEN n_visitas >= 2 AND dias_sem_vir > cadencia * 1.2 AND dias_sem_vir <= cadencia * 1.8 THEN 1 ELSE 0 END) as espacando,
        SUM(CASE WHEN n_visitas >= 2 AND dias_sem_vir > cadencia * 1.8 AND dias_sem_vir <= cadencia * 2.5 THEN 1 ELSE 0 END) as em_risco,
        SUM(CASE WHEN n_visitas >= 2 AND dias_sem_vir > cadencia * 2.5 THEN 1 ELSE 0 END) as perdido
      FROM (
        SELECT 
          v.cliente,
          COUNT(DISTINCT v.id) as n_visitas,
          DATEDIFF(?, MAX(v.data_criacao)) as dias_sem_vir,
          CASE 
            WHEN COUNT(DISTINCT v.id) > 1 
            THEN DATEDIFF(MAX(v.data_criacao), MIN(v.data_criacao)) / (COUNT(DISTINCT v.id) - 1)
            ELSE 30
          END as cadencia
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

    const s = statusRows[0];
    const perdidoTotal = Number(s.perdido_1v) + Number(s.perdido);
    const emRiscoTotal = Number(s.em_risco_1v) + Number(s.em_risco);
    console.log(`\nDISTRIBUIÇÃO POR STATUS (cadência, relativo ao FIM):`);
    console.log(`  Assíduo: ${s.assiduo} | Regular: ${s.regular} | Espaçando: ${s.espacando}`);
    console.log(`  Em Risco: ${emRiscoTotal} (${s.em_risco_1v} 1v + ${s.em_risco} 2v+)`);
    console.log(`  Perdido: ${perdidoTotal} (${s.perdido_1v} 1v + ${s.perdido} 2v+)`);
    console.log(`  1ª Vez (≤30d): ${s.primeira_vez}`);
    console.log(`  Total: ${s.total}`);
    console.log(`\nReferência sistema: Assíduo=712 | Regular=206 | Espaçando=136 | Em Risco=130 | Perdido=560 | 1ªVez=48`);

    // Verificar se os prints são de Joinville ou de outra unidade
    console.log(`\n=== CONCLUSÃO ===`);
    console.log(`A unidade Joinville (id=29) tem ${baseAtiva} clientes no período.`);
    console.log(`Os prints mostram ~1.792 clientes no total (soma dos dias sem vir).`);
    if (Math.abs(baseAtiva - 1792) < 200) {
      console.log(`✅ Joinville parece ser a unidade dos prints!`);
    } else {
      console.log(`❌ Joinville NÃO é a unidade dos prints (${baseAtiva} vs ~1.792).`);
      console.log(`   Os prints podem ser de outra unidade ou de uma versão diferente do sistema.`);
    }

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
