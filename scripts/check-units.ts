import { getDb } from "../server/db";

async function main() {
  const db = await getDb();
  if (!db) {
    console.log("no db");
    process.exit(1);
  }
  const [rows] = await db.execute("SELECT id, name, slug FROM units LIMIT 20");
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

main().catch(console.error);
