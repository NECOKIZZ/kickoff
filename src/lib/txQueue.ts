import { eq, sql } from "drizzle-orm";
import type { Hex } from "viem";
import { db, schema } from "@/db";

// ---------------------------------------------------------------------------
// One-at-a-time nonces for the server's signing keys.
//
// The relayer and agent-operator keys send from many serverless instances at
// once (faucet drips, market listing, settlement, agent registration, managed
// agent stakes). Left to viem, each request reads the "pending" nonce from
// the RPC on its own, so two concurrent sends can pick the same nonce and one
// fails with "nonce too low". Here every send takes a per-key Postgres lock,
// reserves its nonce in signer_nonces, submits, and only then releases —
// so nonces are handed out strictly in order across every instance.
// ---------------------------------------------------------------------------

/** After this long without a send, trust the chain over our stored nonce (covers dropped txs). */
export const STORED_NONCE_TTL_MS = 120_000;
const MAX_ATTEMPTS = 3;

/**
 * Nonce to use: the higher of the chain's pending count and what we last
 * handed out — the RPC can lag a just-submitted tx. A stale stored value is
 * ignored so a tx that never landed can't leave a permanent gap.
 */
export function pickNonce(chainPending: number, stored: number | null, storedAgeMs: number | null, floor = 0): number {
  const fresh = stored !== null && storedAgeMs !== null && storedAgeMs < STORED_NONCE_TTL_MS;
  return Math.max(chainPending, fresh ? stored! : 0, floor);
}

/** The node rejected the nonce itself (as opposed to a revert or a network error). */
export function isNonceError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /NonceTooLow|nonce (is )?too low|lower than the current nonce|already known|replacement transaction underpriced|nonce has already been used/i.test(
    msg,
  );
}

function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "42P01" || e?.cause?.code === "42P01" || /signer_nonces.*does not exist/.test(String(err));
}

/**
 * Submit a tx from `address` with a serialized nonce. `send` must pass the
 * given nonce through to viem and return the hash once the node accepts it
 * (do NOT wait for the receipt inside `send` — that would hold the lock).
 * Retries on a nonce clash with the next nonce up.
 */
export async function sendSerialized(
  address: Hex,
  getPendingNonce: () => Promise<number>,
  send: (nonce: number) => Promise<Hex>,
): Promise<Hex> {
  const key = address.toLowerCase();
  let floor = 0;
  let tried = -1;
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        // Transaction-scoped lock: released on commit/rollback, even if the
        // serverless instance dies mid-send.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"signer:" + key}))`);
        const [row] = await tx.select().from(schema.signerNonces).where(eq(schema.signerNonces.address, key));
        const chainPending = await getPendingNonce();
        const nonce = pickNonce(
          chainPending,
          row?.nextNonce ?? null,
          row ? Date.now() - row.updatedAt.getTime() : null,
          floor,
        );
        tried = nonce;
        const hash = await send(nonce);
        await tx
          .insert(schema.signerNonces)
          .values({ address: key, nextNonce: nonce + 1, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: schema.signerNonces.address,
            set: { nextNonce: nonce + 1, updatedAt: new Date() },
          });
        return hash;
      });
    } catch (err) {
      // Migration 0008 not applied yet: fall back to the RPC's pending nonce
      // (the old behaviour) rather than taking every server tx down.
      if (tried < 0 && isMissingTable(err)) return send(await getPendingNonce());
      if (attempt >= MAX_ATTEMPTS || !isNonceError(err)) throw err;
      // Someone outside this queue (a script, a stuck tx) used it — move past it.
      floor = Math.max(floor, tried + 1, await getPendingNonce());
    }
  }
}
