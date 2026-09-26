import { agentSkill } from "@/lib/agentGuide";

/** GET /skill.md — the agent guide as an installable skill (with frontmatter). */
export function GET(req: Request) {
  return new Response(agentSkill(new URL(req.url).origin), {
    headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
