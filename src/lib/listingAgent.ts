// Listing agent — keeps the score board in step with kickoff-data's fixture
// list, through the SAME create/open/void path as the admin dashboard
// (lib/marketLifecycle), so the two can never disagree or duplicate: one live
// score market per fixture is enforced there and by a unique index.
//
// Each run (daily Vercel cron, or "Run listing agent now" in /admin):
//   1. every scheduled EPL fixture kicking off within the lookahead window
//      with no live market → create + open it with the house defaults;
//   2. every open/draft market whose fixture was postponed, or moved EARLIER
//      than the market's lock (a late lock would let people stake during the
//      match) → void it (refunds) or delete the draft; step 1 relists a moved
//      fixture in the same run. A match moved LATER keeps its market: it
//      simply locks before the new kickoff.
// Idempotent: a second run the same day finds nothing to do.

import { db, schema } from "@/db";
import { listFixtures, getFixture } from "@/lib/dataService";
import { logAdminEvent } from "@/lib/admin";
import { activeMarketForFixture, createMarket, openMarket, voidMarket } from "@/lib/marketLifecycle";
import { and, eq, inArray, isNotNull } from "drizzle-orm";

const ACTOR = "agent";

function envNumber(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** House defaults for agent-listed markets. Env-tunable, no deploy of code. */
function listingConfig() {
  return {
    lookaheadDays: envNumber("LISTING_LOOKAHEAD_DAYS", 8),
    /** Don't list what kicks off sooner than this: too little time to stake. */
    minLeadMinutes: envNumber("LISTING_MIN_LEAD_MINUTES", 60),
    fixedStakeUsdc: envNumber("LISTING_FIXED_STAKE_USDC", 10),
    takeRateBps: envNumber("LISTING_TAKE_RATE_BPS", 1000),
    gamma: envNumber("LISTING_GAMMA", 3),
    capMultiple: envNumber("LISTING_CAP_MULTIPLE", 100),
  };
}

export function listingEnabled(): boolean {
  return process.env.LISTING_AGENT_ENABLED !== "0" && process.env.LISTING_AGENT_ENABLED !== "false";
}

/** Admin drafts are the admin's to open (they may still be editing knobs). */
async function createdByAgent(marketId: number): Promise<boolean> {
  const [e] = await db
    .select({ actor: schema.adminEvents.actor })
    .from(schema.adminEvents)
    .where(and(eq(schema.adminEvents.marketId, marketId), eq(schema.adminEvents.action, "market.create")))
    .limit(1);
  return e?.actor === ACTOR;
}

export interface ListingReport {
  listed: { marketId: number; fixtureId: string; title: string }[];
  voided: { marketId: number; fixtureId: string; reason: string }[];
  deletedDrafts: { marketId: number; fixtureId: string; reason: string }[];
  skipped: number;
  errors: { fixtureId: string; error: string }[];
}

export async function runListingAgent(now = new Date()): Promise<ListingReport> {
  const cfg = listingConfig();
  const report: ListingReport = { listed: [], voided: [], deletedDrafts: [], skipped: 0, errors: [] };

  // --- 2 first: clear markets whose fixture moved/was postponed, so step 1
  // can relist the fixture in this same run. ---
  const live = await db
    .select()
    .from(schema.markets)
    .where(
      and(
        eq(schema.markets.kind, "scoreline"),
        inArray(schema.markets.status, ["draft", "open"]),
        isNotNull(schema.markets.dataFixtureId),
      ),
    );
  for (const m of live) {
    const fixtureId = m.dataFixtureId!;
    let reason: string | null = null;
    try {
      const f = (await getFixture(fixtureId)).data;
      const kickoff = new Date(f.kickoff_utc);
      if (f.status === "postponed" || f.status === "abandoned") reason = `fixture ${f.status}`;
      else if (kickoff.getTime() < m.locksAt.getTime())
        reason = `kickoff moved earlier (${f.kickoff_utc}), market would lock after the match started`;
    } catch (e) {
      report.errors.push({ fixtureId, error: `fixture check failed: ${(e as Error).message}` });
      continue;
    }
    if (!reason) continue;

    if (m.status === "draft") {
      // Nobody can have staked on a draft; its on-chain twin is inert.
      await db.delete(schema.markets).where(eq(schema.markets.id, m.id));
      await logAdminEvent(ACTOR, "market.delete", m.id, { title: m.title, reason });
      report.deletedDrafts.push({ marketId: m.id, fixtureId, reason });
    } else {
      const r = await voidMarket(m.id, reason, ACTOR);
      if (r.ok) report.voided.push({ marketId: m.id, fixtureId, reason });
      else report.errors.push({ fixtureId, error: `void #${m.id} failed: ${r.error}` });
    }
  }

  // --- 1: list what's missing. ---
  const to = new Date(now.getTime() + cfg.lookaheadDays * 24 * 3600_000);
  const fixtures = await listFixtures({
    league: "EPL",
    from: now.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  });
  const earliest = now.getTime() + cfg.minLeadMinutes * 60_000;

  for (const { data: f } of fixtures) {
    const kickoff = Date.parse(f.kickoff_utc);
    if (f.status !== "scheduled" || kickoff < earliest || kickoff > to.getTime()) {
      report.skipped++;
      continue;
    }

    const created = await createMarket(
      {
        kind: "scoreline",
        dataFixtureId: f.id,
        stakeMode: "fixed",
        fixedStake: String(Math.round(cfg.fixedStakeUsdc * 1_000_000)),
        takeRateBps: cfg.takeRateBps,
        gamma: cfg.gamma,
        capMultiple: cfg.capMultiple,
      },
      ACTOR,
    );
    let market;
    if (created.ok) {
      market = created.value;
    } else if (created.status === 409) {
      // Already listed (by the admin or a previous run): the normal case —
      // unless it's this agent's own draft whose open failed last time.
      const existing = await activeMarketForFixture(f.id, "scoreline");
      if (!existing || existing.status !== "draft" || !(await createdByAgent(existing.id))) {
        report.skipped++;
        continue;
      }
      market = existing;
    } else {
      report.errors.push({ fixtureId: f.id, error: created.error });
      continue;
    }

    const opened = await openMarket(market.id, ACTOR);
    if (!opened.ok) {
      // Stays a draft; the next run retries the open.
      report.errors.push({ fixtureId: f.id, error: `market #${market.id} created but open failed: ${opened.error}` });
      continue;
    }
    report.listed.push({ marketId: market.id, fixtureId: f.id, title: market.title });
  }

  await logAdminEvent(ACTOR, "listing.run", null, {
    listed: report.listed.length,
    voided: report.voided.length,
    deletedDrafts: report.deletedDrafts.length,
    skipped: report.skipped,
    errors: report.errors,
  });
  return report;
}
