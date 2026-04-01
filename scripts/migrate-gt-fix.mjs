import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL);

const statements = [
  // ── gt_processos: renomear riscos_ia → riscos ──────────────────────────
  // Verificar se riscos_ia existe e riscos não existe
  "ALTER TABLE `gt_processos` CHANGE COLUMN `riscos_ia` `riscos` JSON",

  // ── gt_instrucoes: verificar colunas faltantes ─────────────────────────
  // (já devem existir da migração anterior, mas garantir)
  "ALTER TABLE `gt_instrucoes` ADD COLUMN IF NOT EXISTS `processoId` INT",
  "ALTER TABLE `gt_instrucoes` ADD COLUMN IF NOT EXISTS `plano` JSON",
  "ALTER TABLE `gt_instrucoes` ADD COLUMN IF NOT EXISTS `responsavelId` INT",
  "ALTER TABLE `gt_instrucoes` ADD COLUMN IF NOT EXISTS `responsavelNome` VARCHAR(255)",
  "ALTER TABLE `gt_instrucoes` ADD COLUMN IF NOT EXISTS `geradoPorIA` INT NOT NULL DEFAULT 0",
];

for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    console.log('✅ OK:', stmt.substring(0, 90).replace(/\s+/g, ' '));
  } catch (e) {
    if (
      e.message.includes('Duplicate column') ||
      e.message.includes('already exists') ||
      e.message.includes("Can't DROP")
    ) {
      console.log('⚠️  SKIP:', stmt.substring(0, 70).replace(/\s+/g, ' '));
    } else {
      console.log('❌ ERR:', e.message);
      console.log('   SQL:', stmt.substring(0, 90).replace(/\s+/g, ' '));
    }
  }
}

// Verificar estado final
const [cols] = await conn.execute('DESCRIBE gt_processos');
console.log('\n📋 gt_processos colunas:');
cols.forEach(r => console.log(' -', r.Field, ':', r.Type));

await conn.end();
console.log('\n✅ Migration fix complete');
