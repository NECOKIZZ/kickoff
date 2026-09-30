---
name: kickoff-video-motion
description: Motion and timing rules for Kickoff videos in HyperFrames — phrase-based beat sync, fast blur-resolve entrances, sticker kinetic type, card choreography with reflow, fast transitions (iris, diagonal wipe, blur-dissolve, blur whip, match cut), live illustration of product functionality (UI state machines, problem-to-solution on one object, toggle proofs), story structure, 3D depth (Y-axis flips, tilt-to-flatten, object through type, device arcs, camera flights), a dark cinematic variant, and the render-and-inspect loop. Calibrated from the user's reference videos. Use for any Kickoff video build, alongside kickoff-video-brand and kickoff-video-product.
---

# Kickoff video motion

**Provenance.** Calibrated against the user's reference videos (reference 1: a 15s SDK launch spot; reference 2: a 20s payroll launch; reference 3: a 40s dark cinematic cut of the same payroll launch with real 3D; all by the same creator in HyperFrames); full measurements in `reference-analysis.md` next to this file. Numbers below are measured unless marked *(judgement)*. When the user adds another reference, analyse it the same way and update both files.

HyperFrames' own skills hold the implementation recipes; this file says **which to use and how Kickoff wants them combined.** Load `hyperframes-core` and `hyperframes-animation` first. Determinism rules (single paused timeline on `window.__timelines`, no `Math.random`/`Date.now`, no infinite loops) are non-negotiable.

## 0. The feel in one paragraph

Fast, crisp, light and airy. Things arrive in 4–6 frames and resolve from blur; nothing floats in slowly. Each musical phrase does five quick things, then **holds still for a breath**, then a hard hit changes the scene. Product UI sits on one side, short sticker-label words on the other, lots of empty space, and when something new arrives everything already on screen shifts together to make room.

## 1. Music → phrases → beats

1. The track goes in `assets/` as `<audio id="music" data-timeline-role="music" src="assets/music.mp3">`. Run `npx hyperframes beats .` → `beats/assets/<file>.json` (`beats: [{time, strength}]`). If it reports "uncertain", snap to the evident grid and drop off-grid hits.
2. Copy beat times into the composition as constants (`const PULSE = …; const hit = (phrase) => …; const at = (phrase, pulse) => …`). Never time an element by an arbitrary number.
3. **Find the phrase structure**: the strongest beats (strength ≈ 1) mark phrase starts; in the reference, every 8 pulses (≈2.3s at 210 BPM).
4. **Per phrase: pulses 0–5 act, pulses 6–7 rest.** Scene changes and transitions land exactly on the phrase hit. One new thing per pulse (a word, a card, a state change). During the rest, only ambient drift and particles move.
5. Impacts *arrive* on the pulse: start ~1–2 frames (0.03–0.06s) early so the sharp frame lands on the beat.
6. **Flams:** when a hit is doubled (~0.1s apart), land the main impact on the first and a secondary settle (badge, pill, stamp) on the second.
7. **Follow the build.** If the track gets denser in its last third (hits every ~1s instead of every phrase), put the demo's climax, the proof moment and the end card there, and cut faster to match.
8. A scene is usually 1–2 phrases. A 30s video at ~2.3s phrases is about 13 phrases, so about 6–7 scenes.
9. Music: the user supplies a licensed track. If none exists, synthesise a placeholder with the same phrase shape (hits, 5 pulses of rhythm, 3 pulses of drop-out) and say it's a placeholder.

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

## 4b. Live illustration: the product does the thing, on the beat

This is what the user likes most. Explanations are **state changes on a faithful product card**, one step per pulse, never a static screenshot with a caption.

