---
name: kickoff-video-motion
description: Motion and timing rules for Kickoff videos in HyperFrames — phrase-based beat sync, fast blur-resolve entrances, sticker kinetic type, card choreography with reflow, fast transitions (iris, diagonal wipe, blur-dissolve, match cut), and the render-and-inspect loop. Calibrated from the user's reference video. Use for any Kickoff video build, alongside kickoff-video-brand and kickoff-video-product.
---

# Kickoff video motion

**Provenance.** Calibrated against the user's reference video (a 15s SDK launch spot made with HyperFrames); full measurements in `reference-analysis.md` next to this file. Numbers below are measured unless marked *(judgement)*. When the user adds another reference, analyse it the same way and update both files.

HyperFrames' own skills hold the implementation recipes; this file says **which to use and how Kickoff wants them combined.** Load `hyperframes-core` and `hyperframes-animation` first. Determinism rules (single paused timeline on `window.__timelines`, no `Math.random`/`Date.now`, no infinite loops) are non-negotiable.

## 0. The feel in one paragraph

Fast, crisp, light and airy. Things arrive in 4–6 frames and resolve from blur; nothing floats in slowly. Each musical phrase does five quick things, then **holds still for a breath**, then a hard hit changes the scene. Product UI sits on one side, short sticker-label words on the other, lots of empty space, and when something new arrives everything already on screen shifts together to make room.

## 1. Music → phrases → beats

1. The track goes in `assets/` as `<audio id="music" data-timeline-role="music" src="assets/music.mp3">`. Run `npx hyperframes beats .` → `beats/assets/<file>.json` (`beats: [{time, strength}]`). If it reports "uncertain", snap to the evident grid and drop off-grid hits.
2. Copy beat times into the composition as constants (`const PULSE = …; const hit = (phrase) => …; const at = (phrase, pulse) => …`). Never time an element by an arbitrary number.
3. **Find the phrase structure**: the strongest beats (strength ≈ 1) mark phrase starts; in the reference, every 8 pulses (≈2.3s at 210 BPM).
4. **Per phrase: pulses 0–5 act, pulses 6–7 rest.** Scene changes and transitions land exactly on the phrase hit. One new thing per pulse (a word, a card, a state change). During the rest, only ambient drift and particles move.
5. Impacts *arrive* on the pulse: start ~1–2 frames (0.03–0.06s) early so the sharp frame lands on the beat.
6. A scene is usually 1–2 phrases. A 30s video at ~2.3s phrases is about 13 phrases, so about 6–7 scenes.
7. Music: the user supplies a licensed track. If none exists, synthesise a placeholder with the same phrase shape (hits, 5 pulses of rhythm, 3 pulses of drop-out) and say it's a placeholder.

## 2. Entrances: fast, from blur

| Element | From | To | Duration | Ease |
|---|---|---|---|---|
| Sticker word | opacity 0, `blur(12px)`, scale 1.08, rotation −3°, x −30px | sharp, scale 1, resting tilt ±1–2° | **0.13–0.16s**, then tilt settles over ~0.3s | `power3.out` |
| Card | y +120% of frame (off-screen), rotation −12° | resting tilt ±2–4° | **~0.3s** | `back.out(1.3)` |
| Hero letters | each from a different offset, scale ~2, `skewX(−15°)`, opacity 0.4, `blur(8px)` | set | ~0.25s each, **0.1s stagger** | `expo.out` |
| Pill / badge | scale 0.7, opacity 0 | 1 | ~0.2s | `back.out(2)` |
| State change (button text/colour) | — | — | ≤0.15s crossfade on the click pulse | `power2.out` |
| Stamp badge | rotation −40°, scale 0 | rotation −8°, scale 1 | ~0.3s | `back.out(2.5)` |

Exits are faster than entrances *(judgement: ~0.12s)*, or objects simply get covered by the next transition. Don't fade things out one by one at the end of a scene.

## 3. Sticker kinetic type

- Each word is its own white label: background `#FFFFFF`, padding ~0.1em 0.28em, radius 6–8px, shadow `0 8px 24px rgba(17,18,16,.08)`, tilt from a fixed table (e.g. −2°, 1.5°, −1°, 2°), never random.
- **Clash Display 700**, ink colour, modest size (≈ 80–96px at 1080p). Max 2 lines × 2 words on screen. Plain language, no em dashes.
- A word can take the accent (purple label, white text) once per scene for the key word.
- The next word starts overlapping the previous one and slides into its slot as it sharpens.
- Big headline reveals (the product name, the tagline) use **Fraunces 700** with the per-letter hero entrance, not stickers.

