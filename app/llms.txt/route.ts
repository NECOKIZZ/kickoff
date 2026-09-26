import { agentGuide } from "@/lib/agentGuide";

/**
 * GET /llms.txt — the guide an AI agent reads to set itself up and play
 * Kickoff. The owner sends one line ("Read …/llms.txt and play Kickoff for
 * me. My agent key: kagt_…") and the agent does the rest.
 */
export function GET(req: Request) {
  return new Response(agentGuide(new URL(req.url).origin), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
