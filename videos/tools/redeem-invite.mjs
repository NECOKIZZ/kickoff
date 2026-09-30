// Redeem a Kickoff invite code in a headless browser and save the session cookie.
// Usage: node videos/tools/redeem-invite.mjs <INVITE-CODE> <state.json> <screenshot-dir>
// Keep <state.json> OUTSIDE the repo (it is a credential). Codes are single use.
// Proxied cloud containers: trust the proxy CA in the browser first (see kickoff-video-workflow).
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "/opt/node22/lib/node_modules/playwright/index.mjs");
const [, , code, stateFile, shotDir] = process.argv;
const browser = await chromium.launch({ args: [`--proxy-server=${process.env.HTTPS_PROXY || ""}`] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
await page.goto("https://kickoff.cash/waitlist", { waitUntil: "networkidle", timeout: 60000 });
const inputs = await page.locator("input").evaluateAll((els) => els.map((e) => ({ type: e.type, ph: e.placeholder, name: e.name })));
console.log("inputs:", JSON.stringify(inputs));
const codeInput = page.locator('input[placeholder*="XXXX" i], input[placeholder*="KICK" i]').first();
await codeInput.fill(code);
await page.getByRole("button", { name: /enter kickoff/i }).click();
await page.waitForTimeout(6000);
console.log("after redeem url:", page.url());
await page.screenshot({ path: `${shotDir}/after-redeem.png` });
await ctx.storageState({ path: stateFile });
const cookies = (await ctx.cookies()).map((c) => c.name);
console.log("cookies:", cookies.join(","));
await browser.close();
