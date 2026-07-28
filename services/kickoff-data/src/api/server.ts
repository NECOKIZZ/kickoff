// /v1 HTTP server — the socket-owning shell around the pure router. All
// request semantics live in routes.ts; this file only adapts node:http and
// wires the Drizzle store. Run: pnpm api  (tsx src/api/server.ts)

import { createServer } from "node:http";
import { handleRequest, type ApiRequest } from "./routes";
import { drizzleStore } from "./store";

const PORT = Number(process.env.KICKOFF_DATA_API_PORT ?? 8787);

const config = {
  apiKey: process.env.KICKOFF_DATA_API_KEY,
  adminKey: process.env.KICKOFF_DATA_ADMIN_KEY,
};

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
    try {
      const url = new URL(req.url ?? "/", "http://internal");
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
    } catch (e) {
      console.error(`[api] error: ${(e as Error).message}`);
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "internal error" }));
    }
  });
  server.listen(port, () => {
    console.log(
      `[api] up on :${port} — key=${config.apiKey ? "set" : "MISSING (all requests 401)"}, admin=${config.adminKey ? "set" : "MISSING"}`,
    );
  });
  return server;
}

// Started directly (pnpm api), not imported.
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
