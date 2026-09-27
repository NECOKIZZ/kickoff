import { json, jsonError } from "@/lib/http";
import { verifyCaller } from "@/lib/auth";
import { logAdminEvent } from "@/lib/admin";
import { agentOfOwner } from "@/lib/agents";
import { checkAuthorize, denyRedirect, issueCode, redirectHost } from "@/lib/oauth";

/**
 * Backs the /oauth/authorize consent page.
 * GET  ?<authorize query>  → who's asking (no auth needed) or why it can't.
 * POST { query, approve }  → the signed-in owner's decision → where to send the browser.
 */
export async function GET(req: Request) {
  const r = await checkAuthorize(new URL(req.url).searchParams);
  if ("fatal" in r) return jsonError(r.fatal, 400);
  if ("redirect" in r) return json({ redirect: r.redirect });
  return json({ client: { name: r.ok.clientName, redirectHost: redirectHost(r.ok.redirectUri) } });
}

export async function POST(req: Request) {
  const caller = await verifyCaller(req);
  if (!caller) return jsonError("unauthorized", 401);
  let b: { query?: unknown; approve?: unknown };
  try {
    b = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }
  if (typeof b.query !== "string") return jsonError("query required", 400);
  const r = await checkAuthorize(new URLSearchParams(b.query));
  if ("fatal" in r) return jsonError(r.fatal, 400);
  if ("redirect" in r) return json({ redirect: r.redirect });

  if (b.approve !== true) return json({ redirect: denyRedirect(r.ok) });
  const agent = await agentOfOwner(caller.userId);
  if (!agent) return jsonError("Create your agent on My Agent first, then connect again.", 409);
  const redirect = await issueCode(r.ok, agent.id);
  await logAdminEvent(caller.address, "agent.oauth.approve", null, { agentId: agent.id, clientId: r.ok.clientId });
  return json({ redirect });
}
