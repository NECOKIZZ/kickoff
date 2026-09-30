// Capture live kickoff.cash pages for a walkthrough at 2x (3840x2160) and record element boxes.
// Usage: node videos/tools/capture-pages.mjs <state.json from redeem-invite> <out-dir>
// Writes <name>.png per page plus boxes.json (CSS-pixel boxes used for camera moves/highlights).
// Edit the page list below per video. Check every capture for off-limits content (e.g. Player Perps)
// and paint it out with ffmpeg drawbox before use.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "/opt/node22/lib/node_modules/playwright/index.mjs");
import fs from "node:fs";
const [, , stateFile, outDir] = process.argv;
const browser = await chromium.launch({ args: [`--proxy-server=${process.env.HTTPS_PROXY || ""}`] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, storageState: stateFile });
const page = await ctx.newPage();
const boxes = {};
const box = async (key, loc) => {
  try { const b = await loc.first().boundingBox(); if (b) boxes[key] = Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.round(v)])); }
  catch (e) { console.log("no box", key); }
};
const go = async (url) => { await page.goto(url, { waitUntil: "networkidle", timeout: 60000 }); await page.waitForTimeout(3000); };
const shot = async (name) => { await page.screenshot({ path: `${outDir}/${name}.png` }); console.log("shot", name); };
// cards: nearest ancestor that looks like a card (rounded + background/border)
const card = (text) => page.getByText(text, { exact: true }).locator("xpath=ancestor::*[contains(@class,'rounded')][1]");

await go("https://kickoff.cash/");
await shot("landing-hero");
await box("hero_h1", page.locator("h1"));
const close = page.getByText("Closeness matters.", { exact: false }).first();
await close.evaluate((el) => el.scrollIntoView({ block: "center" }));
await page.waitForTimeout(2500);
await shot("landing-close");
await box("close_h2", page.locator("h2").filter({ hasText: "Closeness" }));

await go("https://kickoff.cash/markets");
await shot("markets");
await box("gw_chip", page.getByText("GW3", { exact: true }));
await box("market_row", card("Liverpool"));
await box("market_liverpool", page.getByText("Liverpool", { exact: true }));

await go("https://kickoff.cash/markets/5");
await shot("market");
await box("pool_conc", page.getByText("Pool concentration", { exact: true }));
await box("total_pool", page.getByText("TOTAL POOL", { exact: false }));
await box("entries", page.getByText("ENTRIES", { exact: true }));
await box("gamma", page.getByText("GAMMA", { exact: false }));
await box("participants", page.getByText("Pool participants", { exact: false }));
await box("fulltime", page.getByText("FULL TIME", { exact: false }));

await go("https://kickoff.cash/leaderboard");
await shot("leaderboard");
await box("acc_label", page.getByText("ACCUMULATOR POOL", { exact: false }));
await box("acc_text", page.getByText("Top 10", { exact: false }));

await go("https://kickoff.cash/docs");
const ag = page.getByRole("heading", { name: "AI agents" }).first();
await ag.evaluate((el) => { const y = el.getBoundingClientRect().top + window.scrollY - 140; window.scrollTo(0, y); });
await page.waitForTimeout(2000);
await shot("docs-agents");
await box("agents_h", ag);
await box("managed", page.getByText("Managed.", { exact: false }));

fs.writeFileSync(`${outDir}/boxes.json`, JSON.stringify(boxes, null, 2));
console.log(JSON.stringify(boxes));
await browser.close();
