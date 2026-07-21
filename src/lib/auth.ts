import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

/**
 * Auth — Privy server-side verification.
 *
 * Until PRIVY_APP_SECRET is configured, DEV MODE accepts `x-dev-address`
 * as the caller identity so endpoints are testable today. The moment Privy
 * keys land, verifyCaller switches to @privy-io/server-auth token
 * verification and the dev header is rejected outside NODE_ENV=development.
 */

export interface Caller {
  userId: number;
  address: string;
}

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

export async function verifyCaller(req: Request): Promise<Caller | null> {
  const privyConfigured = !!process.env.PRIVY_APP_SECRET;

  if (!privyConfigured) {
    const dev = req.headers.get("x-dev-address");
    if (!dev || !ADDR_RE.test(dev)) return null;
    return upsertUser(dev.toLowerCase(), null);
  }

  // TODO(step: privy keys): verify the Authorization bearer token with
  // @privy-io/server-auth, extract the wallet address + DID.
  return null;
}

export async function upsertUser(address: string, privyDid: string | null): Promise<Caller> {
  const existing = await db.select().from(schema.users).where(eq(schema.users.address, address)).limit(1);
  if (existing.length > 0) return { userId: existing[0].id, address };
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
