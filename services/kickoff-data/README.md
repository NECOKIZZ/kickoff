# kickoff-data

Standalone data-truth service for Kickoff.cash. Owns ALL football data;
the markets app makes zero direct football-API calls and consumes this
service over HTTP only (`/v1`) plus signed webhooks.

Spec: `~/Kickoff.cash/kickoff-data-source-spec.md` · Builder brief:
`~/Kickoff.cash/kickoff-data-service-builder-brief.md`

## Run

```bash
export PATH=~/.local/bin:$PATH        # pnpm (box resets → ./dev-setup.sh at repo root)
pnpm worker                           # the only long-running ingest process
pnpm api                              # /v1 consumer API (default :8787)
pnpm test                             # vitest (all pure parts run offline)
pnpm db:generate && pnpm db:migrate   # drizzle schema → kickoff_data DB
```

No `API_FOOTBALL_KEY` / `FOOTBALL_DATA_ORG_KEY` / `APIFY_TOKEN` → **mock
mode**: recorded payloads from `fixtures/` drive the entire pipeline offline.

## Sources (spec §1)

| # | Source | Role | Constraint |
|---|--------|------|-----------|
| S1 | API-Football (direct) | Fixtures, lineups, player stats, settlement vote | 100 req/day hard wall — **never polls live**; settlement reserve of 15 req |
| S2 | football-data.org (direct) | Cross-check + settlement vote | Free tier |
| S3 | Flashscore Live (Apify) | PRIMARY live feed → charts lane | Unofficial scrape; settlement voter only after burn-in |
| S4 | Flashscore Extractor (Apify) | Fixture-window redundancy | Same source as S3 → together ONE quorum vote |
| S5 | Football Super Fast Data (Apify) | Settlement tie-breaker ONLY | Never scheduled, never charts/listing |

## Architecture

```
scheduler/planner.ts   PURE: (clock, fixtures, lastRun, budget) → due jobs
jobs.ts                side-effectful runners: fetch → archive → normalize → ingest
ingest.ts              the only writer of listing/charts/Market-B rows
settlement.ts          PURE: quorum + finality-delay state machine
settlementLane.ts      persistence for the engine + freeze sweep + webhooks
api/routes.ts          PURE: /v1 request handling (fake-store testable)
api/store.ts           Drizzle-backed ApiStore
api/server.ts          node:http shell — pnpm api
api/webhooks.ts        HMAC-signed at-least-once delivery, bounded retry
worker.ts              the tick loop: plan → run → freeze sweep
```

Pattern: every lane splits into a **pure core** (tested exhaustively, no
DB/clock/net) and a **thin shell** that owns side effects.

## Consumer API (/v1)

Auth: `Authorization: Bearer <key>` or `x-api-key`. Fails closed — unset
key means every request 401s. Admin routes take a **separate** key.

```
GET  /v1/fixtures?league=EPL&from=&to=          listing lane
GET  /v1/fixtures/:id                           single fixture
GET  /v1/fixtures/:id/state                     live MatchState (charts)
GET  /v1/fixtures/:id/events                    event timeline
GET  /v1/fixtures/:id/stats                     xG / possession / shots
GET  /v1/fixtures/:id/players                   PlayerMatchStats (Market B)
GET  /v1/settlement/:fixtureId                  200 frozen snapshot | 409 {status: pending|provisional|disputed}
POST /v1/admin/settlement/:fixtureId/override   {home, away, reason} → frozen version N+1
POST /v1/admin/backtest/:s1FixtureId            replay pipeline (dashboard button)
```

Every 200 (except immutable snapshots) is wrapped `Sourced<T>`:
`{data, source, fetched_at, staleness_seconds}` — render "as of Ns ago"
honestly. Markets-app client: `src/lib/dataService.ts` (repo root).

## Webhooks (service → app)

`settlement.ready` · `settlement.disputed` · `fixture.status_changed`.
POST to `KICKOFF_DATA_WEBHOOK_URL`, HMAC-SHA256 of the exact body in
`x-kickoff-signature` (verify with `verifySignature` in api/webhooks.ts).
At-least-once, retry ladder 1s/5s/30s then give up — the app dedupes on
`(type, fixture_id, snapshot_version)` and can always poll instead.

## Settlement lane (spec §5 — the checkbook)

1. FT triggers vote runners; each vote = (source, scoreline, fetched_at,
   raw_payload_ref into the archive).
2. Quorum: **≥2 independent sources agree exactly**. Until burn-in passes,
   quorum = S1+S2 only; S3 votes are recorded in shadow. A source's LATEST
   read is its opinion (VAR re-reports supersede).
3. No quorum with all primaries in → S5 tie-break (once). S5 ambiguous or
   agreeing with nobody → `disputed`, admin decides.
4. Provisional outcome sits a **15-min finality delay**; the window resets
   when the outcome changes or a source flips — not on confirming votes.
5. Freeze: immutable versioned `SettlementSnapshot`. Corrections INSERT
   version N+1 (admin override), never edit N. The app settles against
   `(fixture_id, snapshot_version)`, never live data.
6. Order-independence is property-tested: same votes, any arrival order →
   identical snapshot.

## What if a provider shuts down?

Integrity degrades to *unavailability*, never to a one-source payout:

- **One of S1/S2 dies pre-burn-in** → quorum can't form; the market does NOT
  settle on the survivor's word alone. After
  `KICKOFF_DATA_SETTLEMENT_STALL_SECONDS` (default 1h) post-FT without
  quorum, the stall escalation marks the fixture `disputed` and fires
  `settlement.disputed` — the admin is summoned instead of the market
  silently hanging. If the dead provider revives and completes quorum, the
  disputed row recovers to provisional automatically.
- **One provider dies post-burn-in** → survivable with no human: quorum is
  2-of-3 (S1, S2, Flashscore). This is the availability reason the burn-in
  matters beyond chart quality.
- **Everything dies** → admin override: a signed attestation is quorum by
  itself, audited, written as immutable version N+1.

## Webhook receiver (markets app side)

`POST /api/data-hooks` (app repo, `app/api/data-hooks/route.ts`). Verifies
the HMAC, then: `settlement.ready` → re-fetches the frozen snapshot from
/v1 (the webhook is a doorbell, the API is the source of truth) and
auto-settles every linked scoreline market through the same
`executeSettlement()` the admin dashboard uses — audit-logged with actor
`kickoff-data` + snapshot version. `settlement.disputed` → audit log +
loud console error. Idempotent under at-least-once delivery: already-settled
markets are skipped by status guard.

## Burn-in gate (spec §6)

`KICKOFF_DATA_S3_TRUSTED=false` until S3 runs ≥3 full matchdays in shadow
with **zero FT scoreline mismatches** vs S1/S2. The shadow votes recorded in
`settlement_snapshots.votes` are the diff dataset. Also give S5 one cheap
real run during burn-in (its first real execution must not be a live
tie-break).

## Env

See `.env.example` at the repo root — every `KICKOFF_DATA_*` variable is
documented there. Polling cadences: `KICKOFF_DATA_CADENCE_<NAME>_SECONDS`
(names in `src/scheduler/cadence.ts`) — config, not code; tune during
burn-in.