- **Populate:** rows, cells or entries appear one per pulse (or a fast 0.08–0.12s stagger within a pulse for 5+ items), each with a short blur-resolve. Headers and badges ("12 people", "2 entries") pop on the next pulse.
- **Problem → solution on the same object.** Show the pain on a UI card first, then transform *that card* on the next phrase hit, row by row (one row per pulse), while an inverted sticker lands the turn ("Not anymore."). Don't cut to a different "after" screen.
- **State machine on one card:** idle → cursor click (ripple) → loading (spinner + label change, e.g. "Paying…") → per-row status flips with a live counter ("3 of 12 paid") and a filling progress bar → done state (✓ label, button colour change) + confetti. Every transition is on a pulse; counters tick in integer steps.
- **Inputs that feel real:** a file chip dropping in, a "Reading…" line with a spinner, a toggle switching, a value flipping. The cursor causes each change.
- **Proof by toggle:** a segmented control ("You see | The public sees", or "Your pick | The crowd") that the cursor clicks, sliding in a second card beside the first so the viewer compares the two views side by side.
- **Annotate sparingly:** one hand-drawn arrow from a sticker to the UI element it describes (`rules/svg-path-draw.md`, drawn in ~0.3s), or a scribble underline under one key sticker word.

Kickoff equivalents:
- *Problem → solution:* a Yes/No market card whose two buttons break apart and re-form into the 5×5 scoreline grid.
- *Populate:* the concentration grid heating up cell by cell as stakes arrive, with "Pool $…" and "entries" counters ticking.
- *State machine:* Pick 2–1 → "Stake 10 USDC" → spinner "Staking…" → "✓ Staked" → "Locks at kickoff".
- *Settlement:* participant rows resolve one per pulse with their distance and "Won / Lost", "n of 5 settled", then payouts count up. Use the worked example.
- *Proof by toggle:* "Your pick | The pool" showing your cell versus the crowd heatmap.

## 4c. Story structure (launch / feature videos)

1. **Problem on the product UI** (1–2 phrases) with question stickers.
2. **Flip** on a hit: an inverted-sticker answer plus the same UI transforming.
3. **Hero** (dark, per-letter name slam, subline, pills).
4. **Demo** as a state machine (2 phrases), climaxing with confetti.
5. **Proof** (toggle or before/after comparison), in the music's densest part.
6. **End card:** logo (+ partner), product name + inverted "is live." sticker on the next hit, subline, pills (domain + accent status pill such as "Live on testnet"), confetti, stamp.

Sticker variants: white (default), accent (purple, the key word) and **inverted** (ink background, white text) for answers and emphasis ("Not anymore.", "is live."). Use at most one inverted sticker per phrase.

## 4d. 3D and depth

Use 3D to give objects weight and to carry the eye between scenes. Keep it to 2–4 moments per video. One `perspective` stage (≈ 1200–1600px) with `transform-style: preserve-3d`; animate `rotationX/rotationY/z` with GSAP; don't leave text you need to read rotated for long.

| Move | Recipe | Numbers (from reference 3) |
|---|---|---|
| **Floating tilted card** (hero object: payslip, scoreline ticket, stake receipt) | card at `rotationY ≈ -15°, rotationX ≈ 8°`, slow drift, a light sheen sweeping across | drift ≈ 1–2° over the scene |
| **Object flies through type** | object starts small, far and *behind* the headline (z-index under), flies forward rotating; swap it *above* the headline mid-flight | ~0.5s, `power3.out`, settle at −5° |
| **Y-axis card flip** (scene change) | outgoing content swings to `rotationY ≈ 70°` with blur; incoming swings in from `≈ -80°` to `-20°`, then **tilt-to-flatten** to ≈ −8° / 0° | 0.35s swing (`power3.in` out, `expo.out` in) + 0.4s settle |
| **Tilted surface + camera flight** | the product table or grid in perspective (`rotationX ≈ 25°`), a `.world` camera gliding across it; connector lines and outline boxes drawn on it | `rules/3d-camera-flight.md`, `rules/3d-page-scroll.md` |
| **Pull-back to a wall** | from one tilted card the camera pulls out fast to reveal many copies tiled in perspective ("so can everyone else") | ~0.5s `power3.inOut` |
| **Device arc** | 3–5 phone mockups in a shallow arc (outer `rotationY ≈ ±18°`, centre closest); screens light up one per pulse to show the outcome on each person's device | one screen per ~0.3s |
| **Type zoom-through** | a full-screen line scales past the camera (`scale → 6`, blur) into the next scene | ~0.3s |
| **Depth of field** | blur the background layer while the focal card stays sharp | `rules/depth-of-field-blur.md` |

