import { protectedResourceMetadata, publicOrigin } from "@/lib/oauth";
import { oauthJson, preflight } from "@/lib/oauthHttp";

/** RFC 9728 — served at /.well-known/oauth-protected-resource[/api/mcp] (next.config rewrites). */
export function GET(req: Request) {
  return oauthJson(protectedResourceMetadata(publicOrigin(req)));
}
export const OPTIONS = preflight;
