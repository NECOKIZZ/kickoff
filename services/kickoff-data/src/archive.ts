// Raw payload archive (spec §4 global rules): source responses are recorded
// BEFORE normalization — reprocessable, and the evidence trail for disputes
// (SettlementVote.raw_payload_ref → raw_payloads.id).
//
// The sink is pluggable so the API clients stay DB-free: tests and mock mode
// run with the default no-op sink; the service worker installs the DB sink at
// startup. Archiving must never break a fetch — sink errors are logged and
// swallowed (losing one archive row beats losing a live poll).
//
// Storage discipline (the table hit 300MB+ in one matchday when every FPL
// poll stored a full bootstrap-static copy):
//   - identical consecutive payloads per (source, endpoint) are stored once;
//   - callers can rate-limit an endpoint (minIntervalSeconds) — big feeds that
//     change every poll (FPL live points) keep a periodic sample, not all;
//   - pruneArchive() drops unreferenced rows past the retention window.

import { createHash } from "node:crypto";
import { log } from "./log";

export interface ArchiveSink {
  (source: string, endpoint: string, payload: unknown): Promise<number | null>;
}

export interface ArchiveOptions {
  /** Store at most one CHANGED payload per (source, endpoint) per interval. */
  minIntervalSeconds?: number;
}

let sink: ArchiveSink | null = null;

/** (source|endpoint) → last stored payload. In-memory: a restart re-archives
 *  each endpoint once, which is fine. */
const lastStored = new Map<string, { hash: string; id: number | null; at: number }>();

export function setArchiveSink(s: ArchiveSink | null): void {
  sink = s;
  lastStored.clear();
}

/** Returns the raw_payloads.id (the existing row's id when the payload is
 *  unchanged), or null when no sink is installed / skipped by rate limit /
 *  on error. */
export async function archiveRaw(
  source: string,
  endpoint: string,
  payload: unknown,
  opts: ArchiveOptions = {},
  now: number = Date.now(),
): Promise<number | null> {
  if (!sink) return null;
  const key = `${source}|${endpoint}`;
  try {
    const hash = createHash("sha256").update(JSON.stringify(payload) ?? "").digest("hex");
    const prev = lastStored.get(key);
    if (prev && prev.hash === hash) return prev.id;
    if (prev && opts.minIntervalSeconds && now - prev.at < opts.minIntervalSeconds * 1000) return null;
    const id = await sink(source, endpoint, payload);
    lastStored.set(key, { hash, id, at: now });
    return id;
  } catch (e) {
    log.error("archive", "archive failed", { source, endpoint, error: e as Error });
    return null;
  }
}

/** DB-backed sink — installed by the worker at startup. Lazy import keeps
 *  the DB client out of test/mock processes entirely. */
export async function installDbSink(): Promise<void> {
  const { db, schema } = await import("./db");
  setArchiveSink(async (source, endpoint, payload) => {
    const rows = await db
      .insert(schema.rawPayloads)
      .values({ source: source as any, endpoint, payload })
      .returning({ id: schema.rawPayloads.id });
    return rows[0]?.id ?? null;
  });
}

/** Unreferenced archive rows older than this are pruned. */
export const ARCHIVE_RETENTION_DAYS = (() => {
  const n = Number(process.env.KICKOFF_DATA_ARCHIVE_RETENTION_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 7;
})();

/** Delete archive rows past retention that nothing points at. Settlement-vote
 *  evidence (endpoint "settlement-vote:*", referenced from settlement JSON by
 *  id string, so no FK) is always kept. Freed space is reused by Postgres
 *  (autovacuum) — the table stops growing instead of shrinking on disk. */
export async function pruneArchive(now: Date, retentionDays = ARCHIVE_RETENTION_DAYS): Promise<number> {
  const { db } = await import("./db");
  const { sql } = await import("drizzle-orm");
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
  const rows = await db.execute(sql`
    DELETE FROM raw_payloads r
    WHERE r.fetched_at < ${cutoff.toISOString()}
      AND r.endpoint NOT LIKE 'settlement-vote:%'
      AND NOT EXISTS (SELECT 1 FROM match_events x WHERE x.raw_payload_id = r.id)
      AND NOT EXISTS (SELECT 1 FROM player_match_stats x WHERE x.raw_payload_id = r.id)
      AND NOT EXISTS (SELECT 1 FROM fpl_player_points x WHERE x.raw_payload_id = r.id)
      AND NOT EXISTS (SELECT 1 FROM player_points_settlements x WHERE x.raw_payload_id = r.id)
    RETURNING r.id
  `);
  const deleted = (rows as unknown as unknown[]).length;
  log.info("archive", "pruned", { deleted, retentionDays });
  return deleted;
}
