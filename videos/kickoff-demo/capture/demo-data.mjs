// Demo data for the Kickoff demo video, served to the real app through Playwright route mocks.
// Amounts are micro-USDC strings. Pool payouts come from the real settlement engine
// (@kickoff/engine) run over this demo pool, so every number on screen follows the real maths.
import crypto from "node:crypto";
import { distanceA, settle, DEFAULT_PAYOUT_PARAMS } from "@kickoff/engine";

export const NOW = "2026-10-03T13:05:00Z"; // Sat of GW7
const usd = (d) => String(Math.round(d * 1e6));
const addr = (s) => "0x" + crypto.createHash("sha1").update("kickoff-demo:" + s).digest("hex");
export const ME = addr("me");
export const AGENT = addr("agent");

const params = { gamma: 3, stakeMode: "fixed", minStake: usd(10), maxStake: usd(10), fixedStake: usd(10), takeRateBps: 1000, capMultiple: 100 };
const mk = (id, gw, home, away, kickoffAt, status, positionCount, actual = null) => ({
  id, kind: "scoreline", status, title: `${home} v ${away}`, gameweek: gw, homeTeam: home, awayTeam: away, playerName: null,
  kickoffAt, locksAt: kickoffAt, params, escrowAddress: null, chainId: null,
  positionCount, totalPool: usd(positionCount * 10), actual,
});

export function markets(phase) {
  const ars = phase === "settled" ? mk(701, 7, "Arsenal", "Chelsea", "2026-10-03T16:30:00Z", "settled", 48, { home: 2, away: 1 })
    : phase.startsWith("live") ? mk(701, 7, "Arsenal", "Chelsea", "2026-10-03T16:30:00Z", "locked", 48)
    : mk(701, 7, "Arsenal", "Chelsea", "2026-10-03T16:30:00Z", "open", phase === "pre" ? 47 : 48);
  return [
    mk(611, 6, "Newcastle", "Tottenham", "2026-09-26T11:30:00Z", "settled", 36, { home: 2, away: 1 }),
    mk(612, 6, "Man City", "Brighton", "2026-09-26T14:00:00Z", "settled", 31, { home: 3, away: 0 }),
    mk(613, 6, "Aston Villa", "Everton", "2026-09-27T13:00:00Z", "settled", 24, { home: 1, away: 1 }),
    ars,
    mk(702, 7, "Liverpool", "Man United", "2026-10-03T11:30:00Z", "locked", 52),
    mk(703, 7, "Brentford", "Fulham", "2026-10-03T14:00:00Z", "open", 18),
    mk(704, 7, "Crystal Palace", "Wolves", "2026-10-03T14:00:00Z", "open", 15),
    mk(705, 7, "West Ham", "Bournemouth", "2026-10-04T13:00:00Z", "open", 21),
    mk(706, 7, "Tottenham", "Aston Villa", "2026-10-04T15:30:00Z", "open", 29),
    // GW8: listed automatically about a week out
    mk(801, 8, "Man City", "Arsenal", "2026-10-17T11:30:00Z", "open", 6),
    mk(802, 8, "Chelsea", "Liverpool", "2026-10-17T14:00:00Z", "open", 4),
    mk(803, 8, "Newcastle", "Brighton", "2026-10-17T14:00:00Z", "open", 3),
    mk(804, 8, "Everton", "West Ham", "2026-10-17T14:00:00Z", "open", 2),
    mk(805, 8, "Fulham", "Crystal Palace", "2026-10-18T13:00:00Z", "open", 2),
    mk(806, 8, "Man United", "Tottenham", "2026-10-18T15:30:00Z", "open", 5),
  ];
}

// Crowd for Arsenal v Chelsea — deterministic, weighted to realistic scorelines.
const PICKS = [[2,1,9],[1,1,7],[2,0,6],[1,0,6],[3,1,4],[2,2,3],[1,2,3],[0,0,2],[3,0,2],[0,1,2],[3,2,1],[4,1,1],[0,2,1]];
const AGENTS = { 2: "xG Monk", 9: "Home Banker", 17: "Low Block", 31: "Form Reader" };
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const bag = PICKS.flatMap(([h, a, w]) => Array(w).fill([h, a]));
const CROWD = Array.from({ length: 47 }, (_, i) => {
  let [h, a] = bag[Math.floor(rnd() * bag.length)];
  if (i === 31) [h, a] = [2, 1]; // the Form Reader agent: matches its run log
  return { id: 9000 + i, address: i === 31 ? AGENT : addr("t" + i), guessHome: h, guessAway: a, guessPoints: null, stake: usd(10), isWinner: null, distanceD: null, payout: null, agentName: AGENTS[i] ?? null };
});
export const MY_POS_ID = 9100;
const MINE = { id: MY_POS_ID, address: ME, guessHome: 2, guessAway: 1, guessPoints: null, stake: usd(10), isWinner: null, distanceD: null, payout: null, agentName: null };

export function pool(phase) {
  return phase === "pre" ? CROWD : [...CROWD.slice(0, 20), MINE, ...CROWD.slice(20)];
}

/** Run the real engine on the pool for a given scoreline. */
export function settleAt(h, a) {
  const ps = pool("placed");
  const r = settle(ps.map((p) => ({ stake: BigInt(p.stake), d: distanceA(p.guessHome, p.guessAway, h, a) })), DEFAULT_PAYOUT_PARAMS);
  return { r, ps };
}

export function settledPositions() {
  const { r, ps } = settleAt(2, 1);
  return ps.map((p, i) => ({ ...p, isWinner: r.outcomes[i].isWinner, payout: String(r.outcomes[i].payout), capped: r.outcomes[i].capped }));
}

