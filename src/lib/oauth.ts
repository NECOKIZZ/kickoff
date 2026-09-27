import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AgentRow } from "@/lib/agents";

// ---------------------------------------------------------------------------
// OAuth 2.1 authorization server for the MCP endpoint, per the MCP
// authorization spec: protected-resource metadata (RFC 9728), server metadata
// (RFC 8414), dynamic client registration (RFC 7591), authorization code +
// PKCE S256 only, rotating refresh tokens. A grant acts for the owner's ONE
// agent with exactly the powers of a kagt_ key: it can place picks from the
// agent's balance and read, never withdraw or touch the owner's wallet.
// ---------------------------------------------------------------------------

export const OAUTH_SCOPE = "agent";
export const ACCESS_PREFIX = "koat_";
const REFRESH_PREFIX = "kort_";
const CODE_PREFIX = "koc_";
const CLIENT_PREFIX = "kcl_";
const SECRET_PREFIX = "kcs_";

export const ACCESS_TTL_S = 3600;
const REFRESH_TTL_MS = 90 * 86_400_000;
const CODE_TTL_MS = 5 * 60_000;
const MAX_REDIRECT_URIS = 10;

const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const secret = (prefix: string) => prefix + randomBytes(32).toString("base64url");

/** Public origin for metadata/links (PUBLIC_ORIGIN overrides a proxy's internal host). */
export function publicOrigin(req: Request): string {
  return (process.env.PUBLIC_ORIGIN ?? new URL(req.url).origin).replace(/\/$/, "");
}

export const mcpResource = (origin: string) => `${origin}/api/mcp`;
export const resourceMetadataUrl = (origin: string) => `${origin}/.well-known/oauth-protected-resource`;

export function protectedResourceMetadata(origin: string) {
  return {
    resource: mcpResource(origin),
    authorization_servers: [origin],
    scopes_supported: [OAUTH_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Kickoff agent",
    resource_documentation: `${origin}/llms.txt`,
  };
}

export function authServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    scopes_supported: [OAUTH_SCOPE],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    service_documentation: `${origin}/llms.txt`,
  };
}

// ── Pure checks ─────────────────────────────────────────────────────────────

/**
 * Redirect URIs a client may register: https anywhere, http only on
 * loopback (Claude Code, local tools), or an app's own scheme (cursor://).
 * Script-ish schemes and fragments are refused. The consent screen shows
 * the redirect host, so the owner sees where the code is going.
 */
export function redirectUriError(uri: unknown): string | null {
  if (typeof uri !== "string" || uri.length > 2000) return "redirect_uri must be a string";
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return `redirect_uri is not a valid URL: ${uri}`;
  }
  if (u.hash) return "redirect_uri must not contain a fragment";
  const scheme = u.protocol.slice(0, -1).toLowerCase();
  if (scheme === "https") return null;
  if (scheme === "http") {
    return ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) ? null : "http redirect_uri is only allowed for localhost";
  }
  if (["javascript", "data", "file", "vbscript", "blob", "about", "ftp", "ws", "wss"].includes(scheme))
    return `redirect_uri scheme ${scheme}: is not allowed`;
  return null;
}

/**
 * Exact match, except loopback URIs where RFC 8252 lets the port vary
 * (native apps pick a free port at run time).
 */
export function redirectUriAllowed(registered: string[], uri: string): boolean {
  if (registered.includes(uri)) return true;
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)) return false;
  return registered.some((r) => {
    try {
      const x = new URL(r);
      return x.protocol === u.protocol && x.hostname === u.hostname && x.pathname === u.pathname && x.search === u.search;
    } catch {
      return false;
    }
  });
}

export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Display host for the consent screen: "claude.ai", "localhost:3000", "cursor://". */
export function redirectHost(uri: string): string {
  try {
    const u = new URL(uri);
    return u.host || `${u.protocol}//`;
  } catch {
    return uri;
  }
}

// ── Clients (RFC 7591) ──────────────────────────────────────────────────────

export type OAuthError = { error: string; error_description: string };
const oauthError = (error: string, error_description: string): OAuthError => ({ error, error_description });

