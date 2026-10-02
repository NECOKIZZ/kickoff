# Kickoff demo video (2:12, 16:9)

A product demo of the inside of the app: auto-listing, matchday staking, the open pool, live PnL,
two-source settlement, payouts, agents, agent runs and the Season Accumulator leaderboard.
Voiceover script: `vo.txt` (George, Kokoro TTS). Music: `assets/music.mp3` is the generated
placeholder (`videos/tools/placeholder-music.py`); swap in a licensed track before publishing.

## How the footage is made

The screens are the **real Kickoff app**, run locally and filled with demo data, not mockups:

- `capture/demo-data.mjs` holds the demo pool, markets, agent, runs and leaderboard. Pool payouts and
  the live PnL come from the real settlement engine (`@kickoff/engine`) run over that pool.
- `capture/capture.mjs` starts Playwright against `next dev`, answers every `/api/*` call from the demo
  data, signs a local invite cookie with a local-only secret, and uses the app's dev sign-in (no
  Privy). It clicks through the real UI (stepper, Lock it in, GW chips, Card) and saves 2x captures
  plus element boxes to `assets/shots/`.
- `capture/render-cards.mjs` renders the PnL share cards with the app's own card renderer.
- Nothing touches a database, the chain or the live site. Every frame carries a "Demo data · Testnet" tag.

Two scenes are "How it works" illustrations, because the app has no screen for them: auto-listing
and the two-source settlement check (wording from the public docs).

## Rebuild

```bash
# repo root
pnpm install
pip install kokoro-onnx soundfile                 # only to regenerate the voiceover
INVITE_COOKIE_SECRET=demo-local-secret npx next dev -p 3100 &   # no NEXT_PUBLIC_PRIVY_APP_ID
bash videos/kickoff-demo/capture/fetch-fonts.sh
npx tsx videos/kickoff-demo/capture/render-cards.mjs
npx tsx videos/kickoff-demo/capture/capture.mjs
node videos/kickoff-demo/capture/inject-boxes.mjs  # inline element boxes into index.html

cd videos/kickoff-demo
npx hyperframes check .
npx hyperframes render -o out/kickoff-demo-16x9.mp4
```

Voiceover: `while IFS='|' read -r id text; do npx hyperframes tts "$text" -v bm_george -o assets/vo/$id.wav < /dev/null; done < vo.txt`,
then convert to mp3 and update `DUR`/`PHR` in `index.html` (ffprobe + `silencedetect`).
