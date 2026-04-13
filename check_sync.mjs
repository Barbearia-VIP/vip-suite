import mysql from 'mysql2/promise';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '.env') });

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Verificar estrutura da tabela
  const [cols] = await conn.execute('DESCRIBE sync_vendas');
  console.log('Colunas sync_vendas:', cols.map(c => c.Field).join(', '));
  
  // Verificar primeiras linhas
  const [sample] = await conn.execute('SELECT * FROM sync_vendas LIMIT 1');
  console.log('Sample sync_vendas:', JSON.stringify(sample[0]));
  
  // Verificar mapeamento de unidade no banco local
  const [units] = await conn.execute('SELECT id, name, externalId, orgId FROM units WHERE externalId IS NOT NULL LIMIT 10');
  console.log('Units com externalId:', JSON.stringify(units));
  
  // Verificar qual externalId corresponde à unidade 1 do sistema
  const [unit1] = await conn.execute('SELECT id, name, externalId, orgId FROM units WHERE id = 1');
  console.log('Unit id=1:', JSON.stringify(unit1));
  
  await conn.end();
}
main().catch(console.error);
