/**
 * Migration: Adiciona coluna dataVipRef e índice único na tabela gt_financeiro
 * Executar com: npx tsx server/migrate_datavip_financeiro.ts
 */
import { getDb } from "./db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.error("DB unavailable"); process.exit(1); }

  // Verifica se a coluna já existe
  const [cols] = await db.execute(sql`SHOW COLUMNS FROM gt_financeiro LIKE 'dataVipRef'`) as any;
  const exists = (cols as any[]).length > 0;

  if (!exists) {
    console.log("Adding dataVipRef column...");
    await db.execute(sql`
      ALTER TABLE gt_financeiro
      ADD COLUMN dataVipRef VARCHAR(100) NULL
      COMMENT 'Chave de deduplicação: datavip:{unitId}:{YYYY-MM-DD}'
    `);
    console.log("Column added.");
  } else {
    console.log("Column dataVipRef already exists.");
  }

  // Verifica se o índice único já existe
  const [idx] = await db.execute(sql`
    SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'gt_financeiro'
      AND INDEX_NAME = 'uq_datavip_ref'
    LIMIT 1
  `) as any;
  const idxExists = (idx as any[]).length > 0;

  if (!idxExists) {
    console.log("Creating unique index uq_datavip_ref...");
    await db.execute(sql`
      CREATE UNIQUE INDEX uq_datavip_ref ON gt_financeiro (dataVipRef)
    `);
    console.log("Index created.");
  } else {
    console.log("Index uq_datavip_ref already exists.");
  }

  console.log("Migration complete.");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
