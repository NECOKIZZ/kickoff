import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { agentFromToken } from "@/lib/agentTokens";
import { buildAgentMcpServer } from "@/lib/mcpServer";
import { agentFromAccessToken, publicOrigin, resourceMetadataUrl } from "@/lib/oauth";

/**
 * /api/mcp — Kickoff's MCP endpoint for BYOK agents (Streamable HTTP,
 * stateless). Auth: `Authorization: Bearer kagt_…` from My Agent, or an
 * OAuth access token (`koat_…`) from a connector the owner approved. Either
 * resolves to exactly one agent; every tool acts as that agent only. The 401
 * points connectors at the OAuth discovery document (RFC 9728).
 */
async function handle(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const agent = (await agentFromToken(req)) ?? (bearer ? await agentFromAccessToken(bearer) : null);
  if (!agent) {
    const meta = resourceMetadataUrl(publicOrigin(req));
    return new Response(JSON.stringify({ error: "missing, unknown, expired or revoked agent token" }), {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": `Bearer realm="kickoff-agent", resource_metadata="${meta}"${bearer ? ', error="invalid_token"' : ""}`,
      },
    });
  }
  const server = buildAgentMcpServer(agent, publicOrigin(req));
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(await acceptJson(req));
  } finally {
    // Stateless: nothing outlives the request.
    void server.close();
  }
}

/**
 * Plain-HTTP agents (curl, fetch) often send only `Accept: application/json`,
 * which the MCP transport rejects with 406. Replies are always JSON here
 * (enableJsonResponse), so add the SSE type the spec asks clients to accept.
 */
async function acceptJson(req: Request): Promise<Request> {
  const accept = req.headers.get("accept") ?? "";
  if (req.method !== "POST" || accept.includes("text/event-stream")) return req;
  const headers = new Headers(req.headers);
  headers.set("accept", "application/json, text/event-stream");
  return new Request(req.url, { method: "POST", headers, body: await req.text() });
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
