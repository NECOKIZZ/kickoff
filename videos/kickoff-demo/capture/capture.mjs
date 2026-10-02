// Drives the REAL Kickoff app (local `next dev`) with demo data and captures every state the
// demo video needs, at 2x, plus element boxes (CSS px) for camera moves, rings and cursors.
//
//   1. INVITE_COOKIE_SECRET=demo-local-secret npx next dev -p 3100     (repo root, no Privy env)
//   2. npx tsx videos/kickoff-demo/capture/render-cards.mjs
//   3. npx tsx videos/kickoff-demo/capture/capture.mjs
//
// /api/* is answered from demo-data.mjs; fonts come from capture/fontcache (headless Chrome
// can't reach the font CDNs through the proxy). Nothing touches a database or the live site.
const { chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs");
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as D from "./demo-data.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(HERE, "../assets/shots");
const BASE = "http://localhost:3100";
fs.mkdirSync(OUT, { recursive: true });

// Local invite cookie, signed with the local dev server's secret.
const payload = `v1.1.${Math.floor(Date.now() / 1000) + 86400 * 30}`;
const sig = crypto.createHmac("sha256", "demo-local-secret").update(payload).digest("base64url");

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
await ctx.addCookies([{ name: "kickoff_invite", value: `${payload}.${sig}`, url: BASE }]);
await ctx.addInitScript((me) => localStorage.setItem("kickoff-dev-address", me), D.ME);

let phase = "pre";
let liveUpto = 3;
let agentCreated = true;

const json = (r, body) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
const fontFile = (u) => path.join(HERE, "fontcache", crypto.createHash("sha1").update(u).digest("hex").slice(0, 16) + ".woff2");

await ctx.route(/fonts\.googleapis\.com|api\.fontshare\.com|fonts\.gstatic\.com|cdn\.fontshare\.com/, (r) => {
  const u = r.request().url();
  if (u.includes("fonts.googleapis.com")) return r.fulfill({ contentType: "text/css", body: fs.readFileSync(path.join(HERE, "fontcache/google.css")) });
  if (u.includes("api.fontshare.com")) return r.fulfill({ contentType: "text/css", body: fs.readFileSync(path.join(HERE, "fontcache/clash.css")) });
  const f = fontFile(u);
  return fs.existsSync(f) ? r.fulfill({ contentType: "font/woff2", body: fs.readFileSync(f) }) : r.fulfill({ status: 404, body: "" });
});

await ctx.route("**/api/**", (r) => {
  const p = new URL(r.request().url()).pathname;
  const method = r.request().method();
  if (p === "/api/markets") return json(r, { markets: D.markets(phase) });
  if (p === "/api/accumulator") return json(r, D.accumulator);
  if (p === "/api/leaderboard") return json(r, D.leaderboard);
  if (p === "/api/agents/me") return json(r, D.agentMe(agentCreated));
  if (p === "/api/agents/me/runs") return json(r, D.agentRuns);
  if (p.startsWith(`/api/users/${D.AGENT}`)) return json(r, D.agentPositions);
  const card = p.match(/^\/api\/positions\/(\d+)\/card$/);
  if (card) {
    const w = new URL(r.request().url()).searchParams.get("w") === "2000" ? 2000 : 1200;
    const f = +card[1] === D.MY_POS_ID ? "me-701" : "agent-611";
    return r.fulfill({ contentType: "image/png", body: fs.readFileSync(path.join(HERE, `cards/${f}-${w}.png`)) });
  }
  const m = p.match(/^\/api\/markets\/(\d+)(\/.*)?$/);
  if (m) {
    const s = D.markets(phase).find((x) => x.id === +m[1]);
    if (m[2] === "/timeline") return json(r, phase.startsWith("live") || phase === "settled" ? D.timeline(phase === "settled" ? 12 : liveUpto) : { marketId: s.id, kind: "scoreline", snapshots: [] });
    if (m[2] === "/estimate") {
      // Real engine: how many would win if it settled now (the app shows a count, never a payout).
      const q = new URL(r.request().url()).searchParams;
      const { r: res } = D.settleAt(+q.get("home"), +q.get("away"));
      return json(r, { positions: res.outcomes.map((o) => ({ isWinner: o.isWinner })) });
    }
    if (m[2] === "/positions" && method === "POST") { phase = "placed"; return json(r, { ok: true }); }
    const positions = phase === "settled" ? D.settledPositions() : D.pool(phase);
    return json(r, { market: { ...s, ...s.params, actualHome: s.actual?.home ?? null, actualAway: s.actual?.away ?? null, actualPoints: null }, positions, settlement: null });
  }
  console.log("unmocked", method, p);
  return json(r, {});
});

const page = await ctx.newPage();
await page.clock.setFixedTime(new Date(D.NOW));
const boxes = {};
const HIDE = "nextjs-portal{display:none!important} *{caret-color:transparent!important}";
const settleUi = async (ms = 900) => { await page.addStyleTag({ content: HIDE }).catch(() => {}); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(ms); };
const go = async (url) => { await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 120000 }); await settleUi(1500); };
const shot = async (name, full = false) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  boxes[`${name}.__h`] = full ? h : 1080;
  console.log("shot", name, full ? `(full ${h})` : "");
};
const box = async (key, loc) => {
  const b = await loc.first().boundingBox().catch(() => null);
  if (!b) { console.log("no box", key); return; }
  const sy = await page.evaluate(() => window.scrollY);
  boxes[key] = [b.x, b.y + sy, b.width, b.height].map(Math.round);
};
const byText = (t, exact = true) => page.getByText(t, { exact });

