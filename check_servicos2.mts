import mysql from "mysql2/promise";
const conn = await mysql.createConnection({ host: "127.0.0.1", port: 13307, user: process.env.DB_EXT_USER, password: process.env.DB_EXT_PASS, database: process.env.DB_EXT_NAME });

const [rows] = await conn.execute(`
  SELECT p.nome, p.categoria, COUNT(*) as qtd, SUM(vp.valor_total) as total_valor
  FROM produtos p
  JOIN vendas_produtos vp ON vp.produto = p.id
  JOIN vendas v ON v.id = vp.venda
  JOIN usuarios uu ON v.usuario = uu.id
  WHERE uu.unidade = 1
    AND p.tipo = 'ser'
    AND v.data_criacao >= '2026-04-01'
    AND v.data_criacao < '2026-05-01'
    AND v.comanda_temp = 0
    AND v.status != 0
  GROUP BY p.nome, p.categoria
  ORDER BY qtd DESC
`);

console.log(JSON.stringify(rows, null, 2));
await conn.end(); process.exit(0);
