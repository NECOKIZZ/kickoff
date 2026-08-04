import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

/**
 * Auth — Privy server-side verification with a dev-mode fallback.
 *
 * With PRIVY_APP_SECRET + NEXT_PUBLIC_PRIVY_APP_ID configured: callers present
 * `Authorization: Bearer <privy access token>`; we verify it, resolve the
 * user's embedded/linked wallet address, and upsert the user row keyed by
 * address (privy_did stored alongside). The `x-dev-address` header is then
 * only honored in NODE_ENV=development so local testing stays scriptable.
 *
 * Without keys (pre-provisioning): dev header only — unchanged behavior.
 */

export interface Caller {
  userId: number;
  address: string;
}

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

// Lazy singleton — only load the SDK when a token actually needs verifying.
let privyClient: import("@privy-io/server-auth").PrivyClient | null = null;
async function getPrivy() {
  if (!privyClient) {
    const { PrivyClient } = await import("@privy-io/server-auth");
    privyClient = new PrivyClient(process.env.NEXT_PUBLIC_PRIVY_APP_ID!, process.env.PRIVY_APP_SECRET!);
  }
  return privyClient;
}

export async function verifyCaller(req: Request): Promise<Caller | null> {
  const privyConfigured = !!process.env.PRIVY_APP_SECRET && !!process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  // Dev header — the only path pre-Privy; development-only once keys land.
  const dev = req.headers.get("x-dev-address");
  if (dev && (!privyConfigured || process.env.NODE_ENV === "development")) {
    if (!ADDR_RE.test(dev)) return null;
    return upsertUser(dev.toLowerCase(), null);
  }

  if (!privyConfigured) return null;

  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  try {
    const privy = await getPrivy();
    const claims = await privy.verifyAuthToken(token);
    const user = await privy.getUser(claims.userId);
    // Prefer the embedded wallet; fall back to any linked wallet account.
    const linked = user.linkedAccounts.find((a) => a.type === "wallet") as
      | { type: "wallet"; address: string }
      | undefined;
    const wallet = user.wallet?.address ?? linked?.address;
    if (!wallet || !ADDR_RE.test(wallet)) return null;
    return upsertUser(wallet.toLowerCase(), claims.userId);
  } catch {
    return null; // bad/expired token — never throw into route handlers
  }
}

export async function upsertUser(address: string, privyDid: string | null): Promise<Caller> {
  const existing = await db.select().from(schema.users).where(eq(schema.users.address, address)).limit(1);
  if (existing.length > 0) {
    // Backfill the DID the first time a dev-era user signs in through Privy.
    if (privyDid && existing[0].privyDid !== privyDid) {
      await db.update(schema.users).set({ privyDid }).where(eq(schema.users.id, existing[0].id));
    }
    return { userId: existing[0].id, address };
  }
  const [row] = await db
    .insert(schema.users)
    .values({ address, privyDid })
    .onConflictDoNothing({ target: schema.users.address })
    .returning();
  if (row) return { userId: row.id, address };
  const retry = await db.select().from(schema.users).where(eq(schema.users.address, address)).limit(1);
  return { userId: retry[0].id, address };
}

/** Admin gate: static bearer key from env (testnet control room). */
export function verifyAdmin(req: Request): boolean {
  const key = process.env.ADMIN_API_KEY;
  if (!key) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${key}`;
}
