import mysql from "mysql2/promise";

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error("DATABASE_URL not set");

const conn = await mysql.createConnection(dbUrl);

await conn.execute(`
  CREATE TABLE IF NOT EXISTS \`servico_categorias\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`orgId\` int NOT NULL,
    \`nomeServico\` varchar(255) NOT NULL,
    \`categoria\` enum('base','extra') NOT NULL DEFAULT 'extra',
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`servico_categorias_id\` PRIMARY KEY(\`id\`)
  )
`);

try {
  await conn.execute(`CREATE INDEX \`idx_servico_categorias_org\` ON \`servico_categorias\` (\`orgId\`)`);
} catch(e: any) { if (!e.message.includes('Duplicate key name')) throw e; }

try {
  await conn.execute(`CREATE UNIQUE INDEX \`idx_servico_categorias_org_nome\` ON \`servico_categorias\` (\`orgId\`, \`nomeServico\`)`);
} catch(e: any) { if (!e.message.includes('Duplicate key name')) throw e; }

console.log("✅ Tabela servico_categorias criada!");
await conn.end();
process.exit(0);
