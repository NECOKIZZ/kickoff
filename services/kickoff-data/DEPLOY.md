# Deploying kickoff-data

## Render (current: free tier)

`render.yaml` at the repo root is a Render Blueprint: ONE free web service that
runs the API and the worker loop in the same process (`pnpm start:render` →
`src/render.ts`). The database is Supabase's free Postgres (free Render
Postgres expires after 30 days; Neon's free compute-hours can't cover a
worker that polls every 30s).

1. **Supabase**: new project `kickoff-data`, region East US (N. Virginia).
   Connect → **Session pooler** string (Render can't reach the IPv6-only
   direct address), append `?sslmode=require`.
2. **Render**: New → Blueprint → this repo. Fill the `sync: false` vars:
   `KICKOFF_DATA_DATABASE_URL`, `API_FOOTBALL_KEY`, `FOOTBALL_DATA_ORG_KEY`
   (`APIFY_TOKEN` optional, blank = Flashscore lanes off). The API/admin/
   webhook keys are generated.
3. **Vercel (markets app)**: `KICKOFF_DATA_URL` = the Render URL, plus
   `KICKOFF_DATA_API_KEY`, `KICKOFF_DATA_ADMIN_KEY`,
   `KICKOFF_DATA_WEBHOOK_SECRET` copied from Render.
4. **cron-job.org**: GET `<render url>/health` every 2 minutes. Free services
   sleep after 15 min without inbound traffic, which would stop the tick
   loop; the service also self-pings every 10 min as a backup.

`KICKOFF_DATA_NO_MOCKS=1` is set in the Blueprint: a source without its key
is switched off instead of serving recorded payloads, so test data can never
reach this database. The worker's startup log lists `disabledSources`.

**Source roles** (`src/sources.ts`, set in the Blueprint). Today FPL is the
only source: `KICKOFF_DATA_LISTING_SOURCES=fpl` lets it create fixtures (and
follow reschedules/status); `KICKOFF_DATA_SETTLEMENT_VOTERS=fpl` +
`KICKOFF_DATA_SETTLEMENT_QUORUM=1` settles on its full-time score.
`KICKOFF_DATA_FINALITY_DELAY_SECONDS=0`: a result freezes the moment quorum
is reached. With one voter that means a wrong full-time score is final, so
before real money add a second fast source and set `QUORUM=2`: agreement,
not waiting, is the safety net (disagreement waits for a tie-break/admin).
Adding a source = its key + the roster vars. A roster that can never reach
quorum fails at boot. Only matches kicked off in the last 48h get a vote.

**Rate limits.** Every source client backs off on HTTP 429 (retried next
tick), and every polling cadence is an env var
`KICKOFF_DATA_CADENCE_<NAME>_SECONDS` (names in `src/scheduler/cadence.ts`).

| Source | Limit | Knobs |
|---|---|---|
| FPL | none published, be polite | `FPL_LIVE_POLL` (60s in the Blueprint), `FPL_POST_MATCH`, `FPL_BOOTSTRAP_SYNC` |
| API-Football | 100/day free (paid plans more) | `KICKOFF_DATA_S1_DAILY_LIMIT` = your plan's cap; S1 cadences; 15 requests always reserved for settlement |
| football-data.org | 10/min free, scores delayed (live = paid tier) | `S2_FIXTURE_SYNC`, `S2_SETTLEMENT_DELAY` |
| Flashscore (Apify) | pay per run | `S3_*` cadences |

Free-tier limits: one service's worth of instance hours (don't add a second
free service), ~1 min down per deploy/restart (the loop resumes from the DB).
Upgrade path: Render Starter, no code change.

---

## Railway (original two-service layout)

Two Railway services from ONE repo + one Postgres. The markets app stays on
Vercel and talks to this over HTTPS.

```
Railway project
├── Postgres          (plugin — hosts the kickoff_data database)
├── kickoff-data-api  (repo, default start cmd from railway.toml)
└── kickoff-data-worker (repo, start cmd overridden — see below)
```

### 1. Postgres