export async function registerClient(body: Record<string, unknown>) {
  const uris = body.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAX_REDIRECT_URIS)
    return oauthError("invalid_redirect_uri", `redirect_uris must list 1-${MAX_REDIRECT_URIS} URIs`);
  for (const u of uris) {
    const e = redirectUriError(u);
    if (e) return oauthError("invalid_redirect_uri", e);
  }
  const grantTypes = (body.grant_types as string[] | undefined) ?? ["authorization_code", "refresh_token"];
  if (!Array.isArray(grantTypes) || grantTypes.some((g) => g !== "authorization_code" && g !== "refresh_token"))
    return oauthError("invalid_client_metadata", "only authorization_code and refresh_token grants are supported");
  const authMethod = (body.token_endpoint_auth_method as string | undefined) ?? "none";
  if (!["none", "client_secret_post", "client_secret_basic"].includes(authMethod))
    return oauthError("invalid_client_metadata", `token_endpoint_auth_method ${authMethod} is not supported`);

  const rawName = typeof body.client_name === "string" ? body.client_name.trim() : "";
  const name = (rawName || "Unnamed app").slice(0, 80);
  const id = secret(CLIENT_PREFIX).slice(0, CLIENT_PREFIX.length + 24);
  const clientSecret = authMethod === "none" ? null : secret(SECRET_PREFIX);

  await db.insert(schema.oauthClients).values({
    id,
    name,
    redirectUris: uris as string[],
    secretHash: clientSecret ? sha256hex(clientSecret) : null,
  });
  return {
    client_id: id,
    ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: name,
    redirect_uris: uris,
    grant_types: grantTypes,
    response_types: ["code"],
    token_endpoint_auth_method: authMethod,
    scope: OAUTH_SCOPE,
  };
}

export async function getClient(id: string) {
  const [row] = await db.select().from(schema.oauthClients).where(eq(schema.oauthClients.id, id)).limit(1);
  return row ?? null;
}

/**
 * Token/revocation endpoint client auth. Public clients just name
 * themselves; confidential ones must present their secret (post or basic).
 */
export async function authenticateClient(req: Request, form: URLSearchParams) {
  let id = form.get("client_id");
  let sec = form.get("client_secret");
  const basic = req.headers.get("authorization");
  if (basic?.startsWith("Basic ")) {
    const [u, p] = Buffer.from(basic.slice(6), "base64").toString().split(":");
    id = decodeURIComponent(u ?? "");
    sec = decodeURIComponent(p ?? "");
  }
  if (!id) return null;
  const client = await getClient(id);
  if (!client) return null;
  if (client.secretHash) {
    if (!sec) return null;
    const a = Buffer.from(sha256hex(sec));
    const b = Buffer.from(client.secretHash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  }
  return client;
}

// ── Authorization ───────────────────────────────────────────────────────────

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  scope: string;
}

/**
 * Validate /oauth/authorize params. `fatal` errors must be shown on the page
 * (never redirect to an unverified URI); `redirect` errors go back to the
 * client per RFC 6749 §4.1.2.1.
 */
export async function checkAuthorize(
  p: URLSearchParams,
): Promise<
  | { ok: AuthorizeParams & { clientName: string } }
  | { fatal: string }
  | { redirect: string }
> {
  const clientId = p.get("client_id");
  if (!clientId) return { fatal: "client_id is missing" };
  const client = await getClient(clientId);
  if (!client) return { fatal: "This app is not registered with Kickoff. Try connecting again from the app." };
  const redirectUri = p.get("redirect_uri") ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : null);
  if (!redirectUri || !redirectUriAllowed(client.redirectUris, redirectUri))
    return { fatal: "The redirect address doesn't match what this app registered." };

  const state = p.get("state");
  const back = (error: string, desc: string) => {
    const u = new URL(redirectUri);
    u.searchParams.set("error", error);
    u.searchParams.set("error_description", desc);
    if (state) u.searchParams.set("state", state);
    return { redirect: u.toString() };
  };
  if (p.get("response_type") !== "code") return back("unsupported_response_type", "only response_type=code is supported");
  const codeChallenge = p.get("code_challenge");
  if (!codeChallenge || !/^[A-Za-z0-9\-_]{43}$/.test(codeChallenge))
    return back("invalid_request", "a PKCE code_challenge (S256) is required");
  if ((p.get("code_challenge_method") ?? "plain") !== "S256")
    return back("invalid_request", "code_challenge_method must be S256");
  // Every grant gets the one scope; unknown requested scopes are narrowed away.
  return { ok: { clientId, clientName: client.name, redirectUri, state, codeChallenge, scope: OAUTH_SCOPE } };
}