Also useful: `rules/orbit-3d-entry.md` (flip-in entrances), `rules/split-tilt-cards.md` (two opposing tilted cards for a comparison), `rules/3d-text-depth-layers.md` (extruded big type).

Kickoff equivalents: a floating **stake ticket** ("2–1 · 10 USDC · ARS v LIV") that flies through "KICKOFF." or "FULL TIME."; the 5×5 grid tilted with the camera gliding across the hot cells; a Y-flip from the title into the market page; a phone arc showing each trader's result notification (illustrative, testnet); a pull-back from one market to a wall of every gameweek market.

## 4e. Cinematic variant (dark, 30–60s)

For longer or more premium cuts, reference 3's system replaces stickers:

- **Look:** ink `#111210` background, faint drifting dust, vignette; huge white type (Fraunces 700 is the Kickoff swap for their grotesk) centred or bottom-left, revealed line by line; one accent (Kickoff dark theme: green `#00C805`) for the "good" state.
- **Diegetic HUD:** a small running label in a corner that advances with the story. Kickoff: a match clock, `ARS v LIV · 0'` → `45'` → `FT 90'`.
- **Theme flash:** one hard cut to a light frame for the turn ("Not just yes or no."), then back to dark.
- **Shape continuity:** a drawn outline (frame border, card outline) that shrinks and morphs into the next object and finally into the logo mark (`rules/card-morph-anchor.md`, `rules/svg-path-draw.md`). Use it at the turn and again at the end.
- **Text scramble/decode** between consecutive lines: old line → glyphs ~0.1s, new line decodes left to right ~0.4s (`rules/hacker-flip-3d.md`). Glyphs must be index-seeded, never `Math.random`.
- **Redaction and marquee devices** for "what's hidden": rows morph one per pulse; a marquee of items gets boxed as it passes.
- **Stats finale:** 2–3 stacked count-ups ending on a meaningful number in the accent colour (Kickoff, from the worked example: "5 traders · $50 pool · exact call +232%"), then an outline draws round them and shrinks into the logo.
- **Rhythm:** fewer, bigger hits. The turn, the logo and the end card go on the strongest hits; the camera and UI keep moving continuously in between.
- Light streaks across the frame at the open and close (~1s, low opacity).
- **Show the other side:** reference 3 ends the demo on the recipients' phones. For Kickoff, the equivalent is every trader in the pool seeing their own result.

## 5. Transitions — fast, on the phrase hit, never plain fades

| Type | Use | Duration | Notes |
|---|---|---|---|
| **Iris** | Into the dark hero scene | ~0.17s | Circle `clip-path` or scaled ink disc from a frame edge |
| **Diagonal wipe** | Section change | ~0.25s | Ink panel skewed ~−15° with a purple leading edge; outgoing covered, incoming revealed as it exits |
| **Blur-dissolve** | Dark → light return | ~0.25s | Next scene already in place under `blur(20px)`, resolves as it fades up |
| **Match cut / collapse** | Into the end card | ~0.3s | The scene's cards scale/converge into the logo mark at centre |
| **Y-axis card flip** | Title → product, or view A → view B | ~0.35s + 0.4s settle | See 4d |
| **Text scramble** | Line → line in the cinematic variant | ~0.5s | See 4e |
| **Blur whip** | Between two light scenes | ~0.2s | Outgoing scene blurs out with a slight zoom (~0.1s); incoming resolves from blur (~0.1s) with content already animating in |

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

One accent · brand fonts only · explain by state changes on real-looking UI · ≤ 4 sticker words at a time · every pulse has an owner, then a breath · fast blur-resolve entrances · a different real transition at each phrase hit · UI and words on opposite sides with reflow · testnet tag always · no Player Perps · no invented payouts.
