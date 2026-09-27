import { authenticateClient, exchangeCode, refreshGrant } from "@/lib/oauth";
import { oauthJson, preflight, readForm } from "@/lib/oauthHttp";

/** POST /api/oauth/token — authorization_code (+PKCE) and refresh_token grants. */
export async function POST(req: Request) {
  const form = await readForm(req);
  const client = await authenticateClient(req, form);
  if (!client) return oauthJson({ error: "invalid_client", error_description: "unknown client or bad secret" }, 401);

  const grant = form.get("grant_type");
  const r =
    grant === "authorization_code"
      ? await exchangeCode(client.id, form)
      : grant === "refresh_token"
        ? await refreshGrant(client.id, form)
        : { error: "unsupported_grant_type", error_description: `grant_type ${grant} is not supported` };
  return "error" in r ? oauthJson(r, 400) : oauthJson(r);
}
export const OPTIONS = preflight;
