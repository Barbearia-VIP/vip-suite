import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = `
CREATE TABLE IF NOT EXISTS \`gt_image_bank\` (
  \`id\` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  \`org_id\` int NOT NULL,
  \`url\` text NOT NULL,
  \`file_key\` text NOT NULL,
  \`nome\` varchar(255),
  \`descricao\` text,
  \`tags\` text,
  \`criado_em\` timestamp NOT NULL DEFAULT (now())
);
`;

const indexSql = `
CREATE INDEX \`idx_image_bank_org\` ON \`gt_image_bank\` (\`org_id\`);
`;

const conn = await mysql.createConnection(databaseUrl);
try {
  console.log("Creating gt_image_bank table...");
  await conn.execute(sql);
  console.log("Table created successfully.");
  try {
    await conn.execute(indexSql);
    console.log("Index created successfully.");
  } catch (e) {
    console.log("Index may already exist:", e.message);
  }
} catch (e) {
  console.error("Error:", e.message);
} finally {
  await conn.end();
}
