import { getDb } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.log("No DB"); return; }

  const rows = await db.execute(sql`
    SELECT id, unit_id, plataforma, external_id, google_place_id, 
           CASE WHEN google_api_key IS NOT NULL THEN 'SET' ELSE 'NULL' END as api_key_status,
           CASE WHEN google_client_id IS NOT NULL THEN 'SET' ELSE 'NULL' END as client_id_status,
           nome, nota_media, total_avaliacoes, ultima_sincronizacao 
    FROM rep_conexoes
  `);
  console.log("rep_conexoes:", JSON.stringify(rows[0], null, 2));

  const avals = await db.execute(sql`SELECT COUNT(*) as total FROM rep_avaliacoes`);
  console.log("rep_avaliacoes count:", JSON.stringify(avals[0], null, 2));

  const resumo = await db.execute(sql`SELECT * FROM rep_resumo_unidade LIMIT 5`);
  console.log("rep_resumo_unidade:", JSON.stringify(resumo[0], null, 2));
}
main().catch(console.error);