Add the Postgres plugin. Copy its `DATABASE_URL`; it becomes
`KICKOFF_DATA_DATABASE_URL` for both services (this service owns its own DB —
do NOT reuse the markets app's database).

### 2. kickoff-data-api

New service → Deploy from GitHub repo → root directory `/` (workspace needs
the repo root). `railway.toml` supplies build + start + healthcheck:

- start: `pnpm --filter @kickoff/data db:migrate && pnpm --filter @kickoff/data api`
  (migrations are idempotent — they run on every deploy before the API binds)
- healthcheck: `GET /health` — 200 once DB is reachable

Variables:

```
KICKOFF_DATA_DATABASE_URL=<postgres plugin URL>
KICKOFF_DATA_API_KEY=<openssl rand -hex 24>
KICKOFF_DATA_ADMIN_KEY=<openssl rand -hex 24, DIFFERENT value>
KICKOFF_DATA_LOG_FORMAT=json
# PORT is injected by Railway; the server reads it automatically.
```

Then "Generate Domain" on this service — that URL is what the app dials.

### 3. kickoff-data-worker

Second service → SAME repo, root `/`. In Settings → Deploy, override:

- **Custom Start Command:** `pnpm --filter @kickoff/data worker`
- **Healthcheck:** none (it's not an HTTP server; its liveness shows up in
  the API's /health as `worker.alive` via the DB heartbeat)

Variables (worker does the fetching, so it holds the source keys):

```
KICKOFF_DATA_DATABASE_URL=<same postgres URL>
API_FOOTBALL_KEY=<real key>
FOOTBALL_DATA_ORG_KEY=<real key>
APIFY_TOKEN=<real token>
KICKOFF_DATA_FPL_LIVE=1                # FPL is keyless; 1 = live, unset = mock
KICKOFF_DATA_WEBHOOK_URL=https://<your-vercel-app>/api/data-hooks
KICKOFF_DATA_WEBHOOK_SECRET=<openssl rand -hex 32>
KICKOFF_DATA_S3_TRUSTED=false          # flip after burn-in (spec §6)
KICKOFF_DATA_LOG_FORMAT=json
```

FPL note: player perps settle on official FPL points — FPL is the standalone
authority for that lane (documented exception to the no-single-source rule;
scoreline settlement is unchanged). Watch for `settlement.player_points_ready`
(freeze at FPL's `data_checked`) and `settlement.player_points_flagged`
(S1 cross-check diff — informational, settlement proceeds regardless).

### 4. Markets app (Vercel) side

```
KICKOFF_DATA_URL=https://<kickoff-data-api domain>
KICKOFF_DATA_API_KEY=<same as api service>
KICKOFF_DATA_ADMIN_KEY=<same as api service>   # dashboard backtest button
KICKOFF_DATA_WEBHOOK_SECRET=<same as worker>   # receiver verifies HMAC
```

### 5. Verify

```
curl https://<api-domain>/health
# {"status":"ok","db":"ok","worker":{"alive":true,"lastTickSecondsAgo":12,...},"budgets":{...}}
```

`status: "degraded"` = API fine but worker heartbeat stale → check the
worker service's logs. 503 = DB unreachable.

### Reading the logs (Railway → service → Logs)

All lines are single-line JSON (`KICKOFF_DATA_LOG_FORMAT=json`) with
`component` + `msg` fields. The troubleshooting map:

| Symptom | Grep / filter |
|---|---|
| Worker dead? | api /health `worker.alive`, or worker logs went silent |
| Rate limited? | `"msg":"rate limited"` (has source + endpoint) |
| S1 budget gone? | `"msg":"budget exhausted"` / `"circuit breaker tripped"` |
| Source down? | `"msg":"fetch failed"` / `"http error"` / `"actor run failed"` |
| Settlement stuck? | `"component":"settlement"` — votes, stalls, freezes all logged |
| Disputed match? | `"msg"` starting `disputed:` (reason included) |
| Webhooks failing? | `"component":"webhook","msg":"delivery failed"` |
| App can't reach /v1? | `"component":"api"` — every 4xx/5xx logged with path+status+ms |

`KICKOFF_DATA_LOG_LEVEL=debug` turns on per-request 2xx lines and per-call
source logs when actively debugging; default `info` keeps matchday volume
sane.

### Costs

Worker + API are tiny (idle most of the week); hobby plan covers both.
Apify: ~$1.50–2 per full matchday at the 2-min in-play cadence.
