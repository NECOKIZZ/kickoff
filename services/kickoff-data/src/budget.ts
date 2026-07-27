// Per-source budget mirror (spec §4 global rules): the in-process counters
// survive restarts by mirroring to source_budget, one row per source per UTC
// day. Same pluggable-sink pattern as archive.ts — clients stay DB-free,
// the worker installs the DB store at startup.

export interface BudgetStore {
  /** Atomically increment (source, dayUtc) and return the new count. */
  increment(source: string, dayUtc: string): Promise<number>;
  /** Read today's count (0 when no row). */
  read(source: string, dayUtc: string): Promise<number>;
}

let store: BudgetStore | null = null;

export function setBudgetStore(s: BudgetStore | null): void {
  store = s;
}

/** Fire-and-forget mirror write. A mirror failure must never fail a fetch. */
export function mirrorSpend(source: string, dayUtc: string): void {
  if (!store) return;
  store.increment(source, dayUtc).catch((e) => {
    console.error(`budget mirror failed (${source}):`, (e as Error).message);
  });
}

/** Restore today's count on startup (returns 0 with no store/row). */
export async function restoreSpend(source: string, dayUtc: string): Promise<number> {
  if (!store) return 0;
  try {
    return await store.read(source, dayUtc);
  } catch {
    return 0;
  }
}

export async function installDbBudgetStore(): Promise<void> {
  const { db, schema } = await import("./db");
  const { sql, and, eq } = await import("drizzle-orm");
  setBudgetStore({
    async increment(source, dayUtc) {
      const rows = await db
        .insert(schema.sourceBudget)
        .values({ source: source as any, dayUtc, used: 1 })
        .onConflictDoUpdate({
          target: [schema.sourceBudget.source, schema.sourceBudget.dayUtc],
          set: { used: sql`${schema.sourceBudget.used} + 1`, updatedAt: sql`now()` },
        })
        .returning({ used: schema.sourceBudget.used });
      return rows[0]?.used ?? 0;
    },
    async read(source, dayUtc) {
      const rows = await db
        .select({ used: schema.sourceBudget.used })
        .from(schema.sourceBudget)
        .where(and(eq(schema.sourceBudget.source, source as any), eq(schema.sourceBudget.dayUtc, dayUtc)));
      return rows[0]?.used ?? 0;
    },
  });
}
