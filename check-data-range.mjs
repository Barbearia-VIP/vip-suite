import { Client } from "ssh2";
import { createConnection } from "mysql2/promise";
import { config } from "dotenv";

config({ path: "/home/ubuntu/vip-suite/.env" });

const tunnelConfig = {
  host: process.env.SSH_TUNNEL_HOST,
  port: parseInt(process.env.SSH_TUNNEL_PORT || "22"),
  username: process.env.SSH_TUNNEL_USER,
  password: process.env.SSH_TUNNEL_PASS,
};

const dbConfig = {
  host: process.env.DB_EXT_HOST,
  port: parseInt(process.env.DB_EXT_PORT || "3306"),
  user: process.env.DB_EXT_USER,
  password: process.env.DB_EXT_PASS,
  database: process.env.DB_EXT_NAME,
};

console.log("Conectando ao túnel SSH...");

const ssh = new Client();

await new Promise((resolve, reject) => {
  ssh.on("ready", () => {
    ssh.forwardOut("127.0.0.1", 0, dbConfig.host, dbConfig.port, async (err, stream) => {
      if (err) return reject(err);

      const conn = await createConnection({
        ...dbConfig,
        host: undefined,
        stream,
        connectTimeout: 30000,
      });

      console.log("Conectado ao banco externo. Verificando datas...\n");

      // Data mais antiga em vendas
      const [rows1] = await conn.execute(
        "SELECT MIN(data_criacao) as mais_antiga, MAX(data_criacao) as mais_recente, COUNT(*) as total FROM vendas"
      );
      console.log("=== VENDAS ===");
      const v = rows1[0];
      console.log(`Total: ${v.total}`);
      console.log(`Mais antiga: ${v.mais_antiga}`);
      console.log(`Mais recente: ${v.mais_recente}`);

      // Unidades disponíveis com contagem e range de datas
      const [rows3] = await conn.execute(
        `SELECT uu.unidade, COUNT(DISTINCT vp.id) as total_vp, COUNT(DISTINCT v.id) as total_vendas,
                MIN(v.data_criacao) as inicio, MAX(v.data_criacao) as fim
         FROM vendas_produtos vp
         JOIN vendas v ON v.id = vp.venda
         JOIN usuarios uu ON uu.id = vp.colaborador
         GROUP BY uu.unidade ORDER BY uu.unidade`
      );
      console.log("\n=== DADOS POR UNIDADE ===");
      for (const r of rows3) {
        const ini = r.inicio ? new Date(r.inicio).toISOString().slice(0,7) : "?";
        const fim = r.fim ? new Date(r.fim).toISOString().slice(0,7) : "?";
        console.log(`Unidade ${r.unidade}: ${r.total_vendas} vendas, ${r.total_vp} itens | ${ini} → ${fim}`);
      }

      await conn.end();
      ssh.end();
      resolve();
    });
  });
  ssh.on("error", reject);
  ssh.connect(tunnelConfig);
});
