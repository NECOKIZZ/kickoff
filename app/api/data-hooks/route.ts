import { createHmac, timingSafeEqual } from "node:crypto";
import { db, schema } from "@/db";
import { json, jsonError } from "@/lib/http";
import { logAdminEvent } from "@/lib/admin";
import { getFixture, getSettlement } from "@/lib/dataService";
import { executeSettlement } from "@/lib/settleExecution";
import { and, eq, inArray } from "drizzle-orm";

/**
 * POST /api/data-hooks — kickoff-data webhook receiver.
 *
 * Events: settlement.ready | settlement.disputed | fixture.status_changed.
 * Auth: HMAC-SHA256 of the EXACT body bytes in x-kickoff-signature
 * (KICKOFF_DATA_WEBHOOK_SECRET — same env both processes read).
 *
 * settlement.ready → fetch the FROZEN snapshot by (fixture_id, version) and
 * auto-settle every linked scoreline market. The snapshot is re-fetched from
 * /v1 rather than trusted from the webhook body: the webhook is a doorbell,
 * the API is the source of truth. player_points markets stay admin-settled
 * for now (Market B auto-settle needs the scoring cross-check lane).
 *
 * Delivery is at-least-once; dedup = executeSettlement's own status guard
 * (an already-settled market returns 409 internally and we report it as
 * skipped). ALWAYS 200 on handled events — a non-2xx would make the service
 * retry a delivery that already did its work.
 */
export async function POST(req: Request) {
  const secret = process.env.KICKOFF_DATA_WEBHOOK_SECRET;
  if (!secret) return jsonError("webhook receiver not configured", 503);

  const body = await req.text();
  const signature = req.headers.get("x-kickoff-signature") ?? "";
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return jsonError("bad signature", 401);

  let event: { type?: string; fixture_id?: string; snapshot_version?: number; from?: string; to?: string };
  try {
    event = JSON.parse(body);
  } catch {
    return jsonError("invalid JSON body", 400);
  }
  if (!event.type || !event.fixture_id) return jsonError("missing type/fixture_id", 400);

  switch (event.type) {
    case "settlement.ready":
      return handleSettlementReady(event.fixture_id, event.snapshot_version);

    case "settlement.disputed":
      // Surface loudly in the admin audit log; humans take it from here.
      await logAdminEvent("kickoff-data", "settlement.disputed", null, { fixtureId: event.fixture_id });
      console.error(`[data-hooks] settlement DISPUTED for ${event.fixture_id} — admin decision needed`);
      return json({ ok: true, action: "logged-disputed" });

    case "fixture.status_changed":
      // Postponed/abandoned fixtures need the admin void flow; log for now.
      if (event.to === "postponed" || event.to === "abandoned") {
        await logAdminEvent("kickoff-data", "fixture.status_changed", null, {
          fixtureId: event.fixture_id,
          from: event.from,
          to: event.to,
        });
      }
      return json({ ok: true, action: "noted" });

    default:
      return json({ ok: true, action: "ignored-unknown-type" });
  }
}

async function handleSettlementReady(fixtureId: string, snapshotVersion: number | undefined) {
  // Doorbell → source of truth: fetch snapshot + fixture from /v1.
  const settlement = await getSettlement(fixtureId);
  if (!settlement.frozen) {
    // Ready webhook but no frozen snapshot = a superseding correction is in
    // flight. Do nothing; the next settlement.ready will carry it.
    return json({ ok: true, action: "snapshot-not-frozen-yet" });
  }
  const snapshot = settlement.snapshot;
  if (snapshotVersion !== undefined && snapshot.version !== snapshotVersion) {
    // Stale doorbell for an old version — the newer snapshot governs.
    return json({ ok: true, action: "superseded", currentVersion: snapshot.version });
  }

  // Canonical fixture id → S1 numeric id, which is what markets link on.
  const fixture = await getFixture(fixtureId);
  const s1Id = fixture.data.source_refs.apiFootball;
  if (s1Id === undefined) {
    await logAdminEvent("kickoff-data", "settlement.unlinkable", null, { fixtureId });
    return json({ ok: true, action: "no-s1-ref-cannot-link" });
  }

  const markets = await db
    .select()
    .from(schema.markets)
    .where(
      and(
        eq(schema.markets.fixtureId, s1Id),
        eq(schema.markets.kind, "scoreline"),
        inArray(schema.markets.status, ["open", "locked", "settling"]),
      ),
    );

  const results: Array<{ marketId: number; ok: boolean; error?: string }> = [];
  for (const m of markets) {
    const r = await executeSettlement(m, snapshot.outcome, "kickoff-data", {
      fixtureId,
      snapshotVersion: snapshot.version,
      quorumRule: snapshot.quorum_rule,
    });
    results.push({ marketId: m.id, ok: r.ok, ...(r.error ? { error: r.error } : {}) });
    if (!r.ok) console.error(`[data-hooks] settle market ${m.id} failed: ${r.error}`);
  }

  return json({ ok: true, action: "settled", snapshotVersion: snapshot.version, results });
}
