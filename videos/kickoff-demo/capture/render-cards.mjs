// Renders real Kickoff PnL share cards with the app's own renderer, for the demo's positions.
// Run from the repo root: npx tsx videos/kickoff-demo/capture/render-cards.mjs
import { writeFile } from "node:fs/promises";
import { buildPnlCardView } from "@/lib/pnlCard";
import { renderPnlCard } from "@/lib/pnlCardImage";
import { clubFor } from "@/ui/markets/clubs";
import { settledPositions, MY_POS_ID } from "./demo-data.mjs";

const u = (d) => BigInt(Math.round(d * 1e6));
const code = (n) => clubFor(n)?.code ?? null;
const out = (f) => `videos/kickoff-demo/capture/cards/${f}`;

// You on Arsenal v Chelsea: the engine's settlement of the demo pool.
const field701 = settledPositions().map((p) => ({ id: p.id, stake: BigInt(p.stake), payout: BigInt(p.payout) }));
const mine = field701.find((p) => p.id === MY_POS_ID);
// The agent on Newcastle v Tottenham: the docs' worked example (five $10 stakes, 2-1 pays $33.23).
const field611 = [33.23, 13.77, 0, 0, 0].map((p, i) => ({ id: i + 1, stake: u(10), payout: u(p) }));

const cards = [
  { file: "me-701", home: "Arsenal", away: "Chelsea", field: field701, position: { ...mine, guessHome: 2, guessAway: 1, guessPoints: null } },
  { file: "agent-611", home: "Newcastle", away: "Tottenham", field: field611, position: { ...field611[0], guessHome: 2, guessAway: 1, guessPoints: null }, agentName: "Form Reader" },
];
for (const c of cards) {
  const view = buildPnlCardView(
    { kind: "scoreline", homeTeam: c.home, awayTeam: c.away, playerName: null, actualHome: 2, actualAway: 1, actualPoints: null, position: c.position, field: c.field },
    code,
  );
  for (const w of [1200, 2000]) {
    const res = await renderPnlCard(view, w, { agentName: c.agentName });
    await writeFile(out(`${c.file}-${w}.png`), Buffer.from(await res.arrayBuffer()));
  }
  console.log(c.file, view.sign + view.amount, `rank ${view.rank}/${view.of}`);
}
