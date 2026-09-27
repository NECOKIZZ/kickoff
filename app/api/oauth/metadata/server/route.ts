import { authServerMetadata, publicOrigin } from "@/lib/oauth";
import { oauthJson, preflight } from "@/lib/oauthHttp";

/** RFC 8414 — served at /.well-known/oauth-authorization-server (next.config rewrites). */
export function GET(req: Request) {
  return oauthJson(authServerMetadata(publicOrigin(req)));
}
export const OPTIONS = preflight;