## 4. Layout, whitespace, reflow

- Background: canvas `#EDEAE0` (light theme) with a faint dot grid (`radial-gradient` dots, 2px, ~32px spacing, ~6% ink). Cards `#F7F5F0`/white with soft, wide, low-opacity shadows. A dark "hero" scene (ink `#111210`) is allowed once, as contrast.
- **UI on one side, words on the other**, alternating between scenes. The UI card is ~25–35% of frame width. Margins ≥ ~8% *(judgement)*; leave large empty areas.
- **Reflow:** when an element enters, the group that's already on screen moves and/or scales on the *same pulse* (0.35–0.45s `power3.inOut`) to rebalance. Example: the product card slides from centre to the right and shrinks to 0.8 as the headline stickers arrive left. Build this with a wrapper per group and tween the wrapper.
- Slow drift on the world wrapper *(judgement: ~1.5% scale or ~20px across a scene, `none` ease)* so holds never look frozen.

## 5. Transitions — fast, on the phrase hit, never plain fades

| Type | Use | Duration | Notes |
|---|---|---|---|
| **Iris** | Into the dark hero scene | ~0.17s | Circle `clip-path` or scaled ink disc from a frame edge |
| **Diagonal wipe** | Section change | ~0.25s | Ink panel skewed ~−15° with a purple leading edge; outgoing covered, incoming revealed as it exits |
| **Blur-dissolve** | Dark → light return | ~0.25s | Next scene already in place under `blur(20px)`, resolves as it fades up |
| **Match cut / collapse** | Into the end card | ~0.3s | The scene's cards scale/converge into the logo mark at centre |

Recipes live in `hyperframes-animation/transitions/` (`css-radial.md`, `css-cover.md`, `css-blur.md`) and `rules/card-morph-anchor.md`. Put the most dramatic one (iris) on the hero reveal. A 30s video uses about 5–6 transitions, all different.

## 6. Show the product doing the thing

Faithful HTML recreations of Kickoff's Score Market UI as floating cards, not stock visuals. Every demo is **a cursor click causing a visible state change on a pulse**:

- The grid card: the cursor clicks **2–1**, the cell fills purple, a ring ripple spreads.
- The stake card: `10 USDC` → cursor clicks **Stake** → button flips to **"✓ Staked"**, and a "Locks at kickoff" badge pops.
- Full time: a **"FT 2–1" stamp** rotates onto the card.
- Result cards (exact / close / wrong, from the product skill's worked example) fly in one per pulse; the "close" card gets the accent ring and a stamp.
- Season Accumulator: a card whose counter and segment bar fill on pulses.
- End card: cards collapse into the logo mark → mark slides left as "Kickoff" reveals → tagline → CTA pill (accent) + testnet pill → confetti.

Label example numbers as illustrative, keep the testnet tag visible, never show Player Perps or live-looking fake data.

## 7. Ambient details (sparingly)

- **Confetti burst** on 1–2 payoff moments (the stake confirm, the end card): ~30 small squares in ink/purple/green, deterministic index-seeded ballistic paths (`hyperframes-animation/rules/particle-burst.md`).
- Tiny sparkle glyphs (✦) near a key word; a hand-drawn underline (`rules/svg-path-draw.md`) under one word per video.

## 8. Render, look, fix — 2–3 rounds

1. `npx hyperframes check .` and fix every error. A wall of low-contrast warnings usually means a stuck overlay (check wipes and irises end off-screen or at opacity 0).
2. Render, then pull stills at every phrase hit **and mid-transition**: `ffmpeg -ss <t> -i out/v.mp4 -frames:v 1 f.png`, tiled into contact sheets. Blank mid-transition frames mean an opaque scene background is hiding the outgoing scene: keep `.scene` backgrounds transparent and paint the background on the root.
3. Compare against the reference numbers: are entrances resolved within ~5 frames? Is there a visible hold at the end of each phrase? At most 4 words? Is UI on one side and words on the other?
4. Fix and re-render. Tell the user what you couldn't verify (audio and feel).

## 9. Hard rules recap

One accent · brand fonts only · ≤ 4 sticker words at a time · every pulse has an owner, then a breath · fast blur-resolve entrances · a different real transition at each phrase hit · UI and words on opposite sides with reflow · testnet tag always · no Player Perps · no invented payouts.
