// Render entry — API and worker in ONE process. Render's free tier only runs
// web services (no background workers) and gives one service's worth of
// hours, so the tick loop shares the API's container. A fatal worker error
// still exits the process (worker.ts), and Render restarts the whole service.
// Run: pnpm start:render   (tsx src/render.ts)

import { startServer } from "./api/server";
import { log } from "./log";
import "./worker"; // starts the tick loop on import

startServer();

// Free web services sleep after 15 min without inbound traffic, which would
// freeze the tick loop. An external pinger (cron-job.org → /health) is the
// primary keep-awake; this self-ping through the public URL is the backup.
const publicUrl = process.env.RENDER_EXTERNAL_URL;
const SELF_PING_MS = 10 * 60 * 1000;
if (publicUrl) {
  setInterval(() => {
    fetch(`${publicUrl}/health`).catch((e) => log.warn("render", "self-ping failed", { error: e as Error }));
  }, SELF_PING_MS).unref();
}
