# Developer Experience notes: Binance Web3 API

Raw notes for the DX report (25% of the BNB Hack score). Write down what happened as it happens, in your own words. Short lines are fine. On Saturday these become the report in the form: https://forms.gle/EUQ39xf54GHjC2ys5

Each line: **date/time — what you did — what happened — how long it took**.

## Log
- Mon 5 Oct — Signed up on the dev portal and created an API key — (how long did it take? anything confusing?)
- Mon 5 Oct — First API call from a US-located server (cloud dev box) — every endpoint, even `aggregator/supported/chain`, returned HTTP 200 with `code 40304 "Service not available due to compliance restriction"`. Took ~300 ms. The error doesn't say it's about location, and HTTP 200 for an error is surprising.

## Sections the report asks for (fill in as you go)

### Onboarding: time from reading the docs to the first successful call; what got in the way

### Documentation issues: which page, where, and what was wrong or missing

### API pitfalls: confusing errors, edge cases, latency

### AI stack: Wallet Skills, Agentic Wallet, CLI — what worked, what's missing

### Tokenized-stock specifics: liquidity, slippage, market hours, on-chain vs reference price, bStocks vs Ondo vs xStocks

### How you'd redesign the developer platform

### Capabilities you wish existed: missing endpoints, SDKs, features
