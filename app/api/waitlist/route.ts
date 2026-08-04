import { db, schema } from "@/db";
import { json, jsonError } from "@/lib/http";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * POST /api/waitlist — public. Body: { email }.
 * Idempotent: re-joining with a known email returns ok (no dup rows, and no
 * signal about whether the email was already there beyond "you're on it").
 */
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }

  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) return jsonError("valid email required", 400);

  await db.insert(schema.waitlistSignups).values({ email }).onConflictDoNothing();
  return json({ ok: true });
}
