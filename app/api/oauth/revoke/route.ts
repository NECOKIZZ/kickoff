import { authenticateClient, revokeByToken } from "@/lib/oauth";
import { oauthJson, preflight, readForm } from "@/lib/oauthHttp";

/** POST /api/oauth/revoke — RFC 7009. Unknown tokens still get 200. */
export async function POST(req: Request) {
  const form = await readForm(req);
  const client = await authenticateClient(req, form);
  if (!client) return oauthJson({ error: "invalid_client", error_description: "unknown client or bad secret" }, 401);
  const token = form.get("token");
  if (token) await revokeByToken(client.id, token);
  return new Response(null, { status: 200, headers: { "cache-control": "no-store" } });
}
export const OPTIONS = preflight;
