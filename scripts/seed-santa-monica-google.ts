import { eq, and } from "drizzle-orm";
import { getDb } from "../server/db";
import { repConexoes } from "../drizzle/schema";

const UNIT_ID = 1; // Florianópolis - Santa Mônica
const CLIENT_ID = "59770064530-ign191d873fqbn0f6g81if3edquqela2.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const PLACE_ID = "ChIJ-TBxZ_s4J5URaJQWJ2zfqRA";

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("❌ No DB connection");
    process.exit(1);
  }

  console.log("🔍 Checking existing Google connection for Santa Mônica (unit_id=1)...");

  const existing = await db
    .select()
    .from(repConexoes)
    .where(and(eq(repConexoes.unitId, UNIT_ID), eq(repConexoes.plataforma, "google")))
    .limit(1);

  if (existing.length > 0) {
    console.log(`📝 Updating existing connection (id=${existing[0].id})...`);
    await db
      .update(repConexoes)
      .set({
        googleClientId: CLIENT_ID,
        googleClientSecret: CLIENT_SECRET,
        googlePlaceId: PLACE_ID,
        externalId: PLACE_ID,
        nome: "Florianópolis - Santa Mônica",
        isAtivo: true,
      })
      .where(eq(repConexoes.id, existing[0].id));
    console.log("✅ Updated successfully!");
  } else {
    console.log("➕ Creating new Google connection for Santa Mônica...");
    await db.insert(repConexoes).values({
      unitId: UNIT_ID,
      plataforma: "google",
      externalId: PLACE_ID,
      nome: "Florianópolis - Santa Mônica",
      googleClientId: CLIENT_ID,
      googleClientSecret: CLIENT_SECRET,
      googlePlaceId: PLACE_ID,
      isAtivo: true,
    });
    console.log("✅ Created successfully!");
  }

  // Verify
  const result = await db
    .select({
      id: repConexoes.id,
      unitId: repConexoes.unitId,
      plataforma: repConexoes.plataforma,
      nome: repConexoes.nome,
      googlePlaceId: repConexoes.googlePlaceId,
      googleClientId: repConexoes.googleClientId,
    })
    .from(repConexoes)
    .where(and(eq(repConexoes.unitId, UNIT_ID), eq(repConexoes.plataforma, "google")));

  console.log("\n📋 Verification:");
  console.log(JSON.stringify(result[0], null, 2));
  console.log("\n✅ Done! Santa Mônica Google credentials are configured.");
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