// ── Markets hub: GW7 (default) and GW8 ───────────────────────────────────────
await go("/markets");
await box("gw6", page.getByRole("tab", { name: "GW6" }));
await box("gw7", page.getByRole("tab", { name: "GW7" }));
await box("gw8", page.getByRole("tab", { name: "GW8" }));
await box("row_live", page.locator("a[href='/markets/702']"));
await box("row_ars", page.locator("a[href='/markets/701']"));
await shot("markets-gw7");
await page.getByRole("tab", { name: "GW8" }).click(); await settleUi(500);
await box("gw8_list", page.locator("a[href^='/markets/80']").first());
await box("gw8_last", page.locator("a[href='/markets/806']"));
await shot("markets-gw8");
await page.getByRole("tab", { name: "GW6" }).click(); await settleUi(500);
await shot("markets-gw6");

// ── Matchday staking on Arsenal v Chelsea ─────────────────────────────────────
phase = "pre";
await go("/markets/701");
await box("m_spec", page.locator(".card-diagonal").filter({ hasText: "Total pool" }));
await box("m_stake", page.locator(".card-diagonal").filter({ hasText: "Your guess" }));
await box("m_grid", page.locator(".card-diagonal").filter({ hasText: "Pool concentration" }));
await box("m_home_plus", page.getByLabel("Home +1"));
await box("m_away_plus", page.getByLabel("Away +1"));
await box("m_lock", page.getByRole("button", { name: "Lock it in" }));
await box("m_estimate", byText("If it settled now", false));
await box("m_rules", page.locator(".card-diagonal").filter({ hasText: "Total pool" }).getByText("Stakes", { exact: true }));
await shot("m-00");
await page.getByLabel("Home +1").click(); await settleUi(600); await shot("m-10");
await page.getByLabel("Home +1").click(); await settleUi(600); await shot("m-20");
await page.getByLabel("Away +1").click(); await settleUi(600); await shot("m-21");
await page.getByRole("button", { name: "Lock it in" }).click();
await page.getByText("Position placed", { exact: false }).waitFor({ timeout: 15000 });
await settleUi(1200);
await box("m_msg", byText("Position placed", false));
await box("m_restake", page.getByRole("button", { name: "Restake" }));
// my cell in the grid: row 2 (home) / col 1 (away)
const gridCells = page.locator(".card-diagonal").filter({ hasText: "Pool concentration" }).locator("div").filter({ hasText: /^\d+%$/ });
console.log("grid cells with %", await gridCells.count());
await box("m_cell21", page.locator('[title^="2-1 ·"]'));
await box("m_cell11", page.locator('[title^="1-1 ·"]'));
await box("m_badge", page.locator(".card-diagonal").filter({ hasText: "Total pool" }).getByText("Open", { exact: false }).first());
await shot("m-placed");
await box("m_board", page.locator("section").filter({ hasText: "Pool participants" }));
{ const tr = page.locator("section").filter({ hasText: "Pool participants" }).locator("tbody tr");
  for (let i = 0; i < 12; i++) await box(`m_row${i + 1}`, tr.nth(i)); }
