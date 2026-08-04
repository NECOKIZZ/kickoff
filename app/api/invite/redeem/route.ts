import { db, schema } from "@/db";
import { json, jsonError } from "@/lib/http";
import { verifyCaller } from "@/lib/auth";
import { INVITE_COOKIE, INVITE_COOKIE_MAX_AGE_S, mintInviteToken } from "@/lib/inviteGate";
import { and, eq, isNull, sql } from "drizzle-orm";

/**
 * POST /api/invite/redeem — public. Body: { code }.
 *
 * Strictly single-use: the UPDATE only lands if redeemed_at IS NULL, so two
 * racers can't both claim a code. Success sets the signed gate cookie. If the
 * caller happens to be signed in (dev header today, Privy later) the code is
 * bound to their user row for continuity.
 */
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }

  const code = typeof b.code === "string" ? b.code.trim().toUpperCase() : "";
  if (!/^KICK-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)) return jsonError("invalid code", 400);

  // Optional identity — never required to redeem.
  const caller = await verifyCaller(req).catch(() => null);

  const [row] = await db
    .update(schema.inviteCodes)
    .set({
      redeemedAt: sql`now()`,
      redeemedByUserId: caller?.userId ?? null,
    })
    .where(and(eq(schema.inviteCodes.code, code), isNull(schema.inviteCodes.redeemedAt)))
    .returning({ id: schema.inviteCodes.id, waitlistId: schema.inviteCodes.waitlistId });

  if (!row) {
    // Either unknown or already used — same message, no oracle.
    return jsonError("code invalid or already used", 400);
  }

  const token = await mintInviteToken(row.id);
  const res = json({ ok: true });
  res.cookies.set(INVITE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: INVITE_COOKIE_MAX_AGE_S,
    path: "/",
  });
  return res;
}
