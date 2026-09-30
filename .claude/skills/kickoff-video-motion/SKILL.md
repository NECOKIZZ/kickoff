---
name: kickoff-video-motion
description: Motion craft and visual language for Kickoff videos in HyperFrames — an idea pass that turns product truths into football-native visuals, phrase-based beat sync, fast blur-resolve entrances, live illustration of the product working (UI state machines), 3D depth (split-flap flips, tilt-to-flatten, camera flights), transitions, two looks (Matchday light, Floodlight dark), and the render-and-inspect loop. Techniques are measured from the user's reference videos; content and imagery are Kickoff's own. Use for any Kickoff video build, alongside kickoff-video-brand and kickoff-video-product.
---

# Kickoff video motion

## 0. Craft, not content

The user's reference videos (a series of product launches by one creator; measurements in `reference-analysis.md`) show **how good this can get**: tight beat sync, fast crisp entrances, real 3D, and a product that visibly *does its thing* on screen. Learn their **craft**: timing, easing, how an effect is built, how a demo is choreographed. Do **not** copy their **content**: their stories, props, copy, scene order or product motifs. Their product was about privacy; Kickoff is a football product about **openness and precision**. Its pool is public and its maths is published. Motifs about hiding things (redaction, masked amounts, "nobody sees") contradict Kickoff's brand.

A Kickoff video should look like it could only be about Kickoff: football, the scoreline, the pool, the match clock, the pitch.

HyperFrames' own skills hold the implementation recipes; this file says which to use and how Kickoff combines them. Load `hyperframes-core` and `hyperframes-animation` first. Determinism rules (a single paused timeline on `window.__timelines`, no `Math.random`/`Date.now`, no infinite loops) are non-negotiable.

## 1. The idea pass (before any storyboard)

Write this table first, in the plan you show the user. Each row goes from what's true about the product, to a picture from football, to a device on screen, to the technique that builds it.

| Product truth (from `kickoff-video-product`) | Football image | Device on screen | Technique |
|---|---|---|---|
| e.g. "Closeness is paid on a curve" | a keeper's dive: close still counts | the 5×5 grid with a heat ripple spreading out from the real result | populate + radial stagger (§5) |
| … | … | … | … |

Rules for the pass:
- Start from the product truth, never from a reference scene. If a device would fit any product (a generic dashboard, a generic phone notification), keep looking.
- Aim for 1–2 **signature devices** per video that nobody else could use (e.g. a split-flap scoreboard flipping from 2–0 to 2–1 as "close" turns into "exact").
- Then check it: would this frame still read as Kickoff with the logo covered? Does anything echo a reference's story or props? If yes, change it.

## 2. Kickoff's visual language

Motifs to build from (all brand-coloured and deterministic):

| Motif | What it's good for |
|---|---|
| **Split-flap scoreboard** (flip digits, the stadium board) | Scorelines, counters, the reveal of a result, transitions between numbers. Kickoff's natural 3D flip. |
| **Match clock** (`0'` → `45'` → `90'` → `FT`) | A running HUD that structures the video (open, lock at kickoff, settle at full time). |
| **Pitch markings** (halfway line, centre circle, penalty-box lines drawn in chalk-white or accent) | Transitions (a line sweeping across as a wipe, the centre circle as an iris), framing, annotation arrows like a tactics board. |
| **The 5×5 grid as a pitch** (the concentration grid, laid flat or tilted in perspective) | The core mechanic: picks, heat, distance, the median line. |
| **Ticket / stake slip** (a match-ticket stub: fixture, pick, stake, a perforated edge, a barcode) | The hero object; floats in 3D, gets stamped, torn or validated. |
| **Floodlights** (a white bloom, beams sweeping) | Openers, the dark look, a "lights on" reveal. |
| **Crests and kits** (the real club assets in `public/brand/clubs`) | Fixtures, lockups. Never recoloured or redrawn. |
| **LED board / fourth-official board** (glowing numbers) | Stats, counters, "+232%" style reveals. |
| **Open-pool visuals** (the pool as a visible pot, every entry shown, maths written out and checked) | Transparency and fairness: *show* everything, the opposite of hiding. |

Kickoff labels: short words set as **scoreboard tiles** (ink tile, Clash Display 700 uppercase, tight), **chalk labels** (Clash on the canvas with a hand-drawn chalk underline) or the white sticker labels approved in `videos/kickoff-launch-v2`. Pick one label system per video.

## 3. Music → phrases → beats