/** Owner approved: mint a one-time code and build the redirect back. */
export async function issueCode(a: AuthorizeParams, agentId: number): Promise<string> {
  const code = secret(CODE_PREFIX);
  await db.insert(schema.oauthCodes).values({
    codeHash: sha256hex(code),
    clientId: a.clientId,
    agentId,
    redirectUri: a.redirectUri,
    codeChallenge: a.codeChallenge,
    scopes: [a.scope],
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  const u = new URL(a.redirectUri);
  u.searchParams.set("code", code);
  if (a.state) u.searchParams.set("state", a.state);
  return u.toString();
}

export function denyRedirect(a: AuthorizeParams): string {
  const u = new URL(a.redirectUri);
  u.searchParams.set("error", "access_denied");
  u.searchParams.set("error_description", "The owner declined");
  if (a.state) u.searchParams.set("state", a.state);
  return u.toString();
}

// ── Tokens ──────────────────────────────────────────────────────────────────

function tokenPair() {
  const access = secret(ACCESS_PREFIX);
  const refresh = secret(REFRESH_PREFIX);
  const now = Date.now();
  return {
    access,
    refresh,
    row: {
      accessHash: sha256hex(access),
      accessExpiresAt: new Date(now + ACCESS_TTL_S * 1000),
      refreshHash: sha256hex(refresh),
      refreshExpiresAt: new Date(now + REFRESH_TTL_MS),
    },
  };
}

const tokenResponse = (access: string, refresh: string, scopes: string[]) => ({
  access_token: access,
  token_type: "Bearer",
  expires_in: ACCESS_TTL_S,
  refresh_token: refresh,
  scope: scopes.join(" "),
});

export async function exchangeCode(
  clientId: string,
  form: URLSearchParams,
): Promise<ReturnType<typeof tokenResponse> | OAuthError> {
  const code = form.get("code");
  const verifier = form.get("code_verifier");
  if (!code || !verifier) return oauthError("invalid_request", "code and code_verifier are required");
  // Single use: claim the code atomically.
  const [c] = await db
    .update(schema.oauthCodes)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(schema.oauthCodes.codeHash, sha256hex(code)),
        isNull(schema.oauthCodes.usedAt),
        gt(schema.oauthCodes.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!c || c.clientId !== clientId) return oauthError("invalid_grant", "code is invalid, expired or already used");
  const redirectUri = form.get("redirect_uri");
  if (redirectUri && redirectUri !== c.redirectUri) return oauthError("invalid_grant", "redirect_uri does not match");
  if (!pkceMatches(verifier, c.codeChallenge)) return oauthError("invalid_grant", "code_verifier does not match");

  const t = tokenPair();
  await db.insert(schema.oauthGrants).values({ clientId, agentId: c.agentId, scopes: c.scopes, ...t.row });
  return tokenResponse(t.access, t.refresh, c.scopes);
}

export async function refreshGrant(
  clientId: string,
  form: URLSearchParams,
): Promise<ReturnType<typeof tokenResponse> | OAuthError> {
  const refresh = form.get("refresh_token");
  if (!refresh) return oauthError("invalid_request", "refresh_token is required");
  const t = tokenPair();
  // Rotate in place: the old refresh token stops working the moment this lands.
  const [g] = await db
    .update(schema.oauthGrants)
    .set(t.row)
    .where(
      and(
        eq(schema.oauthGrants.refreshHash, sha256hex(refresh)),
        eq(schema.oauthGrants.clientId, clientId),
        isNull(schema.oauthGrants.revokedAt),
        gt(schema.oauthGrants.refreshExpiresAt, new Date()),
      ),
    )
    .returning();
  if (!g) return oauthError("invalid_grant", "refresh_token is invalid, expired or revoked");
  return tokenResponse(t.access, t.refresh, g.scopes);
}

/** RFC 7009: revoke by either token. Always "succeeds" for unknown tokens. */
export async function revokeByToken(clientId: string, token: string): Promise<void> {
  const h = sha256hex(token);
  const col = token.startsWith(REFRESH_PREFIX) ? schema.oauthGrants.refreshHash : schema.oauthGrants.accessHash;
  await db
    .update(schema.oauthGrants)
    .set({ revokedAt: new Date() })
    .where(and(eq(col, h), eq(schema.oauthGrants.clientId, clientId), isNull(schema.oauthGrants.revokedAt)));
}

/** Resolve a `koat_` access token to its agent (null if unknown/expired/revoked). */
export async function agentFromAccessToken(raw: string): Promise<AgentRow | null> {
  if (!raw.startsWith(ACCESS_PREFIX)) return null;
  const [hit] = await db
    .select({ grant: schema.oauthGrants, agent: schema.agents })
    .from(schema.oauthGrants)
    .innerJoin(schema.agents, eq(schema.agents.id, schema.oauthGrants.agentId))
    .where(
      and(
        eq(schema.oauthGrants.accessHash, sha256hex(raw)),
        isNull(schema.oauthGrants.revokedAt),
        gt(schema.oauthGrants.accessExpiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!hit) return null;
  db.update(schema.oauthGrants)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.oauthGrants.id, hit.grant.id))
    .catch(() => {});
  return hit.agent;
}
