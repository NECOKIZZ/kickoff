# Deploying kickoff-data to Railway

Two Railway services from ONE repo + one Postgres. The markets app stays on
Vercel and talks to this over HTTPS.

```
Railway project
├── Postgres          (plugin — hosts the kickoff_data database)
├── kickoff-data-api  (repo, default start cmd from railway.toml)
└── kickoff-data-worker (repo, start cmd overridden — see below)
```

## 1. Postgres

Add the Postgres plugin. Copy its `DATABASE_URL`; it becomes
`KICKOFF_DATA_DATABASE_URL` for both services (this service owns its own DB —
do NOT reuse the markets app's database).

## 2. kickoff-data-api

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

## 3. kickoff-data-worker

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

## 4. Markets app (Vercel) side

```
KICKOFF_DATA_URL=https://<kickoff-data-api domain>
KICKOFF_DATA_API_KEY=<same as api service>
KICKOFF_DATA_ADMIN_KEY=<same as api service>   # dashboard backtest button
KICKOFF_DATA_WEBHOOK_SECRET=<same as worker>   # receiver verifies HMAC
```

## 5. Verify

```
curl https://<api-domain>/health
# {"status":"ok","db":"ok","worker":{"alive":true,"lastTickSecondsAgo":12,...},"budgets":{...}}
```

`status: "degraded"` = API fine but worker heartbeat stale → check the
worker service's logs. 503 = DB unreachable.

## Reading the logs (Railway → service → Logs)

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

## Costs

Worker + API are tiny (idle most of the week); hobby plan covers both.
Apify: ~$1.50–2 per full matchday at the 2-min in-play cadence.
