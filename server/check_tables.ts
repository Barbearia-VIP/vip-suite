import { getDb } from "./db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.log("No DB"); return; }

  const tables = [
    "vendas", "vendas_api_raw", "gt_tarefas", "gt_problemas", "gt_reunioes",
    "gt_financeiro", "cam_sentiment_timeline", "cam_clientes",
    "rep_avaliacoes", "avaliacoes", "instagram_metricas", "whatsapp_campanhas"
  ];

  for (const t of tables) {
    try {
      const [row] = await db.execute(sql.raw(`SELECT COUNT(*) as cnt FROM \`${t}\``)) as any;
      console.log(`${t}: ${row?.[0]?.cnt ?? row?.cnt ?? JSON.stringify(row)}`);
    } catch (e: any) {
      console.log(`${t}: ERROR - ${e.message?.slice(0, 60)}`);
    }
  }
  process.exit(0);
}
main();
