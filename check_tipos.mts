// Consulta direta via mysql2 na porta do tunnel já aberto pelo servidor
import mysql from "mysql2/promise";

const conn = await mysql.createConnection({
  host: "127.0.0.1",
  port: 13307,
  user: process.env.DB_EXT_USER || "root",
  password: process.env.DB_EXT_PASS || "",
  database: process.env.DB_EXT_NAME || "franquia_producao",
});

const [rows] = await conn.execute(`
  SELECT p.tipo, COUNT(*) as qtd, 
         GROUP_CONCAT(DISTINCT p.nome ORDER BY p.nome SEPARATOR ' | ') as exemplos
  FROM produtos p
  JOIN vendas_produtos vp ON vp.produto = p.id
  JOIN vendas v ON v.id = vp.venda
  JOIN usuarios uu ON v.usuario = uu.id
  WHERE uu.unidade = 1
    AND v.data_criacao >= '2026-04-01'
    AND v.data_criacao < '2026-05-01'
    AND v.comanda_temp = 0
    AND v.status != 0
  GROUP BY p.tipo
  ORDER BY qtd DESC
`);

console.log(JSON.stringify(rows, null, 2));
await conn.end();
process.exit(0);
