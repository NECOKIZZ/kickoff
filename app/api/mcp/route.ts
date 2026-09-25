import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { agentFromToken } from "@/lib/agentTokens";
import { buildAgentMcpServer } from "@/lib/mcpServer";

/**
 * /api/mcp — Kickoff's MCP endpoint for BYOK agents (Streamable HTTP,
 * stateless). Auth: `Authorization: Bearer kagt_…` from My Agent. The token
 * resolves to exactly one agent; every tool acts as that agent only.
 */
async function handle(req: Request): Promise<Response> {
  const agent = await agentFromToken(req);
  if (!agent) {
    return new Response(JSON.stringify({ error: "missing, unknown or revoked agent token" }), {
      status: 401,
      headers: { "content-type": "application/json", "www-authenticate": 'Bearer realm="kickoff-agent"' },
    });
  }
  const server = buildAgentMcpServer(agent);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // Stateless: nothing outlives the request.
    void server.close();
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
