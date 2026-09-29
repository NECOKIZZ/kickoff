---
name: kickoff-video-brand
description: Kickoff.cash brand rules for any video, motion graphic, or animated asset made for Kickoff. Use whenever making a Kickoff launch video, promo, explainer, social clip, title card, or HyperFrames composition — colors, fonts, logo, assets, voice, and what to avoid. Read before choosing any color, font, or copy.
---

# Kickoff video brand

Source of truth: `public/kickoff_brand_book.pdf`, `app/globals.css`, `src/ui/landing/`. If this file and those disagree, the repo wins — fix this file.

Kickoff is a proximity-based prediction market for football. The brand line is **"Beat the pack, keep the stack."** Aesthetic keywords from the brand book: editorial sportswear, vibrant tech-minimalism, digital pitch logic, high-stakes sophistication, data-driven energy. It should look like a sports editorial, not a crypto casino.

## Themes — pick one per video, don't mix

| | Light (cream) | Dark (ink) |
|---|---|---|
| Background | `#F7F5F0` chalk / `#EDEAE0` canvas | `#111210` ink / cards `#1C1D1A` |
| Text | `#111210` | `#F7F5F0` |
| **Accent** | **Purple `#7B62F6`** (deep `#4e3cb5`) | **Neon green `#00C805`** (deep `#008C04`) |
| Counter-accent | green | purple |
| Muted text | `#6B6F63` | `#6B6F63` |
| Hairlines | `rgba(107,111,99,.2)` | `rgba(247,245,240,.1)` |

Purple carries the cream theme, green carries the dark theme; each is the other's counter-accent (e.g. "the field" vs "your line" in a chart). Green also means *gain / your pick*. Pure `#000`/`#FFF` exist in the brand book but the site uses ink and chalk — prefer those. Club colors appear only on club-specific elements (crests, cards).

## Type

- **Fraunces** (serif) — all large type. Weight 600–700, letter-spacing about `-0.025em` to `-0.03em`, line-height 1.0–1.05. Italic Fraunces works for soft sub-lines.
- **Clash Display** — labels and small UI text. Weight 700, uppercase eyebrows with `0.16em–0.18em` tracking, low-opacity supporting copy.
- **Inter** — body and numerals inside UI mockups.
- Fraunces/Inter come from Google Fonts, Clash Display from Fontshare (`api.fontshare.com`). Confirm the render actually picked them up (`hyperframes check` / a `snapshot`) — a silent fallback to a system serif is the most common brand failure.
- Two-tone headlines are on-brand: the first line full-strength, the second at about 35% opacity ("Closeness matters. / Not just yes or no.").

## Logo and assets (in `public/brand/`)

- `logo-black.svg`, `logo-white.svg`, `logo-green.svg`, `logo-black.png`. The mark is monochrome: black on light, white on dark. Use green only as a deliberate accent lockup.
- Clear space: keep clean space all round; never below **80px width**. Don't recolor, outline, rotate, or animate the mark's geometry — reveal it (fade, wipe, scale-in), don't distort it.
- `clubs/*.webp` — all 20 EPL crests. `hero-players.webp`, `player-left.webp`, `player-right.webp`, `face-*.webp` and `cards/*.webp` — player imagery. Never stretch; keep aspect ratio.
- Copy any asset a composition needs into that video project's own `assets/` folder and reference it relatively. Don't reach into `public/` with absolute paths.
- Only use crests and player images that already exist in the repo. Don't invent or redraw club badges.

## Voice

Competitive, technical, direct, confident. Values: transparency, precision, fairness, technical integrity.

- Short declaratives. Numbers over adjectives. State the mechanism, then the payoff.
- Use the product's own words: **predict, call, stake, pool, closeness, proximity, settle, scoreline**. Real site lines you can reuse verbatim: "Proximity Markets.", "Closeness matters. Not just yes or no.", "Close still pays.", "Pick a scoreline", "Split the pool", "Enter the markets", "Beat the pack, keep the stack."
- **Recommended, pending owner confirmation:** avoid "bet/gamble/odds/jackpot" — the product positions itself against yes/no betting. Ask before using them.

## Look and feel already in the product

- Editorial layout with generous space, big serif headline, one accent color, thin rules.
- Glass panels (translucent white 4–6% fill, 10–14% border), soft accent glow orbs behind content, tactile 3D buttons for CTAs.
- The website's motion signature: word-by-word headline reveal, each word rising ~0.35em while a 14px blur clears, 700ms, stagger 70–140ms, on `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-quint = GSAP `power4.out`); blocks slide ~40px over ~900ms. Match this feel so video and site read as one product. A fuller motion skill (`kickoff-video-motion`) will be written from the reference videos.

## Avoid

- Crypto clichés: coins raining, rockets, moon language, glitchy neon-on-black "hacker" looks, chain/blockchain-node imagery as decoration.
- Casino/betting clichés: dice, slot reels, chips, odds tickers, flashing jackpot numbers.
- Generic stock-football footage or imagery. Use the brand's own assets and the product UI.
- Mixing both themes' accents at equal weight, gradients across purple→green, off-palette colors.
- Small text under about 36px on a 1080p frame, or any key content in a platform's UI-covered margins (see `kickoff-video-workflow`).
