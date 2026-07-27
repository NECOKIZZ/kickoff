// Raw payload archive (spec §4 global rules): every source response is
// recorded BEFORE normalization — reprocessable forever, and the evidence
// trail for disputes (SettlementVote.raw_payload_ref → raw_payloads.id).
//
// The sink is pluggable so the API clients stay DB-free: tests and mock mode
// run with the default no-op sink; the service worker installs the DB sink at
// startup. Archiving must never break a fetch — sink errors are logged and
// swallowed (losing one archive row beats losing a live poll).

export interface ArchiveSink {
  (source: string, endpoint: string, payload: unknown): Promise<number | null>;
}

let sink: ArchiveSink | null = null;

export function setArchiveSink(s: ArchiveSink | null): void {
  sink = s;
}

/** Returns the raw_payloads.id, or null when no sink is installed / on error. */
export async function archiveRaw(
  source: string,
  endpoint: string,
  payload: unknown,
): Promise<number | null> {
  if (!sink) return null;
  try {
    return await sink(source, endpoint, payload);
  } catch (e) {
    console.error(`archive failed (${source} ${endpoint}):`, (e as Error).message);
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
