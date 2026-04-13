/**
 * Re-sincroniza o faturamento do Gestão Total (gt_financeiro) para todas as unidades
 * usando o novo padrão: sync_vendas.valor_total
 * Período: abril/2026 completo
 */
import { syncGtFinanceiro } from "./server/vipDataSync";
import { getDb } from "./server/db";
import { sql } from "drizzle-orm";

const INICIO = "2026-04-01";
const FIM = "2026-04-30";

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Buscar todas as unidades com externalId
  const [rows] = await db.execute(sql`
    SELECT u.id as unitId, u.orgId, o.name as orgNome, u.name as unitNome, u.externalId
    FROM units u
    JOIN organizations o ON o.id = u.orgId
    WHERE u.externalId IS NOT NULL AND o.active = 1
    ORDER BY o.name, u.name
  `) as any;

  const units = rows as any[];
  console.log(`\n=== Re-sync GT Financeiro — ${INICIO} a ${FIM} ===`);
  console.log(`Total de unidades: ${units.length}\n`);

  let ok = 0;
  let erros = 0;

  for (const unit of units) {
    try {
      process.stdout.write(`[${ok + erros + 1}/${units.length}] ${unit.orgNome} — ${unit.unitNome}... `);
      await syncGtFinanceiro(unit.orgId, unit.unitId, INICIO, FIM);
      console.log("✓");
      ok++;
    } catch (e: any) {
      console.log(`✗ ${e.message}`);
      erros++;
    }
  }

  console.log(`\n=== CONCLUÍDO: ${ok} OK, ${erros} erros ===\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error("ERRO FATAL:", e);
  process.exit(1);
});
