import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {}, schema: {} }));
const { pkceMatches, redirectHost, redirectUriAllowed, redirectUriError, authServerMetadata } = await import("@/lib/oauth");

describe("redirectUriError", () => {
  it("accepts https, loopback http and app schemes", () => {
    expect(redirectUriError("https://claude.ai/api/mcp/auth_callback")).toBeNull();
    expect(redirectUriError("https://chatgpt.com/connector_platform_oauth_redirect")).toBeNull();
    expect(redirectUriError("http://localhost:33418/callback")).toBeNull();
    expect(redirectUriError("http://127.0.0.1/cb")).toBeNull();
    expect(redirectUriError("cursor://anysphere.cursor-retrieval/oauth/callback")).toBeNull();
  });
  it("refuses remote http, script schemes and fragments", () => {
    expect(redirectUriError("http://evil.com/cb")).not.toBeNull();
    expect(redirectUriError("javascript:alert(1)")).not.toBeNull();
    expect(redirectUriError("data:text/html,hi")).not.toBeNull();
    expect(redirectUriError("https://a.com/cb#x")).not.toBeNull();
    expect(redirectUriError(42)).not.toBeNull();
  });
});

describe("redirectUriAllowed", () => {
  it("is exact for https", () => {
    expect(redirectUriAllowed(["https://claude.ai/cb"], "https://claude.ai/cb")).toBe(true);
    expect(redirectUriAllowed(["https://claude.ai/cb"], "https://claude.ai/cb2")).toBe(false);
  });
  it("lets the loopback port vary (RFC 8252) but nothing else", () => {
    expect(redirectUriAllowed(["http://localhost:1234/cb"], "http://localhost:5678/cb")).toBe(true);
    expect(redirectUriAllowed(["http://localhost:1234/cb"], "http://localhost:5678/other")).toBe(false);
    expect(redirectUriAllowed(["http://localhost:1234/cb"], "http://127.0.0.1:1234/cb")).toBe(false);
  });
});

describe("pkceMatches", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  it("verifies S256", () => {
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"); // RFC 7636 appendix B
    expect(pkceMatches(verifier, challenge)).toBe(true);
    expect(pkceMatches(verifier.replace("d", "e"), challenge)).toBe(false);
    expect(pkceMatches("short", challenge)).toBe(false);
  });
});

describe("metadata", () => {
  it("advertises PKCE S256, DCR and the endpoints", () => {
    const m = authServerMetadata("https://kickoff.cash");
    expect(m.code_challenge_methods_supported).toEqual(["S256"]);
    expect(m.registration_endpoint).toBe("https://kickoff.cash/api/oauth/register");
    expect(m.authorization_endpoint).toBe("https://kickoff.cash/oauth/authorize");
  });
  it("shows a readable redirect host", () => {
    expect(redirectHost("https://claude.ai/api/mcp/auth_callback")).toBe("claude.ai");
    expect(redirectHost("cursor://x/cb")).toBe("x");
  });
});