await shot("m-placed-full", true);

// ── Live: Live PnL fills as goals go in ───────────────────────────────────────
for (const [i, upto] of [[1, 2], [2, 4], [3, 9], [4, 12]]) {
  phase = "live"; liveUpto = upto;
  await go("/markets/701");
  if (i === 1) {
    await box("l_chart", page.locator(".card-diagonal").filter({ hasText: "Live PnL" }).filter({ has: page.locator("svg") }));
    await box("l_spec", page.locator(".card-diagonal").filter({ hasText: "Total pool" }));
  }
  await shot(`live-${i}`);
}

// ── Settled: result, PnL card, pool participants with payouts ───────────────────
phase = "settled";
await go("/markets/701");
await page.waitForTimeout(1500);
await box("s_card", page.locator(".card-diagonal").filter({ hasText: "Your result" }));
await box("s_spec", page.locator(".card-diagonal").filter({ hasText: "Total pool" }));
await box("s_board", page.locator("section").filter({ hasText: "Pool participants" }));
{ const tr = page.locator("section").filter({ hasText: "Pool participants" }).locator("tbody tr");
  const n = await tr.count();
  for (let i = 0; i < n; i++) await box(`s_row${i + 1}`, tr.nth(i)); }
await box("s_pnl", page.locator(".card-diagonal").filter({ hasText: "Live PnL" }).filter({ has: page.locator("svg") }));
await shot("settled-full", true);

// ── My Agent: create (Managed / BYOK), then the running agent ─────────────────────
agentCreated = false;
await go("/agent");
await box("a_intro", byText("You fund it, and only you can withdraw", false));
await page.getByPlaceholder("Dave's Predictor").fill("Form Reader");
await box("a_name", page.getByPlaceholder("Dave's Predictor"));
await box("a_modes", byText("Kickoff runs it").locator("xpath=ancestor::div[contains(@class,'grid')][1]"));
await box("a_managed", byText("Kickoff runs it").locator("xpath=ancestor::button[1]"));
await box("a_byok", byText("Bring your own AI").locator("xpath=ancestor::button[1]"));
await page.locator("textarea").fill("");
await settleUi(300);
await shot("agent-create-empty");
await box("a_soul", page.locator("textarea"));
await page.locator("textarea").fill(D.soulMd);
await settleUi(300);
await shot("agent-create-soul");
await box("a_create", page.getByRole("button", { name: "Create agent" }));
agentCreated = true;
await go("/agent");
await box("a_head", page.locator(".card-diagonal").filter({ hasText: "Pause agent" }));
await box("a_balance", page.locator(".card-diagonal").filter({ hasText: "Agent balance" }));
await box("a_results", page.locator(".card-diagonal").filter({ hasText: "Results" }).filter({ hasText: "Newcastle" }).last());
await box("a_runs", page.locator(".card-diagonal").filter({ hasText: "Recent runs" }));
await box("a_bal_note", byText("Each pick stakes", false));
await box("a_card_btn", page.getByRole("button", { name: "Card" }));
await shot("agent-full", true);
await page.getByRole("button", { name: "Card" }).first().click();
await page.waitForTimeout(2500);
await settleUi(300);
await box("modal_img", page.locator("img[src*='/card']").last());
await shot("agent-card-modal");

// ── Leaderboard: accumulator + season board ────────────────────────────────────
await go("/leaderboard");
await box("lb_acc", page.locator(".card-diagonal").filter({ hasText: "accumulator pool" }));
await box("lb_table", page.locator("table"));
const rows = page.locator("tbody tr");
for (let i = 0; i < (await rows.count()); i++) await box(`lb_row${i + 1}`, rows.nth(i));
await box("lb_car", page.locator("th", { hasText: "CAR" }));
await box("lb_amount", page.locator(".card-diagonal").filter({ hasText: "accumulator pool" }).locator("p").nth(1));
await box("lb_note", byText("5% of every settled pool", false));
await shot("leaderboard");

fs.writeFileSync(`${OUT}/boxes.json`, JSON.stringify(boxes, null, 1));
console.log("boxes", Object.keys(boxes).length);
await browser.close();
