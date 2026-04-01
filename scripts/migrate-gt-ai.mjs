import { createConnection } from 'mysql2/promise';

const statements = [
  // ── gt_processos: novas colunas ─────────────────────────────────────────
  "ALTER TABLE `gt_processos` ADD COLUMN `tipo` ENUM('principal', 'apoio') NOT NULL DEFAULT 'principal'",
  "ALTER TABLE `gt_processos` ADD COLUMN `area` VARCHAR(100)",
  "ALTER TABLE `gt_processos` ADD COLUMN `recursos` JSON",
  "ALTER TABLE `gt_processos` ADD COLUMN `metricas` JSON",
  "ALTER TABLE `gt_processos` ADD COLUMN `riscos_ia` JSON",
  "ALTER TABLE `gt_processos` ADD COLUMN `duracaoEstimada` VARCHAR(100)",
  "ALTER TABLE `gt_processos` ADD COLUMN `status` ENUM('ativo', 'inativo', 'em_revisao') NOT NULL DEFAULT 'ativo'",
  "ALTER TABLE `gt_processos` ADD COLUMN `geradoPorIA` INT NOT NULL DEFAULT 0",
  // Migrar campo ativo → status
  "UPDATE `gt_processos` SET `status` = CASE WHEN `ativo` = 1 THEN 'ativo' ELSE 'inativo' END",

  // ── gt_instrucoes: novas colunas ────────────────────────────────────────
  "ALTER TABLE `gt_instrucoes` ADD COLUMN `processoId` INT",
  "ALTER TABLE `gt_instrucoes` ADD COLUMN `plano` JSON",
  "ALTER TABLE `gt_instrucoes` ADD COLUMN `responsavelId` INT",
  "ALTER TABLE `gt_instrucoes` ADD COLUMN `responsavelNome` VARCHAR(255)",
  "ALTER TABLE `gt_instrucoes` ADD COLUMN `status` ENUM('pendente', 'em_andamento', 'concluida', 'pausada') NOT NULL DEFAULT 'pendente'",
  "ALTER TABLE `gt_instrucoes` ADD COLUMN `geradoPorIA` INT NOT NULL DEFAULT 0",
  // Migrar campo ativo → status
  "UPDATE `gt_instrucoes` SET `status` = CASE WHEN `ativo` = 1 THEN 'pendente' ELSE 'pausada' END",
];

const conn = await createConnection(process.env.DATABASE_URL);
for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    console.log('✅ OK:', stmt.substring(0, 90).replace(/\s+/g, ' '));
  } catch (e) {
    if (e.message.includes('Duplicate column') || e.message.includes('already exists')) {
      console.log('⚠️  SKIP (already exists):', stmt.substring(0, 60).replace(/\s+/g, ' '));
    } else {
      console.log('❌ ERR:', e.message);
      console.log('   SQL:', stmt.substring(0, 90).replace(/\s+/g, ' '));
    }
  }
}
await conn.end();
console.log('\n✅ Migration complete');
