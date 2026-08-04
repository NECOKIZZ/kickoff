// One-shot backfill: fill markets.gameweek for score markets created before
// the column existed. Resolves each from kickoffAt via kickoff-data gameweek
// deadlines (same rule as market creation). Safe to re-run — only touches
// rows where gameweek is null.
//
//   set -a; source .env.local; set +a; pnpm tsx scripts/backfill-gameweeks.ts

import { db, schema } from "../src/db";
import { resolveGameweek } from "../src/lib/gameweek";
import { and, eq, isNull } from "drizzle-orm";

async function main() {
  const rows = await db
    .select({ id: schema.markets.id, title: schema.markets.title, kickoffAt: schema.markets.kickoffAt })
    .from(schema.markets)
    .where(and(eq(schema.markets.kind, "scoreline"), isNull(schema.markets.gameweek)));

  if (rows.length === 0) {
    console.log("nothing to backfill — all score markets have a gameweek");
    return;
  }

  let filled = 0;
  const unresolved: number[] = [];
  for (const r of rows) {
    const gw = await resolveGameweek(r.kickoffAt);
    if (gw === null) {
      unresolved.push(r.id);
      continue;
    }
    await db.update(schema.markets).set({ gameweek: gw }).where(eq(schema.markets.id, r.id));
    console.log(`#${r.id} "${r.title}" → GW${gw}`);
    filled++;
  }

  console.log(`done: ${filled}/${rows.length} filled`);
  if (unresolved.length) console.log(`unresolved (left null): ${unresolved.join(", ")}`);
}

main().then(() => process.exit(0));
