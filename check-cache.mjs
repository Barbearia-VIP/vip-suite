import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await mysql.createConnection(DB_URL);

const [rows1] = await conn.execute("SELECT unitId, mesRef, syncedAt FROM raio_x_cache_routing ORDER BY mesRef DESC LIMIT 15");
console.log("=== raio_x_cache_routing ===");
console.table(rows1);

const [rows2] = await conn.execute("SELECT unitId, mesRef, syncedAt FROM raio_x_cache_visao_geral ORDER BY mesRef DESC LIMIT 10");
console.log("=== raio_x_cache_visao_geral ===");
console.table(rows2);

const [rows3] = await conn.execute("SELECT id, name, externalId FROM units WHERE externalId IS NOT NULL LIMIT 20");
console.log("=== units ===");
console.table(rows3);

await conn.end();
