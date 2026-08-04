import { db, schema } from "@/db";
import { json, jsonError } from "@/lib/http";
import { verifyAdmin } from "@/lib/auth";
import { logAdminEvent } from "@/lib/admin";
import { generateInviteCode } from "@/lib/inviteGate";
import { desc, eq, sql } from "drizzle-orm";

/**
 * POST /api/admin/invites — mint invite codes.
 * Body: { count?: number (default 1, max 100), note?: string,
 *         waitlistIds?: number[] (mint one code per signup + stamp invitedAt) }
 * Codes are strictly single-use.
 */
export async function POST(req: Request) {
  if (!verifyAdmin(req)) return jsonError("unauthorized", 401);

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }

  const note = typeof b.note === "string" ? b.note.slice(0, 200) : null;
  const waitlistIds = Array.isArray(b.waitlistIds)
    ? b.waitlistIds.filter((v): v is number => Number.isInteger(v) && v > 0)
    : [];

  let rows: { code: string; waitlistId: number | null }[];
  if (waitlistIds.length > 0) {
    rows = waitlistIds.map((wid) => ({ code: generateInviteCode(), waitlistId: wid }));
  } else {
    const count = b.count == null ? 1 : Number(b.count);
    if (!Number.isInteger(count) || count < 1 || count > 100)
      return jsonError("count must be an integer 1-100", 400);
    rows = Array.from({ length: count }, () => ({ code: generateInviteCode(), waitlistId: null }));
  }

  const minted = await db
    .insert(schema.inviteCodes)
    .values(rows.map((r) => ({ code: r.code, note, waitlistId: r.waitlistId })))
    .onConflictDoNothing({ target: schema.inviteCodes.code }) // astronomically rare collision → caller re-mints
    .returning({ id: schema.inviteCodes.id, code: schema.inviteCodes.code, waitlistId: schema.inviteCodes.waitlistId });

  if (waitlistIds.length > 0) {
    for (const wid of new Set(minted.map((m) => m.waitlistId).filter((v): v is number => v !== null))) {
      await db
        .update(schema.waitlistSignups)
        .set({ invitedAt: sql`now()` })
        .where(eq(schema.waitlistSignups.id, wid));
    }
  }

  await logAdminEvent("admin", "invite.mint", null, { count: minted.length, note, waitlistIds });
  return json({ codes: minted });
}

/**
 * GET /api/admin/invites — funnel view: waitlist + codes with redemption state.
 */
export async function GET(req: Request) {
  if (!verifyAdmin(req)) return jsonError("unauthorized", 401);

  const [signups, codes] = await Promise.all([
    db.select().from(schema.waitlistSignups).orderBy(desc(schema.waitlistSignups.createdAt)),
    db.select().from(schema.inviteCodes).orderBy(desc(schema.inviteCodes.createdAt)),
  ]);

  return json({
    stats: {
      signups: signups.length,
      invited: signups.filter((s) => s.invitedAt !== null).length,
      codesMinted: codes.length,
      codesRedeemed: codes.filter((c) => c.redeemedAt !== null).length,
    },
    signups,
    codes,
  });
}
