// /v1 HTTP server — the socket-owning shell around the pure router. All
// request semantics live in routes.ts; this file only adapts node:http,
// wires the Drizzle store, logs every request, and serves /health.
// Run: pnpm api  (tsx src/api/server.ts)

import { createServer } from "node:http";
import { sql } from "drizzle-orm";
import { handleRequest, type ApiRequest } from "./routes";
import { drizzleStore } from "./store";
import { db, schema } from "../db";
import { log } from "../log";

const PORT = Number(process.env.KICKOFF_DATA_API_PORT ?? process.env.PORT ?? 8787);

const config = {
  apiKey: process.env.KICKOFF_DATA_API_KEY,
  adminKey: process.env.KICKOFF_DATA_ADMIN_KEY,
};

/** How stale the worker heartbeat may be before /health degrades. The
 *  worker ticks every KICKOFF_DATA_TICK_SECONDS (30s default); 3 missed
 *  ticks + slack = it's gone, not slow. */
const HEARTBEAT_STALE_SECONDS = Number(process.env.KICKOFF_DATA_HEARTBEAT_STALE_SECONDS ?? 120);

/**
 * GET /health — unauthenticated (Railway probes can't hold keys).
 * 200 = API + DB fine (deploys stay green even before the worker boots);
 * body.status "degraded" = worker heartbeat stale/missing — alert-worthy
 * but not restart-worthy for THIS container. 503 = DB unreachable.
 */
async function health(): Promise<{ status: number; body: unknown }> {
  try {
    const [hb] = await db.select().from(schema.serviceHeartbeat);
    const budgets = await db
      .select()
      .from(schema.sourceBudget)
      .where(sql`${schema.sourceBudget.dayUtc} = ${new Date().toISOString().slice(0, 10)}`);

    const heartbeatAge = hb ? Math.floor((Date.now() - new Date(hb.lastTickAt).getTime()) / 1000) : null;
    const workerAlive = heartbeatAge !== null && heartbeatAge < HEARTBEAT_STALE_SECONDS;

    return {
      status: 200,
      body: {
        status: workerAlive ? "ok" : "degraded",
        db: "ok",
        worker: workerAlive
          ? { alive: true, lastTickSecondsAgo: heartbeatAge, lastTickJobs: hb!.lastTickJobs }
          : { alive: false, lastTickSecondsAgo: heartbeatAge, hint: "worker process down or heartbeat stale" },
        budgets: Object.fromEntries(budgets.map((b) => [b.source, b.used])),
      },
    };
  } catch (e) {
    log.error("api", "health check db failure", { error: e as Error });
    return { status: 503, body: { status: "down", db: "unreachable" } };
  }
}

async function readBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined; // routes reject malformed bodies with a 400 where one is required
  }
}

export function startServer(port = PORT): ReturnType<typeof createServer> {
  const server = createServer(async (req, res) => {
    const started = Date.now();
    const url = new URL(req.url ?? "/", "http://internal");
    try {
      if (url.pathname === "/health") {
        const h = await health();
        res.writeHead(h.status, { "content-type": "application/json" });
        res.end(JSON.stringify(h.body));
        return;
      }

      const apiReq: ApiRequest = {
        method: req.method ?? "GET",
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        headers: Object.fromEntries(
          Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0]! : (v ?? "")]),
        ),
        body: req.method === "POST" ? await readBody(req) : undefined,
      };
      const { status, body } = await handleRequest(drizzleStore, config, apiReq);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
      // Request log: 4xx/5xx warn (auth failures, unknown fixtures — the "app
      // can't reach data" class), 2xx debug (volume).
      log[status >= 400 ? "warn" : "debug"]("api", "request", {
        method: apiReq.method,
        path: apiReq.path,
        status,
        ms: Date.now() - started,
      });
    } catch (e) {
      log.error("api", "request failed", {
        method: req.method,
        path: url.pathname,
        error: e as Error,
        ms: Date.now() - started,
      });
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "internal error" }));
    }
  });
  server.listen(port, () => {
    log.info("api", "up", {
      port,
      key: config.apiKey ? "set" : "MISSING (all requests 401)",
      admin: config.adminKey ? "set" : "MISSING",
    });
  });
  return server;
}

// Started directly (pnpm api), not imported.
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
