/**
 * Launch gate — signed invite cookie.
 *
 * A redeemed invite code sets `kickoff_invite`, an HMAC-signed token
 * (`v1.<codeId>.<expires>.<sig>`). Web Crypto only — the SAME code runs in
 * Edge middleware (page gate) and Node route handlers (API gate).
 *
 * Testnet-pragmatic: the cookie is device-scoped so users aren't locked to a
 * throwaway dev wallet. Redemption also stamps `redeemedByUserId` when the
 * caller is signed in, so the moment Privy lands existing redemptions carry
 * over and the cookie can be re-issued against the Privy account.
 */

export const INVITE_COOKIE = "kickoff_invite";
/** Long-lived: covers the whole testnet burn-in; Privy re-issue supersedes. */
export const INVITE_COOKIE_MAX_AGE_S = 180 * 24 * 60 * 60;

function secret(): string {
  // Falls back to ADMIN_API_KEY so the gate works before the dedicated
  // secret is provisioned; set INVITE_COOKIE_SECRET in prod.
  const s = process.env.INVITE_COOKIE_SECRET || process.env.ADMIN_API_KEY;
  if (!s) throw new Error("INVITE_COOKIE_SECRET (or ADMIN_API_KEY) must be set");
  return s;
}

function b64url(buf: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return b64url(sig);
}

export async function mintInviteToken(codeId: number): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + INVITE_COOKIE_MAX_AGE_S;
  const payload = `v1.${codeId}.${expires}`;
  return `${payload}.${await hmac(payload)}`;
}

/** Returns the redeemed code id, or null if missing/tampered/expired. */
export async function verifyInviteToken(token: string | undefined): Promise<number | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const [v, codeId, expires, sig] = parts;
  const payload = `${v}.${codeId}.${expires}`;
  let expect: string;
  try {
    expect = await hmac(payload);
  } catch {
    return null; // secret not configured — fail closed
  }
  // Constant-time-ish compare (same length required first).
  if (sig.length !== expect.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expect.charCodeAt(i);
  if (diff !== 0) return null;
  if (Number(expires) < Math.floor(Date.now() / 1000)) return null;
  const id = Number(codeId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Read + verify the invite cookie off a Request (route handlers). */
export async function verifyInviteFromRequest(req: Request): Promise<number | null> {
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${INVITE_COOKIE}=([^;]+)`));
  return verifyInviteToken(m?.[1]);
}

/** KICK-XXXX-XXXX — unambiguous alphabet (no 0/O/1/I). */
export function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const pick = (b: number) => alphabet[b % alphabet.length];
  const a = Array.from(bytes.slice(0, 4), pick).join("");
  const b = Array.from(bytes.slice(4), pick).join("");
  return `KICK-${a}-${b}`;
}
