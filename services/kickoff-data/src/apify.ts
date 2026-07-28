// Apify client — S3 (Flashscore Live), S4 (Flashscore Extractor), S5 (FSFD).
// One generic run helper; per-actor wrappers + typed surfaces live in
// flashscore.ts. Uses run-sync-get-dataset-items so one HTTP call = start
// actor, wait, return items (fits our poll cadences; runs take ~10-30s).
//
// MOCK MODE mirrors apiFootball.ts: no APIFY_TOKEN → recorded payloads from
// fixtures/apify/ so the whole pipeline runs offline.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fixturesDir } from "./mockDir";
import { archiveRaw } from "./archive";
import { mirrorSpend } from "./budget";
import { log } from "./log";

const BASE = "https://api.apify.com/v2";

export function isMockMode(): boolean {
  return !process.env.APIFY_TOKEN;
}

/** actorId format: "username~actor-name" (Apify's URL-safe form). */
export async function runActor(
  actorId: string,
  input: Record<string, unknown>,
  opts: { mockFile: string; source: string; timeoutSeconds?: number },
): Promise<any[]> {
  if (isMockMode()) {
    const raw = await readFile(path.join(fixturesDir(), "apify", opts.mockFile), "utf8");
    return JSON.parse(raw);
  }

  const url = `${BASE}/acts/${actorId}/run-sync-get-dataset-items?token=${process.env.APIFY_TOKEN}&timeout=${opts.timeoutSeconds ?? 120}`;
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (e) {
    log.error("apify", "fetch failed", { actor: actorId, error: e as Error });
    throw e;
  }
  mirrorSpend(opts.source, new Date().toISOString().slice(0, 10));
  if (!res.ok) {
    log.error("apify", "actor run failed", { actor: actorId, status: res.status, ms: Date.now() - started });
    throw new Error(`Apify ${actorId} → HTTP ${res.status}`);
  }
  const items = (await res.json()) as any[];
  log.info("apify", "actor run ok", { actor: actorId, items: items.length, ms: Date.now() - started });
  // Archive BEFORE normalization (spec §4) — evidence trail for disputes.
  await archiveRaw(opts.source, actorId, items);
  return items;
}