const CLOCK = [["KO", 0, 0], ["8'", 0, 0], ["12'", 1, 0], ["25'", 1, 0], ["38'", 1, 0], ["HT", 1, 0], ["52'", 1, 0], ["58'", 1, 1], ["66'", 1, 1], ["74'", 1, 1], ["81'", 2, 1], ["88'", 2, 1]];
export function timeline(upto) {
  const snaps = CLOCK.slice(0, upto).map(([clock, h, a], i) => {
    const { r, ps } = settleAt(h, a);
    const gains = ps.map((p, j) => BigInt(r.outcomes[j].payout) - BigInt(p.stake));
    const sorted = [...gains].sort((x, y) => (y > x ? 1 : y < x ? -1 : 0));
    return {
      id: i + 1, matchClock: clock, scoreHome: h, scoreAway: a, livePoints: null, at: NOW,
      positions: ps.map((p, j) => ({ positionId: p.id, stake: p.stake, isWinner: r.outcomes[j].isWinner, estimatedPayout: String(r.outcomes[j].payout), estimatedGain: String(gains[j]), rank: sorted.indexOf(gains[j]) + 1 })),
    };
  });
  return { marketId: 701, kind: "scoreline", snapshots: snaps };
}

export const accumulator = { season: "2026-27", balance: usd(1284.5), contributions: 63, rankWeightsBps: [2500, 1800, 1300, 1000, 900, 800, 600, 500, 350, 250], recentContributions: [] };

const lb = (rank, address, settledMarkets, car, score, agent = null) =>
  ({ address, settledMarkets, volume: usd(settledMarkets * 10), car, volumeMultiplier: 1, score, rank, agent });
export const leaderboard = {
  eligibleTraders: 214, totalTraders: 388, params: { minSettledMarkets: 5 },
  leaderboard: [
    lb(1, addr("l1"), 38, 0.71, 2.94),
    lb(2, AGENT, 41, 0.68, 2.83, { name: "Form Reader", owner: ME }),
    lb(3, addr("l3"), 29, 0.69, 2.71),
    lb(4, ME, 33, 0.64, 2.55),
    lb(5, addr("l5"), 44, 0.6, 2.49, { name: "xG Monk", owner: null }),
    lb(6, addr("l6"), 21, 0.66, 2.38),
    lb(7, addr("l7"), 36, 0.57, 2.31),
    lb(8, addr("l8"), 18, 0.63, 2.22, { name: "Home Banker", owner: addr("hb") }),
    lb(9, addr("l9"), 27, 0.55, 2.1),
    lb(10, addr("l10"), 15, 0.6, 2.02),
  ],
};

export const soulMd = `# Form Reader

## How I predict
- Lean on the last six results and home advantage.
- Big favourites at home: back a win by 2.
- Evenly matched sides: call a low-scoring draw (1-1).

## When to sit out
- Skip matches where I have no real edge.
`;

export const agentMe = (created) => ({
  agent: created ? { id: 12, name: "Form Reader", walletAddress: AGENT, mode: "managed", status: "active", publicIdentity: true, soulMd } : null,
  agentAddress: AGENT, onChain: false, vault: { balance: usd(120), paused: false }, link: { typedData: {} },
});

export const agentRuns = {
  runs: [
    { id: 41, status: "ok", trigger: "matchday", error: null, createdAt: "2026-10-03T09:00:00Z", picks: [
      { marketId: 701, title: "Arsenal v Chelsea", home: 2, away: 1, why: "Arsenal unbeaten in six at home; Chelsea concede late", placed: true },
      { marketId: 702, title: "Liverpool v Man United", home: 2, away: 0, why: "big home favourite, back a win by 2", placed: true },
      { marketId: 704, title: "Crystal Palace v Wolves", home: 1, away: 1, why: "evenly matched, low-scoring draw", placed: true },
    ]},
    { id: 37, status: "ok", trigger: "matchday", error: null, createdAt: "2026-09-26T09:00:00Z", picks: [
      { marketId: 611, title: "Newcastle v Tottenham", home: 2, away: 1, why: "Newcastle strong at home; Spurs score away", placed: true },
      { marketId: 612, title: "Man City v Brighton", home: 2, away: 0, why: "big home favourite, back a win by 2", placed: true },
      { marketId: 613, title: "Aston Villa v Everton", home: 2, away: 0, why: "Villa in form at home", placed: true },
    ]},
    { id: 33, status: "ok", trigger: "matchday", error: null, createdAt: "2026-09-19T09:00:00Z", picks: [] },
  ],
};

// Agent results reuse the docs' worked-example outcomes (exact +$23.23, close +$3.77, wrong winner −$10).
export const agentPositions = {
  positions: [
    { position: { id: 7001, marketId: 611, guessHome: 2, guessAway: 1, guessPoints: null, stake: usd(10), payout: usd(33.23) }, marketTitle: "Newcastle v Tottenham", marketKind: "scoreline", marketStatus: "settled", kickoffAt: "2026-09-26T11:30:00Z" },
    { position: { id: 7002, marketId: 612, guessHome: 2, guessAway: 0, guessPoints: null, stake: usd(10), payout: usd(13.77) }, marketTitle: "Man City v Brighton", marketKind: "scoreline", marketStatus: "settled", kickoffAt: "2026-09-26T14:00:00Z" },
    { position: { id: 7003, marketId: 613, guessHome: 2, guessAway: 0, guessPoints: null, stake: usd(10), payout: "0" }, marketTitle: "Aston Villa v Everton", marketKind: "scoreline", marketStatus: "settled", kickoffAt: "2026-09-27T13:00:00Z" },
  ],
};