1. The track goes in `assets/` as `<audio id="music" data-timeline-role="music" src="assets/music.mp3">`. Run `npx hyperframes beats .` → `beats/assets/<file>.json` (`beats: [{time, strength}]`). If it reports "uncertain", snap to the evident grid and drop off-grid hits.
2. Copy beat times into the composition as constants and place everything with helpers (`at(phrase, pulse)`). Never time an element by an arbitrary number.
3. **Phrases:** the strongest beats (strength ≈ 1) mark phrase starts (in the references, every 8 pulses ≈ 2.3s at ~210 BPM).
4. **Per phrase: pulses 0–5 act, 6–7 breathe.** Scene changes land exactly on the phrase hit; one new thing per pulse; during the breath only ambient motion.
5. Impacts *arrive* on the pulse: start 1–2 frames early.
6. **Flams** (a hit doubled ~0.1s apart): main impact on the first, a secondary settle on the second.
7. **Follow the build:** when the track gets denser near the end, put the demo climax and end card there and cut faster.
8. **Longer, cinematic cuts** (30–60s) use fewer, bigger hits for the turns; between them the camera and UI keep moving continuously.
9. Music: the user supplies a licensed track. Otherwise `videos/tools/placeholder-music.py` generates a placeholder with the same phrase shape; say so.

## 4. Entrances: fast, from blur (measured)

| Element | From | To | Duration | Ease |
|---|---|---|---|---|
| Word / label | opacity 0, `blur(12px)`, scale 1.08, rotation −3°, x −30px | sharp, scale 1, resting tilt ±1–2° | **0.13–0.16s**, tilt settles ~0.3s | `power3.out` |
| Card / object | off-frame, rotation −12° | resting tilt ±2–4° | **~0.3s** | `back.out(1.3)` |
| Hero letters | each from a different offset, scale ~2, `skewX(−15°)`, blur | set | ~0.25s each, **0.1s stagger** | `expo.out` |
| Pill / badge | scale 0.7, opacity 0 | 1 | ~0.2s | `back.out(2)` |
| State change | — | — | ≤0.15s on the click pulse | `power2.out` |
| Stamp | rotation −40°, scale 0 | rotation −8°, scale 1 | ~0.3s | `back.out(2.5)` |

Exits are faster (~0.12s), or covered by the next transition. At most 2–3 words of a message on screen at once; plain language; no em dashes. Headlines in Fraunces 700, labels in Clash Display (brand skill).

## 5. Live illustration: Kickoff working, on the beat

The user values this most. Explanations are **state changes on faithful Kickoff UI**, one step per pulse, and the cursor or the match causes each change. Never a static screenshot with a caption.

General patterns (measured from the references):
- **Populate:** items appear one per pulse (or a 0.08–0.12s stagger inside a pulse for 5+), each blur-resolving; counters and badges pop on the next pulse.
- **Before → after on the same object:** transform the object in place, piece by piece, on the next phrase hit. Never cut to a separate "after" screen.
- **State machine on one card:** idle → click (ripple) → working (spinner, label change) → per-item status changes with a live counter and a filling bar → done state + a payoff burst.
- **Compare by toggle:** a segmented control the cursor clicks, sliding a second view in beside the first.
- **Annotate once:** one drawn line from a word to the UI element it describes (drawn ~0.3s).

Kickoff scenes built from these (original, from the product):
- **Pick:** the grid on a pitch; the cursor taps 2–1; the cell lifts in 3D, and the stake slip prints out of it.
- **The crowd arrives:** entries land one per pulse and the heat spreads across the grid; the "Pool" and "Entries" LED counters tick up.
- **Kickoff lock:** the match clock hits `0'`, a whistle, and a chalk line seals the grid ("Locked").
- **The match plays:** the split-flap score flips 0–0 → 1–0 → 2–0 → 2–1 on the clock; your live PnL line bends with each goal.
- **Full time, settle:** `FT`; two source badges check the score; distances draw from each pick to the result like tactics-board arrows; the median line drops; winners light up; the payouts count up (worked example, labelled illustrative).
- **The season:** each settled market drops a coin into the Season pot; the leaderboard reorders by precision.
- **Compare:** "Yes / No" vs "Scoreline": the same match under both, showing the information a binary market throws away.

## 6. 3D and depth

2–4 moments per video. One `perspective` stage (≈1200–1600px), `preserve-3d`, GSAP `rotationX/rotationY/z`; don't leave reading text rotated for long.

