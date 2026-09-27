import { registerClient } from "@/lib/oauth";
import { oauthJson, preflight } from "@/lib/oauthHttp";

/** POST /api/oauth/register — RFC 7591 dynamic client registration (open, as MCP clients expect). */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return oauthJson({ error: "invalid_client_metadata", error_description: "body must be JSON" }, 400);
  }
  const r = await registerClient(body);
  return "error" in r ? oauthJson(r, 400) : oauthJson(r, 201);
}
export const OPTIONS = preflight;
