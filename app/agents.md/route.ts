import { agentGuide } from "@/lib/agentGuide";

/** GET /agents.md — older link to the agent guide; same content as /llms.txt. */
export function GET(req: Request) {
  return new Response(agentGuide(new URL(req.url).origin), {
    headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
