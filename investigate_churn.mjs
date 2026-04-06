/**
 * investigate_churn.mjs
 * Investiga a lógica correta para chegar nos números do sistema de referência:
 * Base Ativa ~999, Perdidos ~249, Churn ~20% (janela 60d, período 1/abr/2025–31/mar/2026)
 * Distribuição dias: ≤20d=576, 21-30d=130, 31-45d=168, 46-75d=196, >75d=722, total=1.792
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
const LOCAL_PORT = 13400;

const DATA_INICIO = "2025-04-01";
const DATA_FIM = "2026-03-31";
const DATA_FIM_EXCL = "2026-04-01";
const JANELA_DIAS = 60;
const EXT_ID = 1; // Brasil - SC - Florianópolis - Santa Mônica

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

    // Hipótese 1: "Base ativa" = clientes que visitaram nos últimos 12 meses antes do FIM do período
    // (janela de 12 meses = 365 dias)
    console.log("=== Hipótese 1: Base ativa = clientes que vieram nos últimos 365 dias antes do FIM ===");
    const [h1] = await q(`
      SELECT COUNT(DISTINCT v.cliente) as total
      FROM vendas v
      JOIN usuarios uu ON v.usuario = uu.id
      WHERE ${unitCond}
        AND v.data_criacao >= DATE_SUB(?, INTERVAL 365 DAY)
        AND v.data_criacao < ?
        AND v.comanda_temp = 0
        AND v.status != 0
        AND v.cliente IS NOT NULL
    `, [DATA_FIM_EXCL, DATA_FIM_EXCL]);
    console.log(`  Base ativa: ${h1.total}`);

    // Hipótese 2: "Base ativa" = clientes que visitaram nos últimos 12 meses com vp.colaborador
    console.log("\n=== Hipótese 2: Base ativa usando vp.colaborador (barbeiro) ===");
    const [h2] = await q(`
      SELECT COUNT(DISTINCT v.cliente) as total
      FROM vendas v
      JOIN usuarios uu ON v.usuario = uu.id
      JOIN vendas_produtos vp ON vp.venda = v.id
      WHERE ${unitCond}
        AND v.data_criacao >= ?
        AND v.data_criacao < ?
        AND v.comanda_temp = 0
        AND v.status != 0
        AND v.cliente IS NOT NULL
    `, [DATA_INICIO, DATA_FIM_EXCL]);
    console.log(`  Base ativa (com vp): ${h2.total}`);

    // Hipótese 3: O sistema de referência usa apenas clientes com pelo menos 2 visitas
    console.log("\n=== Hipótese 3: Clientes com pelo menos 2 visitas no período ===");
    const [h3] = await q(`
      SELECT COUNT(*) as total
      FROM (
        SELECT v.cliente, COUNT(DISTINCT v.id) as visitas
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitCond}
          AND v.data_criacao >= ?
          AND v.data_criacao < ?
          AND v.comanda_temp = 0
          AND v.status != 0
          AND v.cliente IS NOT NULL
        GROUP BY v.cliente
        HAVING visitas >= 2
      ) sub
    `, [DATA_INICIO, DATA_FIM_EXCL]);
    console.log(`  Clientes com 2+ visitas: ${h3.total}`);

    // Hipótese 4: O sistema usa uma janela de atividade diferente para "base ativa"
    // Base ativa = clientes que vieram pelo menos 1x nos últimos janelaDias*N antes do FIM
    for (const mult of [1, 1.5, 2, 2.5, 3, 4]) {
      const dias = Math.round(JANELA_DIAS * mult);
      const [row] = await q(`
        SELECT COUNT(DISTINCT v.cliente) as total
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitCond}
          AND v.data_criacao >= DATE_SUB(?, INTERVAL ${dias} DAY)
          AND v.data_criacao < ?
          AND v.comanda_temp = 0
          AND v.status != 0
          AND v.cliente IS NOT NULL
      `, [DATA_FIM_EXCL, DATA_FIM_EXCL]);
      console.log(`  Janela ${dias}d antes do FIM: ${row.total} clientes`);
    }

    // Hipótese 5: "Base ativa" = clientes ativos no início do período (12 meses antes do INÍCIO)
    console.log("\n=== Hipótese 5: Base ativa = clientes que vieram nos 12 meses antes do INÍCIO ===");
    const [h5] = await q(`
      SELECT COUNT(DISTINCT v.cliente) as total
      FROM vendas v
      JOIN usuarios uu ON v.usuario = uu.id
      WHERE ${unitCond}
        AND v.data_criacao >= DATE_SUB(?, INTERVAL 365 DAY)
        AND v.data_criacao < ?
        AND v.comanda_temp = 0
        AND v.status != 0
        AND v.cliente IS NOT NULL
    `, [DATA_INICIO, DATA_INICIO]);
    console.log(`  Base no início: ${h5.total}`);

    // Hipótese 6: Clientes únicos que tiveram EXATAMENTE 1 visita no período (1ª vez)
    console.log("\n=== Hipótese 6: Clientes com exatamente 1 visita no período ===");
    const [h6] = await q(`
      SELECT COUNT(*) as total
      FROM (
        SELECT v.cliente, COUNT(DISTINCT v.id) as visitas
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitCond}
          AND v.data_criacao >= ?
          AND v.data_criacao < ?
          AND v.comanda_temp = 0
          AND v.status != 0
          AND v.cliente IS NOT NULL
        GROUP BY v.cliente
        HAVING visitas = 1
      ) sub
    `, [DATA_INICIO, DATA_FIM_EXCL]);
    console.log(`  Clientes com 1 visita: ${h6.total}`);

    // Hipótese 7: O sistema de referência usa cadência individual
    // Base ativa = clientes cuja última visita foi dentro de (cadência * 2.5) dias
    // Cadência = intervalo médio entre visitas no período
    console.log("\n=== Hipótese 7: Churn baseado em cadência individual ===");
    const [h7] = await q(`
      SELECT 
        COUNT(*) as total_clientes,
        SUM(CASE WHEN dias_sem_vir <= cadencia * 2.5 THEN 1 ELSE 0 END) as ativos,
        SUM(CASE WHEN dias_sem_vir > cadencia * 2.5 THEN 1 ELSE 0 END) as perdidos
      FROM (
        SELECT 
          v.cliente,
          COUNT(DISTINCT v.id) as n_visitas,
          DATEDIFF(MAX(v.data_criacao), MIN(v.data_criacao)) as span_dias,
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
    console.log(`  Total: ${h7[0].total_clientes}, Ativos: ${h7[0].ativos}, Perdidos (cad*2.5): ${h7[0].perdidos}`);

    // Hipótese 8: Perdidos = clientes que vieram no período mas não voltaram após FIM do período
    // usando cadência * 1.8 como threshold
    const [h8] = await q(`
      SELECT 
        SUM(CASE WHEN dias_sem_vir > cadencia * 1.8 THEN 1 ELSE 0 END) as perdidos_18,
        SUM(CASE WHEN dias_sem_vir > cadencia * 2.0 THEN 1 ELSE 0 END) as perdidos_20,
        SUM(CASE WHEN dias_sem_vir > cadencia * 2.5 THEN 1 ELSE 0 END) as perdidos_25,
        SUM(CASE WHEN dias_sem_vir > cadencia * 3.0 THEN 1 ELSE 0 END) as perdidos_30
      FROM (
        SELECT 
          v.cliente,
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
    console.log(`\n=== Perdidos por múltiplo de cadência ===`);
    console.log(`  cad*1.8: ${h8[0].perdidos_18}`);
    console.log(`  cad*2.0: ${h8[0].perdidos_20}`);
    console.log(`  cad*2.5: ${h8[0].perdidos_25}`);
    console.log(`  cad*3.0: ${h8[0].perdidos_30}`);

    // Hipótese 9: O sistema usa apenas clientes com pelo menos 1 visita nos 12 meses ANTERIORES ao período
    // E conta como "perdidos" quem não voltou no período
    console.log("\n=== Hipótese 9: Base = clientes ativos nos 12m anteriores ao período ===");
    const [h9base] = await q(`
      SELECT COUNT(DISTINCT v.cliente) as total
      FROM vendas v
      JOIN usuarios uu ON v.usuario = uu.id
      WHERE ${unitCond}
        AND v.data_criacao >= DATE_SUB(?, INTERVAL 365 DAY)
        AND v.data_criacao < ?
        AND v.comanda_temp = 0
        AND v.status != 0
        AND v.cliente IS NOT NULL
    `, [DATA_INICIO, DATA_INICIO]);
    console.log(`  Base início: ${h9base.total}`);

    // Perdidos = quem estava na base início e não voltou no período
    const [h9perdidos] = await q(`
      SELECT COUNT(*) as total
      FROM (
        SELECT DISTINCT v.cliente
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE ${unitCond}
          AND v.data_criacao >= DATE_SUB(?, INTERVAL 365 DAY)
          AND v.data_criacao < ?
          AND v.comanda_temp = 0
          AND v.status != 0
          AND v.cliente IS NOT NULL
      ) base_inicio
      WHERE NOT EXISTS (
        SELECT 1 FROM vendas v2
        JOIN usuarios uu2 ON v2.usuario = uu2.id
        WHERE uu2.unidade = ${EXT_ID}
          AND v2.cliente = base_inicio.cliente
          AND v2.data_criacao >= ?
          AND v2.data_criacao < ?
          AND v2.comanda_temp = 0
          AND v2.status != 0
      )
    `, [DATA_INICIO, DATA_INICIO, DATA_INICIO, DATA_FIM_EXCL]);
    console.log(`  Perdidos (não voltaram no período): ${h9perdidos.total}`);
    const churnH9 = h9base.total > 0 ? (h9perdidos.total / h9base.total * 100).toFixed(1) : 0;
    console.log(`  Churn %: ${churnH9}%`);

    // Hipótese 10: Distribuição por dias sem vir usando NOW() em vez do FIM do período
    console.log("\n=== Distribuição dias sem vir com NOW() ===");
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
    console.log(`  ≤20d: ${diasNow[0].ate20} | 21-30d: ${diasNow[0].d21_30} | 31-45d: ${diasNow[0].d31_45} | 46-75d: ${diasNow[0].d46_75} | >75d: ${diasNow[0].mais75} | total: ${diasNow[0].total}`);
    console.log(`  Referência: 576 | 130 | 168 | 196 | 722 | 1.792`);

    // Hipótese 11: O sistema usa apenas clientes com cliente_tipo = 'recorrente' ou similar
    console.log("\n=== Verificar colunas da tabela clientes ===");
    const cols = await q("DESCRIBE clientes");
    console.log("  Colunas:", cols.map(c => c.Field).join(", "));

    // Hipótese 12: Verificar se há filtro por tipo de produto/serviço
    console.log("\n=== Verificar se vp.colaborador filtra corretamente ===");
    const [vpCheck] = await q(`
      SELECT COUNT(DISTINCT v.cliente) as total
      FROM vendas v
      JOIN usuarios uu ON v.usuario = uu.id
      JOIN vendas_produtos vp ON vp.venda = v.id
      WHERE uu.unidade = ${EXT_ID}
        AND v.data_criacao >= ?
        AND v.data_criacao < ?
        AND v.comanda_temp = 0
        AND v.status != 0
        AND v.cliente IS NOT NULL
        AND vp.colaborador IS NOT NULL
    `, [DATA_INICIO, DATA_FIM_EXCL]);
    console.log(`  Com vp.colaborador NOT NULL: ${vpCheck.total}`);

  } catch (err) {
    console.error("ERRO:", err.message, err.stack?.split('\n')[1]);
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
