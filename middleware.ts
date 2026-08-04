import { NextResponse, type NextRequest } from "next/server";
import { INVITE_COOKIE, verifyInviteToken } from "@/lib/inviteGate";

/**
 * Launch gate — landing stays public; the app requires a redeemed invite.
 * Pages only here (fast Edge check + redirect); money-moving APIs re-verify
 * the cookie server-side in their own handlers so the gate can't be bypassed
 * by calling the API directly.
 */
const GATED_PREFIXES = ["/markets", "/leaderboard", "/positions"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!GATED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const ok = await verifyInviteToken(req.cookies.get(INVITE_COOKIE)?.value);
  if (ok !== null) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/waitlist";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/markets/:path*", "/leaderboard/:path*", "/positions/:path*"],
};
