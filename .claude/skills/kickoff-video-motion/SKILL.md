---
name: kickoff-video-motion
description: Motion and timing rules for Kickoff videos in HyperFrames — beat-locked editing, kinetic type, coordinated element movement with generous whitespace, scene transitions (wipe, zoom-through, push, whip pan), camera drift, and the render-and-inspect loop. Use for any Kickoff video build, alongside kickoff-video-brand and kickoff-video-product.
---

# Kickoff video motion

**Provenance — read this.** These rules come from a described production method for a set of HyperFrames videos (one HTML file, one GSAP timeline, music-first beat sync, real product UI, render → inspect frames → fix). They are **not yet measured from the reference videos themselves**. Numbers marked *(start value)* are sensible starting points to calibrate, not facts. When reference videos are analysed, update this file from the measurements.

HyperFrames' own skills hold the implementation recipes; this file says **which to use and how Kickoff wants them combined.** Load `hyperframes`, `hyperframes-core` and `hyperframes-animation` first. Determinism rules (single paused timeline registered on `window.__timelines`, no `Math.random`/`Date.now`, no infinite loops, transforms + opacity for motion) are non-negotiable and live in `hyperframes-core`.

## 1. Music first, then beats — everything lands on the grid

The tight feel comes from editing to the music, not from easing alone.

1. Start from a real track in `assets/` (`<audio id="music" data-timeline-role="music" src="assets/music.mp3">` — without that attribute/id `beats` refuses to run).
2. Run `npx hyperframes beats .` → writes `beats/assets/<file>.json`: `{ "version":1, "audio":..., "beats":[{ "time": 0.499, "strength": 0.989 }, ...] }` (verified). It also reports BPM and flags "uncertain" when confidence is low — if uncertain, listen for it, or hand-set the grid.
3. **Copy the beat times into the composition as a constant array** (`const BEATS = [...]`). Don't fetch JSON at render time.
4. Rank beats by `strength`. Use the strong ones (or every 4th beat, a "bar") for **scene changes** and the hero moments; use every beat / every other beat for **word and card entrances**.
5. Never place an entrance at an arbitrary time. Every `tl.to/fromTo` start is `BEATS[i]` plus a named offset. Write a tiny helper (`at(i, offset=0)`) so this is enforced by structure.
6. **Where on the beat:** an impact (slam, snap, hit) should *arrive* on the beat — start the tween slightly before so peak velocity/landing hits the beat time. Transitions should *resolve* on the beat, not begin on it. *(start value: start entrances 0.05–0.15s early; transitions 0.25–0.5s long ending on the beat)*.
7. If the video has a beat drop or a musical build, put the hero reveal (Score-Market grid, tagline, logo) there. Fade the music out over the final ~1s (`data-fade-out`).
8. Optional hits: `media-use` has whoosh / impact / key-press SFX — place them on the same beat as the visual they belong to, quietly under the music.

Music licensing: the repo has no music. The user supplies a track they have rights to; never ship an unlicensed track.

## 2. Kinetic type

- **At most 2–3 words on screen at once.** Plain language. No em dashes.
- **Every word or card enters differently** within a scene: scale-slam, side-snap, rise, drop. Never the same entrance twice in a row. Recipes: `rules/kinetic-beat-slam.md`, `rules/waterfall-entry.md`, `rules/spring-pop-entrance.md`, `rules/gradient-text-sweep.md`, and the named text effects in `adapters/animate-text.md`.
- Use the brand type (Fraunces headlines, Clash Display labels). Fraunces slams look best at very large sizes with the tight tracking in the brand skill. **Never a monospace font.**
- Words are one idea per beat: "Closeness. / Matters." beats a sentence. Use the real site lines from the brand skill.
- Numbers count up on beat (`rules/counting-dynamic-scale.md`, blueprint `dataviz-countup`): e.g. a +232% that ticks then locks.

## 3. Coordinated movement, generous whitespace

This is the difference between "smooth" and "busy".

