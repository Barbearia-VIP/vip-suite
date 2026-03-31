import { getDb } from "../server/db";

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("No DB connection");
    process.exit(1);
  }

  console.log("1. Applying migration: adding googleClientId and googleClientSecret...");
  try {
    await db.execute("ALTER TABLE `rep_conexoes` ADD `googleClientId` varchar(512)");
    console.log("   ✓ googleClientId added");
  } catch (e: any) {
    if (e.message?.includes("Duplicate column")) {
      console.log("   ✓ googleClientId already exists");
    } else throw e;
  }

  try {
    await db.execute("ALTER TABLE `rep_conexoes` ADD `googleClientSecret` varchar(512)");
    console.log("   ✓ googleClientSecret added");
  } catch (e: any) {
    if (e.message?.includes("Duplicate column")) {
      console.log("   ✓ googleClientSecret already exists");
    } else throw e;
  }

  console.log("\n2. Pre-registering Google connection for unit 1 (Florianópolis - Santa Mônica)...");

  // Check if already exists
  const [existing] = await db.execute(
    "SELECT id FROM rep_conexoes WHERE unitId = 1 AND plataforma = 'google' LIMIT 1"
  ) as any;

  const clientId = "59770064530-ign191d873fqbn0f6g81if3edquqela2.apps.googleusercontent.com";
  const clientSecret = "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";
  const placeId = "ChIJ-TBxZ_s4J5URaJQWJ2zfqRA";

  if (existing.length > 0) {
    const id = existing[0].id;
    await db.execute(
      `UPDATE rep_conexoes SET
        googleClientId = ?,
        googleClientSecret = ?,
        googlePlaceId = ?,
        externalId = ?,
        nome = 'Florianópolis - Santa Mônica',
        isAtivo = 1,
        updatedAt = NOW()
       WHERE id = ?`,
      [clientId, clientSecret, placeId, placeId, id]
    );
    console.log(`   ✓ Updated existing connection (id=${id})`);
  } else {
    await db.execute(
      `INSERT INTO rep_conexoes
        (unitId, plataforma, externalId, nome, googleClientId, googleClientSecret, googlePlaceId, isAtivo, createdAt, updatedAt)
       VALUES
        (1, 'google', ?, 'Florianópolis - Santa Mônica', ?, ?, ?, 1, NOW(), NOW())`,
      [placeId, clientId, clientSecret, placeId]
    );
    console.log("   ✓ Created new Google connection for Santa Mônica");
  }

  // Verify
  const [verify] = await db.execute(
    "SELECT id, unitId, plataforma, nome, googlePlaceId, googleClientId FROM rep_conexoes WHERE unitId = 1 AND plataforma = 'google'"
  ) as any;
  console.log("\n3. Verification:");
  console.log(JSON.stringify(verify[0], null, 2));

  console.log("\n✅ Done!");
  process.exit(0);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