| Technique | Numbers (measured unless marked *judgement*) | Kickoff use |
|---|---|---|
| **Split-flap / X-axis flip** | each flap half rotates 0 → −90° then 90° → 0, ~0.12s per half, digits staggered 0.05s *(judgement: not in the references; tune by eye)* | scorelines, counters, scene titles on a scoreboard |
| **Y-axis card flip + tilt-to-flatten** | out to `rotationY ≈ 70°` with blur; in from `≈ -80°` to `-20°`, then flatten to ≈ 0° | title → product, view A → view B |
| **Floating tilted object** | `rotationY ≈ -15°, rotationX ≈ 8°`, drift 1–2°, a sheen sweep | the stake slip, a ticket, a crest |
| **Object through type** | starts behind the headline, flies forward, swaps above it mid-flight, ~0.5s | the slip flying through "FULL TIME." |
| **Tilted surface + camera flight** | surface at `rotationX ≈ 25°`, a `.world` camera gliding across | the grid or pitch seen from the stands (`rules/3d-camera-flight.md`) |
| **Pull-back reveal** | fast pull-out (~0.5s) from one item to many tiled in perspective | one market → the whole gameweek |
| **Type zoom-through** | a line scales past the camera (`scale → 6`, blur), ~0.3s | into a new section |
| **Depth of field** | blur the background layer, keep the focal card sharp | `rules/depth-of-field-blur.md` |

Also: `rules/orbit-3d-entry.md`, `rules/split-tilt-cards.md`, `rules/3d-text-depth-layers.md`, `rules/hacker-flip-3d.md` (per-character flips; for Kickoff, flip through digits like a scoreboard rather than random "hacker" glyphs).

## 7. Two looks

- **Matchday (light, default):** canvas `#EDEAE0` with a faint dot or chalk grid, cream cards, purple accent, generous whitespace, UI on one side and words on the other with **reflow** (existing elements shift and scale on the same pulse, 0.35–0.45s `power3.inOut`, when something new arrives). Reference implementation: `videos/kickoff-launch-v2`.
- **Floodlight (dark, cinematic, 30–60s):** ink `#111210`, a floodlight bloom and faint haze, huge white Fraunces revealed line by line, green `#00C805` as the single accent, the match clock as a corner HUD, one hard cut to a light frame at the turn, a single outline shape that carries through the video and morphs into the logo at the end (`rules/card-morph-anchor.md`, `rules/svg-path-draw.md`), and a stats finale on an LED board.

Slow drift on every scene's world wrapper (~1.5% scale or ~20px) so holds never freeze.

## 8. Transitions: fast, on the hit, never plain fades

| Transition | Duration | Kickoff form |
|---|---|---|
| Iris | ~0.17s | the **centre circle** opening from the kickoff spot |
| Diagonal / line wipe | ~0.25s | the **halfway line** or a floodlight beam sweeping across |
| Blur whip | ~0.2s | a **ball-flight whip** (blur + a faint trace) between light scenes |
| Blur-dissolve | ~0.25s | dark → light, "lights on" |
| Y-axis flip | ~0.35s + settle | a board turning over |
| Split-flap | ~0.3s | the whole frame as a scoreboard flipping to the next scene |
| Match cut / collapse | ~0.3s | everything collapses into the ball or the logo mark |

Build them from `hyperframes-animation/transitions/` (`css-radial.md`, `css-cover.md`, `css-blur.md`) and the rules above. About 5–6 per 30s, all different; the most dramatic on the hero moment.

## 9. Ambient and payoff

- One payoff burst per video (the stake confirmed or the win): brand-colour confetti or ticker tape, deterministic ballistic paths (`rules/particle-burst.md`).
- A chalk underline or tactics arrow on one key word; floodlight streaks in the dark look. SFX (whistle, crowd swell) only if licensed and mixed low (`media-use`, `hyperframes-audio`).

## 10. Render, look, fix (2–3 rounds)

1. `npx hyperframes check .`; fix every error (a wall of contrast warnings usually means a stuck overlay).
2. Render; pull stills at every phrase hit and mid-transition, tiled into contact sheets; read them.
3. Check: entrances sharp within ~5 frames? A visible breath at each phrase end? ≤3 words? Does every scene read as Kickoff with the logo covered? Anything borrowed from a reference's content?
4. Fix and re-render; tell the user what you couldn't verify (audio, feel).

Technical gotchas are in `kickoff-video-workflow` (transparent scenes, `immediateRender: false`, `x/y` instead of `left/top`).

## 11. Hard rules

Kickoff's imagery, not the references' · openness, never hiding motifs · one accent · brand fonts · explain by state changes on real-looking UI · ≤3 words of a message at once · every pulse has an owner, then a breath · fast blur-resolve entrances · a different real transition at each hit · testnet tag always · no Player Perps · no invented payouts.
