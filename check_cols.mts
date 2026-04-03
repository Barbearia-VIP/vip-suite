import mysql from "mysql2/promise";
const conn = await mysql.createConnection({ host: "127.0.0.1", port: 13307, user: process.env.DB_EXT_USER, password: process.env.DB_EXT_PASS, database: process.env.DB_EXT_NAME });
const [cols] = await conn.execute(`DESCRIBE vendas_produtos`);
console.log(JSON.stringify(cols, null, 2));
await conn.end(); process.exit(0);
