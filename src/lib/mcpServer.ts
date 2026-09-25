// Kickoff MCP server for BYOK agents. One server instance per request
// (stateless Streamable HTTP), bound to the ONE agent the bearer token
// belongs to. Every tool acts as that agent and nothing else.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db, schema } from "@/db";
import { and, desc, eq } from "drizzle-orm";
import type { AgentRow } from "@/lib/agents";
import { buildDataPack, openScoreFixtures } from "@/lib/dataPack";
import { computeLeaderboard } from "@/lib/leaderboard";
import { placeAgentPrediction } from "@/lib/agentPlacement";
import { AGENTS_ON_CHAIN, agentVaultState } from "@/lib/chain";
import type { Hex } from "viem";

const text = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2) }],
});
const failure = (msg: string) => ({ content: [{ type: "text" as const, text: msg }], isError: true });

export function buildAgentMcpServer(agent: AgentRow): McpServer {
  const server = new McpServer(
    { name: "kickoff", version: "1.0.0" },
    {
      instructions:
        `You are "${agent.name}", a Kickoff prediction agent for Premier League Score markets. ` +
        "Call list_open_markets to see what you can play, get_match_data for fixtures, results and form, " +
        "then place_prediction with a scoreline. The stake is fixed by each market and paid from your agent " +
        "balance automatically. One pick per market; you can change it until the market locks at kickoff. " +
        "Full rules, scoring and errors: /agents.md on this site.",
    },
  );

  server.registerTool(
    "list_open_markets",
    {
      title: "List open markets",
      description:
        "Open Premier League Score markets you can predict on, soonest first, with your current pick (if any) and your balance.",
      inputSchema: {},
    },
    async () => {
      const fixtures = await openScoreFixtures();
      const mine = await db
        .select({ marketId: schema.positions.marketId, h: schema.positions.guessHome, a: schema.positions.guessAway })
        .from(schema.positions)
        .where(eq(schema.positions.userId, agent.agentUserId));
      const pick = new Map(mine.map((p) => [p.marketId, `${p.h}-${p.a}`]));
      const vault = AGENTS_ON_CHAIN ? await agentVaultState(agent.walletAddress as Hex).catch(() => null) : null;
      return text({
        agent: { name: agent.name, status: agent.status, balanceUsdc: vault ? Number(vault.balance) / 1e6 : null },
        markets: fixtures.map((f) => ({ ...f, yourPick: pick.get(f.marketId) ?? null })),
      });
    },
  );

  server.registerTool(
    "get_match_data",
    {
      title: "Get match data",
      description:
        "Kickoff's data pack: open fixtures, this season's Premier League results, each team's form (W/D/L, goals, " +
        "home/away splits) and the league table. " +
        "Pass market_id to narrow it to one fixture's two teams.",
      inputSchema: { market_id: z.number().int().positive().optional() },
    },
    async ({ market_id }) => {
      const pack = await buildDataPack();
      if (market_id == null) return text(pack);
      const f = pack.openFixtures.find((x) => x.marketId === market_id);
      if (!f) return failure(`market ${market_id} is not an open Score market`);
      const teams = new Set([f.home, f.away]);
      return text({
        fixture: f,
        scoring: pack.scoring,
        teamForm: { [f.home]: pack.teamForm[f.home] ?? null, [f.away]: pack.teamForm[f.away] ?? null },
        table: pack.table,
        recentResults: pack.recentResults.filter((r) => teams.has(r.home) || teams.has(r.away)),
        notes: pack.notes,
      });
    },
  );

  server.registerTool(
    "place_prediction",
    {
      title: "Place prediction",
      description:
        "Predict the final score of an open market. Stakes the market's fixed amount from your agent balance " +
        "(first pick only; changing your pick before lock is free).",
      inputSchema: {
        market_id: z.number().int().positive(),
        home: z.number().int().min(0).max(20),
        away: z.number().int().min(0).max(20),
      },
    },
    async ({ market_id, home, away }) => {
      const r = await placeAgentPrediction(agent, market_id, home, away, "mcp");
      if (!r.ok) return failure(r.error);
      return text({
        placed: `${r.home}-${r.away}`,
        marketId: r.marketId,
        stakeUsdc: Number(r.stake) / 1e6,
        changedExistingPick: r.restake,
        txHash: r.txHash,
      });
    },
  );

  server.registerTool(
    "get_positions",
    {
      title: "Get positions",
      description: "Your current and past predictions with results and payouts.",
      inputSchema: {},
    },
    async () => {
      const rows = await db
        .select({ p: schema.positions, m: schema.markets })
        .from(schema.positions)
        .innerJoin(schema.markets, eq(schema.markets.id, schema.positions.marketId))
        .where(and(eq(schema.positions.userId, agent.agentUserId)))
        .orderBy(desc(schema.markets.kickoffAt))
        .limit(100);
      return text(
        rows.map(({ p, m }) => ({
          marketId: m.id,
          match: `${m.homeTeam ?? m.title} v ${m.awayTeam ?? ""}`.trim(),
          kickoffAt: m.kickoffAt,
          status: m.status,
          pick: `${p.guessHome}-${p.guessAway}`,
          stakeUsdc: Number(p.stake) / 1e6,
          result: m.actualHome != null ? `${m.actualHome}-${m.actualAway}` : null,
          won: p.isWinner,
          payoutUsdc: p.payout != null ? Number(p.payout) / 1e6 : null,
        })),
      );
    },
  );

  server.registerTool(
    "get_leaderboard",
    {
      title: "Get leaderboard",
      description: "Season standings. Humans and agents rank together; agents are labelled.",
      inputSchema: {},
    },
    async () => {
      const lb = await computeLeaderboard();
      return text({ ...lb, leaderboard: lb.leaderboard.slice(0, 50), you: agent.walletAddress });
    },
  );

  return server;
}
