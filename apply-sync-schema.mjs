/**
 * apply-sync-schema.mjs
 * Aplica as tabelas de replicação local no banco interno do VIP Suite.
 * Executar uma única vez: node apply-sync-schema.mjs
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const dotenv = require('dotenv');
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const mysql = require('mysql2/promise');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL não encontrada no ambiente');
  process.exit(1);
}

console.log('Conectando ao banco local via DATABASE_URL...');

// Parse DATABASE_URL: mysql://user:pass@host:port/dbname
const url = new URL(DATABASE_URL);
const conn = await mysql.createConnection({
  host: url.hostname,
  port: parseInt(url.port || '3306'),
  user: url.username,
  password: url.password,
  database: url.pathname.replace('/', ''),
  ssl: { rejectUnauthorized: false },
  multipleStatements: false, // executar um por um
});

console.log(`Conectado ao banco: ${url.hostname}:${url.port}${url.pathname}`);

// Ler o SQL e dividir em statements individuais
const sqlFile = readFileSync(join(__dirname, 'drizzle/sync-schema.sql'), 'utf8');
// Remove linhas de comentário de cada parte, depois filtra partes vazias
const statements = sqlFile
  .split(';')
  .map(s => {
    // Remove linhas que começam com -- (comentários SQL)
    return s.split('\n')
      .filter(line => {
        const t = line.trim();
        return t.length > 0 && t.substring(0, 2) !== '--';
      })
      .join('\n')
      .trim();
  })
  .filter(s => s.length > 0);

console.log(`Executando ${statements.length} statements...`);

let ok = 0;
let errors = 0;
for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    // Extrair nome da tabela para log
    const match = stmt.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
    if (match) console.log(`  ✓ Tabela ${match[1]} criada/verificada`);
    ok++;
  } catch (e) {
    console.error(`  ✗ Erro: ${e.message}`);
    console.error(`    SQL: ${stmt.substring(0, 100)}...`);
    errors++;
  }
}

await conn.end();
console.log(`\nConcluído: ${ok} OK, ${errors} erros`);
process.exit(errors > 0 ? 1 : 0);
