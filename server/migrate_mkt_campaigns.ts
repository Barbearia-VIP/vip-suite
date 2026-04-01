import { getDb } from "./db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.error("DB unavailable"); process.exit(1); }

  const [rows] = await db.execute(sql`SHOW TABLES LIKE 'gt_marketing_campaigns'`) as any;
  if ((rows as any[]).length > 0) {
    console.log("Table gt_marketing_campaigns already exists.");
    process.exit(0);
  }

  console.log("Creating gt_marketing_campaigns...");
  await db.execute(sql`
    CREATE TABLE \`gt_marketing_campaigns\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`orgId\` int NOT NULL,
      \`unitId\` int,
      \`campaignName\` varchar(500) NOT NULL,
      \`status\` varchar(50) NOT NULL DEFAULT 'draft',
      \`version\` varchar(20) NOT NULL DEFAULT 'v1',
      \`wizardResponses\` json,
      \`internalDataUsed\` json,
      \`executiveSummary\` text,
      \`personas\` json,
      \`messages\` json,
      \`channelMix\` json,
      \`budgetSplit\` json,
      \`calendar90d\` json,
      \`contentIdeas\` json,
      \`adsKits\` json,
      \`crmFlows\` json,
      \`landingPage\` json,
      \`kpisTargets\` json,
      \`experimentsBacklog\` json,
      \`risksCompliance\` json,
      \`assumptions\` json,
      \`jsonBlob\` json,
      \`assignedToId\` int,
      \`assignedToName\` varchar(255),
      \`assignedAt\` timestamp NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`gt_marketing_campaigns_id\` PRIMARY KEY(\`id\`)
    )
  `);
  await db.execute(sql`CREATE INDEX \`idx_gt_mkt_camp_org\` ON \`gt_marketing_campaigns\` (\`orgId\`, \`status\`)`);
  console.log("Done.");
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
