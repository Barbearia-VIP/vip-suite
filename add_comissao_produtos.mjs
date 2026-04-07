import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await mysql.createConnection(url);

try {
  // Verificar se a coluna já existe
  const [cols] = await conn.execute(`SHOW COLUMNS FROM regras_comissao LIKE 'pctComissaoProdutos'`);
  if (cols.length > 0) {
    console.log("Coluna pctComissaoProdutos já existe.");
  } else {
    await conn.execute(`ALTER TABLE regras_comissao ADD COLUMN pctComissaoProdutos DECIMAL(5,2) NOT NULL DEFAULT 0`);
    console.log("✓ Coluna pctComissaoProdutos adicionada com sucesso.");
  }

  // Verificar estrutura atual
  const [structure] = await conn.execute(`DESCRIBE regras_comissao`);
  console.log("Estrutura atual da tabela regras_comissao:");
  console.table(structure);

  // Verificar dados existentes
  const [rows] = await conn.execute(`SELECT * FROM regras_comissao LIMIT 10`);
  console.log("Dados existentes:");
  console.table(rows);
} catch (err) {
  console.error("Erro:", err.message);
  // Tabela pode não existir ainda — criar
  if (err.code === "ER_NO_SUCH_TABLE") {
    console.log("Tabela não existe, criando...");
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS regras_comissao (
        id INT AUTO_INCREMENT PRIMARY KEY,
        orgId INT NOT NULL,
        colaboradorId VARCHAR(100) NOT NULL,
        percentual DECIMAL(5,2) NOT NULL DEFAULT 0,
        pctComissaoProdutos DECIMAL(5,2) NOT NULL DEFAULT 0,
        ativo TINYINT(1) NOT NULL DEFAULT 1,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_regras_comissao (orgId, colaboradorId)
      )
    `);
    console.log("✓ Tabela regras_comissao criada com sucesso.");
  }
}

await conn.end();