- **One primary mover per beat.** One thing takes the eye; everything else supports it. Never let three elements animate independently at equal weight.
- **Group choreography.** Related elements share a direction, an ease, and a duration, and are offset by a fixed small stagger (*start value: 50–100ms; cap a group at ~0.5s total*, as `hyperframes-animation` also does). They enter as one gesture and leave as one gesture.
- **One ease family for the whole video.** Entrances `power4.out` (the site's `cubic-bezier(0.22,1,0.36,1)`), repositioning `power2.inOut`, no bouncy defaults unless it's a deliberate slam. Exits are faster than entrances.
- **Shared axes.** Elements travel along the layout's grid lines; don't scatter arbitrary directions. If a scene pushes left, the next scene's content arrives from the right, continuing the same motion.
- **Whitespace is a design element.** Compose on a strict grid with wide margins *(start value: ≥ 8% of frame on each side; content block occupying roughly a third to a half of the frame; one focal element)*. Emptiness holds attention on the mover. Don't fill space because it's there. Follow `hyperframes-creative/references/video-composition.md` on scale, then subtract.
- **Hold time.** After an element lands, let it sit for a beat before the next thing moves so the eye can read it. A slam needs its stillness.

## 4. Transitions — always a real one, never a plain fade

Choose from `hyperframes-animation/transitions/` (route via `catalog.md`; read only the file you need):

| Move | Use for | Look in |
|---|---|---|
| **Push** | Continuous flow scene to scene; default connective tissue | `css-push.md` |
| **Wipe / cover** | A clean editorial reveal, brand-colored panel sweeps | `css-cover.md`, `css-radial.md` |
| **Zoom-through** | Diving *into* something (e.g. into the grid or a card) | `css-scale.md` |
| **Whip pan with blur** | High-energy beat changes; push plus directional smear | `css-push.md` + `rules/motion-blur-streak.md`, `css-blur.md` |
| **Shader transitions** | The 1–2 centerpiece moments only (hero reveal, CTA) | `hyperframes-creative/references/beat-direction.md` |

Rules: transitions **resolve on a strong beat**; 15s video → 3–4 transitions, and reserve the most dramatic for the hero moment; match outgoing/incoming velocity direction (see "Velocity-matched transitions" in `beat-direction.md`); avoid the entries the catalog says not to use (star iris, tilt-shift, lens flare, hinge/door). Hard cuts on consecutive strong beats are fine for rapid word sequences.

## 5. Camera: nothing sits still

Every scene has a slow continuous drift under the main choreography, so static frames still feel alive. Use `rules/multi-phase-camera.md` (pull-back / focus / push plus micro-drift) or `rules/viewport-change.md` (a single `.world` wrapper). *(start value: 2–4% scale change or 20–40px translation across the scene, `sine.inOut` or linear — subtle enough that it's felt, not seen)*. Drift the whole `.world`, not individual elements, so relative layout stays locked. For a dive into the product, `rules/coordinate-target-zoom.md`.

## 6. Show the real product doing the thing

Build faithful HTML recreations of Kickoff's Score Market UI in brand styling, not stock visuals. The action should be *performed*, using `blueprints/cursor-ui-demo.md` and `rules/cursor-click-ripple.md`:

- A **cursor** clicks a cell on the **5×5 concentration grid**; the cell outlines in green/accent and the pool heat shifts.
- The **stake** is entered and confirmed; **worked-example** rows resolve (A exact, B close, C loses) with numbers counting in. Label "illustrative example" and keep the testnet tag (see product skill).
- The **live PnL line** draws (`rules/svg-path-draw.md`) with goal markers popping on beat.
- The **Season pool** ticks up (`counting-dynamic-scale`).

Never show fabricated live data as real; never show Player Perps.

## 7. Render, look, fix — usually 2–3 rounds

1. `npx hyperframes check .` — fix every error (layout, overlap, contrast, missing assets).
2. Render a draft. Pull stills at **each beat that carries a scene change or hero moment**, plus mid-transition frames:
   `ffmpeg -ss <t> -i out/video.mp4 -frames:v 1 out/f_<t>.png`
   (or `npx hyperframes snapshot`). **Look at them.** Check: fonts correct, overlaps, cropped text, safe margins, whitespace, one accent color, word count ≤ 3, transition mid-frames not muddy, testnet tag present.
3. Check timing against `BEATS`: at each hero beat time, the frame must show the intended landing pose.
4. Fix, re-render, repeat. Show the user the final file path plus what you couldn't verify (you cannot hear audio or judge feel — state that).

## 8. Kickoff hard rules recap

One accent color per video · brand fonts only · ≤ 3 words at a time · every beat has an owner · real transitions · slow drift always · testnet label always · no Player Perps · no invented payouts.

## To calibrate later (from the reference videos)

Measure and replace the *(start value)* numbers: typical scene length in beats; entrance durations and eases; stagger spacing; overshoot amounts; drift magnitude; margin/whitespace ratio; which transition types appear and how long; hold durations; how much sits on screen at once. Frame-by-frame analysis with ffmpeg scene detection and stills can supply most of this.
