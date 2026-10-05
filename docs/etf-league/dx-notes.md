# Developer Experience notes: Binance Web3 API

Raw notes for the DX report (25% of the BNB Hack score). The report itself goes in the form at the end: https://forms.gle/EUQ39xf54GHjC2ys5

**How these notes work:** Claude logs what happens while building, in plain language. The team adds anything they run into. Before submitting, rewrite each point in your own words; the judges reject AI-written reports.

Each entry: **what we tried → what happened → why it matters**. The technical detail is underneath, for the report.

## Log

### Mon 5 Oct: signing up
- **What we tried:** created a developer account and an API key (the password-like code that lets our app talk to Binance).
- **What happened:** _(team: add how long it took and anything confusing)_

### Mon 5 Oct: first API call was blocked because of location
- **What we tried:** our very first request to Binance, just asking "which blockchains do you support?". It came from our cloud development computer, which happens to be in the US.
- **What happened:** Binance refused everything, even this basic question, with the message "Service not available due to compliance restriction".
- **Why it matters:**
  - The message doesn't say the problem is *location*. We had to work it out ourselves by checking where our computer was.
  - The response was marked "success" at the web level (HTTP 200) even though it was an error, so normal error checks miss it.
  - There's no list in the docs of which countries are blocked, or any hint that the hackathon's country rules also apply to the computers your code runs on.
- _Technical detail:_ every endpoint, including `/api/v1/dex/aggregator/supported/chain`, returned HTTP 200 with `code: 40304`. Responses took ~230–350 ms. Our keys and request signing were correct: the server got far enough to check our location.

### Mon 5 Oct: AI coding tools running in the US are blocked too
- **What we tried:** we build with an AI coding assistant. It runs on cloud computers that, like most AI services, are hosted in the US.
- **What happened:** the assistant can't make a single live call to the Binance API, so it can't test its own code against the real service. We have to copy the code to a computer in an allowed country and run it there by hand.
- **Why it matters:**
  - Binance is actively promoting AI agents (Agentic Wallet, Wallet Skills, the special prizes for them), but much of the AI infrastructure those agents run on is in the US.
  - A developer outside the US can still be blocked just because their tools are hosted there.
  - Nothing in the docs warns about this or suggests a workaround, such as a test environment open from any location, or a clear list of allowed hosting regions.

## Sections the report asks for (fill in from the log on Saturday)

### Onboarding: time from reading the docs to the first successful call; what got in the way

### Documentation issues: which page, where, and what was wrong or missing

### API pitfalls: confusing errors, edge cases, latency

### AI stack: Wallet Skills, Agentic Wallet, CLI — what worked, what's missing

### Tokenized-stock specifics: liquidity, slippage, market hours, on-chain vs reference price, bStocks vs Ondo vs xStocks

### How you'd redesign the developer platform

### Capabilities you wish existed: missing endpoints, SDKs, features
