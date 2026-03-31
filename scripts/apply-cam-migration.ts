import { getDb } from '../server/db';
import { sql } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { join } from 'path';

const db = await getDb();
if (!db) { console.error('No DB connection'); process.exit(1); }

const sqlContent = readFileSync(join(process.cwd(), 'drizzle/0004_bitter_kitty_pryde.sql'), 'utf8');
const statements = sqlContent.split('--> statement-breakpoint').map((s: string) => s.trim()).filter(Boolean);

console.log(`Applying ${statements.length} statements...`);
let ok = 0, skip = 0;
for (const stmt of statements) {
  try {
    await db.execute(sql.raw(stmt));
    ok++;
    console.log(`✓ ${stmt.slice(0, 70)}`);
  } catch (e: any) {
    const msg = e.message || '';
    if (msg.includes('Duplicate') || msg.includes('already exists') || msg.includes('Duplicate column') || msg.includes('Multiple primary key')) {
      skip++;
      console.log(`~ SKIP: ${stmt.slice(0, 70)}`);
    } else {
      console.error(`✗ ERROR: ${msg}\n  SQL: ${stmt.slice(0, 80)}`);
    }
  }
}
console.log(`\nDone: ${ok} applied, ${skip} skipped`);
process.exit(0);
