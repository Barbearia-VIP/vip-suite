/**
 * investigate_units.mjs
 * Investiga a estrutura de unidades para encontrar o extId correto da unidade de teste
 * e entender por que os números são tão diferentes do sistema de referência.
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
const LOCAL_PORT = 13401;

const DATA_INICIO = "2025-04-01";
const DATA_FIM_EXCL = "2026-04-01";
const JANELA_DIAS = 60;

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

    // 1. Verificar estrutura da tabela unidades
    console.log("=== Estrutura da tabela unidades ===");
    const cols = await q("DESCRIBE unidades");
    console.log("  Colunas:", cols.map(c => `${c.Field}(${c.Type})`).join(", "));

    // 2. Verificar se há campo franquia ou empresa
    const allUnidades = await q("SELECT id, nome FROM unidades ORDER BY id LIMIT 50");
    console.log("\n=== Todas as unidades (primeiras 50) ===");
    allUnidades.forEach(u => console.log(`  id=${u.id} nome=${u.nome}`));

    // 3. Verificar quantos clientes únicos por unidade no período
    console.log("\n=== Clientes únicos por unidade no período ===");
    const clientesPorUnidade = await q(`
      SELECT uu.unidade, COUNT(DISTINCT v.cliente) as total
      FROM vendas v
      JOIN usuarios uu ON v.usuario = uu.id
      WHERE v.data_criacao >= ?
        AND v.data_criacao < ?
        AND v.comanda_temp = 0
        AND v.status != 0
        AND v.cliente IS NOT NULL
      GROUP BY uu.unidade
      ORDER BY total DESC
      LIMIT 20
    `, [DATA_INICIO, DATA_FIM_EXCL]);
    
    // Buscar nomes das unidades
    for (const row of clientesPorUnidade) {
      const [unidade] = await q("SELECT nome FROM unidades WHERE id = ?", [row.unidade]);
      console.log(`  unidade=${row.unidade} (${unidade?.nome || 'N/A'}): ${row.total} clientes`);
    }

    // 4. Verificar se a unidade de teste usa um ID diferente no sistema de referência
    // Procurar unidade com ~999 clientes no período
    console.log("\n=== Unidades com 800-1200 clientes no período ===");
    const targetUnidades = await q(`
      SELECT uu.unidade, COUNT(DISTINCT v.cliente) as total
      FROM vendas v
      JOIN usuarios uu ON v.usuario = uu.id
      WHERE v.data_criacao >= ?
        AND v.data_criacao < ?
        AND v.comanda_temp = 0
        AND v.status != 0
        AND v.cliente IS NOT NULL
      GROUP BY uu.unidade
      HAVING total BETWEEN 800 AND 1200
      ORDER BY total
    `, [DATA_INICIO, DATA_FIM_EXCL]);
    
    for (const row of targetUnidades) {
      const [unidade] = await q("SELECT nome FROM unidades WHERE id = ?", [row.unidade]);
      console.log(`  unidade=${row.unidade} (${unidade?.nome || 'N/A'}): ${row.total} clientes`);
    }

    // 5. Verificar se há campo empresa/franquia na tabela usuarios
    console.log("\n=== Estrutura da tabela usuarios ===");
    const userCols = await q("DESCRIBE usuarios");
    console.log("  Colunas:", userCols.map(c => c.Field).join(", "));

    // 6. Verificar se o sistema de referência usa empresa ao invés de unidade
    const empresaCols = userCols.filter(c => c.Field.includes('empresa') || c.Field.includes('franquia') || c.Field.includes('grupo'));
    if (empresaCols.length > 0) {
      console.log("\n=== Campos empresa/franquia/grupo em usuarios ===");
      empresaCols.forEach(c => console.log(`  ${c.Field}: ${c.Type}`));
      
      // Verificar clientes por empresa
      const empresaField = empresaCols[0].Field;
      const clientesPorEmpresa = await q(`
        SELECT uu.${empresaField}, COUNT(DISTINCT v.cliente) as total
        FROM vendas v
        JOIN usuarios uu ON v.usuario = uu.id
        WHERE v.data_criacao >= ?
          AND v.data_criacao < ?
          AND v.comanda_temp = 0
          AND v.status != 0
          AND v.cliente IS NOT NULL
        GROUP BY uu.${empresaField}
        HAVING total BETWEEN 800 AND 1200
        ORDER BY total
        LIMIT 10
      `, [DATA_INICIO, DATA_FIM_EXCL]);
      console.log(`\n  Empresas com 800-1200 clientes:`, clientesPorEmpresa);
    }

    // 7. Verificar como o sistema resolve o extId para a unidade selecionada no frontend
    // Buscar a tabela de mapeamento unidades <-> extIds
    console.log("\n=== Verificar tabela de mapeamento ===");
    const tables = await q("SHOW TABLES");
    const tableNames = tables.map(t => Object.values(t)[0]);
    console.log("  Tabelas disponíveis:", tableNames.join(", "));

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
