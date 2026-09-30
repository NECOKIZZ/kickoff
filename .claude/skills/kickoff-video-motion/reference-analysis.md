# Reference analysis (craft notes)

> **How to use this file.** These are measurements of another creator's videos, kept to learn **craft**: timing, easing, how effects and demos are built. They are not a template. Don't reuse their stories, copy, props (ledgers, payslips, redaction, phones receiving pay) or scene order. Their product is about privacy, and Kickoff's is about openness, so hiding motifs are off-brand. Translate each technique through the idea pass and visual language in `SKILL.md`. The user's own words: the references are there "to expand your horizon and show you what is possible", "not for you to copy them verbatim".
>
> **The creator's own workflow**, as the user relayed it: a plain-words storyboard with rough timings; a real brand kit (fonts, colours, logo, real product screens); music first, then `npx hyperframes beats` so every scene change and word lands on a beat; kinetic type where each word enters differently, cards that slam in, a cursor clicking through the product, real transitions (wipe, zoom-through, push, whip pan with blur); `npx hyperframes check`; render, pull stills with ffmpeg, fix, render again (2–3 rounds). Their tips: one accent colour, at most 2–3 words on screen, sync to the music, show the actual product doing the thing. Kickoff's workflow skill already follows this; the idea pass is our addition.

# Reference 1: the "Gloam × Tempo" SDK launch video

The first of the user's reference videos for the feel of Kickoff videos. 15s, 30fps, light theme. Measured frame by frame with ffmpeg (4fps overview plus 30fps close-ups) and `hyperframes beats` on its audio, 2026-09-29. The video itself is not in the repo (third-party content); these notes are the record.

## Rhythm: phrases, not just beats

- Pulse 0.2857s (210 BPM, detected with high confidence). Strong hits (strength ~1.0) every **8 pulses = 2.29s**: 0.84, 3.12, 5.41, 7.69, 9.98, 12.27.
- **Every scene change sits on a strong hit.** 3.1 cut to the code card, 5.4 iris into the dark hero, 7.7 back to light, 10.0 new section, 12.3 cards collapse into the logo.
- Inside a phrase, the action happens on pulses 1–5: one word, card, or state change per pulse ("Private" 1.12, "money," 1.41, "one" 1.69, "import." 1.98).
- Pulses 6–8 are a **breath**: the music drops out (no beats detected for about 0.85s) and the frame holds, apart from drift and ambient particles. Then the hit. This rest-then-hit is a large part of why it feels tight.

## Entrances are fast and resolve from blur

- **Sticker word:** opacity 0, blur ~12px (at 1080p), scale ~1.08, rotation ~−3°, offset ~30px → sharp in **~0.13s (4 frames)**, then eases to a resting tilt of ±1–2° over ~0.3s. The next word starts one pulse later, initially overlapping the previous word, then slides to its slot.
- **Hero wordmark ("TEMPO"):** a small line ("Now live on") fades in first. Then each letter slams **0.1s apart**, each from a different oversized, skewed (~−15°) and semi-transparent position (T from upper left, M from the right, P from above), settling with blur. Italic heavy sans.
- **Cards:** fly up from below the frame, rotated ~−12°, settling at ±2–4° in ~0.3s with a slight overshoot. Fanned in one per pulse.
- **Pills and badges:** pop (scale ~0.7→1) one per pulse beneath a hero ("PathUSD", "AlphaUSD" …; "Agent ready: x402 and MCP").

## Transitions (all fast, all on a hit)

| Time | Type | Duration |
|---|---|---|
| 3.0 | Diagonal two-tone wipe (ink panel with a purple leading edge) | ~0.25s |
| 5.25 | Black circle iris, expanding from the right edge | ~0.17s |
| 7.5 | Dark → light blur-dissolve; the next card is already in place, blurred | ~0.25s |
| 12.25 | Match cut: the feature cards collapse into the logo mark at centre | ~0.3s |

No plain fades, no slow pushes.

## Layout and coordinated movement

- Warm off-white background (≈ #EEEDE8) with a **faint dot grid**; white cards with soft, large, low-opacity shadows; black ink; one accent (green), with purple only inside the wipe.
- **Product UI on one side, sticker words on the other**, alternating sides between scenes.
- **Reflow:** when new content enters, what's already there moves at the same moment to rebalance. The terminal travels from centre-left to top-right and shrinks as the headline arrives; the logo slides left as the wordmark appears. Nothing jumps; nothing is left stranded.
- Lots of empty space. The UI card is roughly 25–35% of frame width; sticker type is modest (cap height ~5% of frame width), not huge.
- Max 2 lines × 2 words of sticker text at a time.

## Product demo moments

- Terminal types `npm i @gloamtrade/sdk` → "added … 0.0.4" success line and a **confetti burst**.
- A cursor clicks a toggle (Robinhood → Tempo); changed code lines get a highlight bar; the sticker "New network." blurs in.
- A payment card: cursor clicks **Send → "✓ Sent privately"**, the amount blurs out (privacy), an "Amount hidden" badge pops in, and a smiley **stamp badge rotates in**.
- End card: logo mark alone → slides left as the wordmark reveals → the partner name slams in → install pill + accent "now on Tempo" pill → confetti + stamp.

## What this means for Kickoff

Kickoff's cream theme (#F7F5F0 / #EDEAE0, ink #111210, purple #7B62F6) maps almost one to one onto the reference palette. Sticker words in Clash Display 700; hero reveals in Fraunces 700. The product demo equivalent is the Score Market grid: pick a cell → Stake → "✓ Staked", and at full time the result cards fan in.

---

# Reference 2: the "Gloam Payroll" launch video

Same creator, same visual system as reference 1 (20s, 30fps, light theme, one dark hero scene). Analysed 2026-09-30 the same way (4fps overview, 30fps close-ups, `hyperframes beats`). What it adds is mostly **live illustration of the product's functionality**.

## Rhythm

- Same phrase grid: strong hits every 2.29s (0.84, 3.12, 5.39, 7.67, 9.96, 12.25, 14.56), pulse ~0.28s.
- **Flams:** many hits are doubled ~0.1s apart (5.39/5.50, 7.67/7.79, 9.96/10.08, 12.25/12.35). Put the main impact on the first and a secondary settle (a badge, a pill) on the second.
- **The track builds.** From ~11.4s hits come every 0.85–1.4s instead of every 2.29s. The demo's climax (all paid + confetti), the proof toggle and the end card all sit in that denser final third, so the edit speeds up with the music.

## Story structure (20s)

1. **Problem, shown on the product UI** (0–3.1): stickers "Paying your team onchain?" with a "Public ledger" card filling with names and amounts, one row per pulse. Inverted sticker "Everyone sees" + "who got what." with a scribble underline.
2. **Flip on the hit** (3.1–5.3): "Not anymore." (inverted sticker) and **the same card redacts row by row**, one row per pulse: names become black bars, amounts ●●●●●, a green "Private transfer" tag appears. The before/after is a state change on one object.
3. **Hero** (5.4–7.5): iris to dark; logo mark + "Payroll" per-letter slam; subline; pills pop.
4. **Demo as a state machine** (7.5–12): the Payroll card goes empty → "team.csv" chip → "Reading team.csv…" → five rows populate with a "12 people" badge ("Upload / a list." stickers) → the cursor clicks "Pay 12 privately" → button spinner "Paying privately" → Status column flips "Ready → ✓ Paid" row by row while "n of 12 paid" counts up and a progress bar fills → "✓ 12 paid privately" + confetti. A hand-drawn arrow runs from the "at once." sticker to the button.
5. **Proof by toggle** (12.2–15.8): blur-whip into a "You see | The public sees" segmented control over "Your payroll" (names + amounts). The cursor clicks "The public sees", and a second card slides in beside it showing only redacted "Private transfer" rows. "Nobody sees / who got what." then "Not even / your wallet."
6. **End card** (15.9–20): diagonal wipe in navy; logo + partner name; "Payroll" (blur-in) + inverted "is live." on the next hit; subline; pills ("gloam.trade", green "Live on Tempo testnet"); confetti; smiley stamp.

## Transition added

- **Blur whip** (~0.2s): the whole outgoing scene blurs out with a slight zoom (~0.1s), and the incoming scene resolves from blur (~0.1s) with its content already animating in. Good between two light scenes where an iris or wipe would be too loud.

## No 3D flips here

This one has no 3D. See reference 3.

---

# Reference 3: "PAYDAY" (Gloam Payroll, cinematic cut)

Same product as reference 2, but a **dark, cinematic 40s version**: big white type instead of stickers, real 3D depth, a narrative with fewer, bigger hits. Analysed 2026-09-30 (2fps overview, 15fps close-ups, `hyperframes beats`).

## Rhythm

- The music isn't on a steady phrase grid (detector: ~235 BPM, low confidence). Strong hits cluster at the story's turns: 8.07 (hard cut to "Not anymore."), 10.15–11.0 (logo), 33.1 (stats), 36.0–37.5 (end card). **Big moments sit on the big hits; in between, the camera and UI keep moving continuously.** This is the model for longer (30–60s) cuts.

## Look

- Near-black background with faint drifting dust particles and a vignette. A diegetic **HUD in the top-right corner, "PAYDAY 09:00:05"**, ticks up throughout, a running clock that anchors the story.
- Type: huge grotesk, white, tight tracking (~9% of frame height), either centred or bottom-left, revealed line by line. No sticker labels.
- Light streaks sweep diagonally across the frame at the open and the close (~1s).
- One accent: green, used for the "good" state (outlines, "0 salaries exposed").

## 3D and depth (measured)

| Moment | What happens | Timing |
|---|---|---|
| Payslip ticket (0–1.5) | A perforated payslip card floats tilted in 3D (rotateY ≈ −15°, rotateX ≈ 8°), drifting slowly | continuous |
| **Object through type** (2.8–3.4) | "PAYDAY." slams in; the ticket starts small and far *behind* the letters, flies forward rotating and ends *in front*, covering the "D" | ~0.5s flight, settle to −5° |
| Tilted ledger + camera flight (4–7.5) | A "Public ledger" table in perspective (rotateX ≈ 25°, rotateY ≈ −10°). The camera glides across it; a connector line draws from one row to another and a box outlines the amount: "Romeo can see what Robin earns." | ~3.5s drift |
| **Pull-back reveal** (7.5) | The camera pulls out fast to show a wall of tiled ledgers: "So can everyone else." | ~0.5s |
| **Y-axis card flip** (11.8–12.2) | The hero title swings away on the Y axis (to ≈ 70° with blur); the product dashboard swings in from edge-on (≈ −80°) to −20°, then keeps flattening to ≈ −8° over ~0.4s (tilt-to-flatten) | ~0.35s swing + 0.4s settle |
| **Phone arc** (24–26) | Five phone mockups in a shallow 3D arc (outer ones angled ≈ ±18° towards the centre, centre one closest). Screens light up left to right, one per ~0.3s: lock screen "09:00", notification "You got paid privately · 4,200 PathUSD" | 5 × 0.3s |
| **Type zoom-through** (27.3) | "Everyone sees only their own." scales up past the camera into the next scene | ~0.3s |

## Transitions and devices

- **Theme flash:** the only light frame is the turn: a hard cut to white "Not anymore." (8.0) with a green line tracing the frame border. Then back to dark, where the green border **shrinks into a card, then into the glowing logo mark** (9–10.5). One continuous shape carries you from the problem to the product.
- **Text scramble/decode** between phrases: the old line breaks into random glyphs (~0.1s); the new line decodes left to right (~0.4s). Used for "H16 → Payroll" and "No wallet… → Claim links for anyone." (HyperFrames `rules/hacker-flip-3d.md`.)
- **Row-by-row redaction on a toggle** (20–23.5): "You see | The public sees"; after the click each row morphs into "Private transfer ●●●●●" with a green outline, one per pulse; the last row's number scrambles.
- **Name marquee** (28): "No names." over a row of names sliding by, each covered by a box as it passes. "No amounts.": a "6,000" morphs into a ●●●●● pill.
- **Stats finale** (32–35): stacked count-ups: "4 → 5 people paid", "16,423 → 24,400 PathUSD", "1 → 0 salaries exposed" (the 0 in green). A green outline draws around the stack, then shrinks into the logo mark: the same shape-morph used at the start.
- **End card:** logo glow → "Payroll is live." decodes → partner lockup → subline → pills; a light streak crosses.

## Product demo

The real app dashboard (tilted, then flat): drop "team.csv" → "Reading…" → rows populate while the total counts 0 → 6,000 → 15,000 → 24,400 → click "Pay 5 people privately" → a "Paying Yomi… Paying Robin…" header advances while row statuses cycle Waiting → Sending → Paid → a "5 people paid privately" success panel. Big left type: "Upload your team." then "Pay everyone at once." Also shown: **the recipient's side** (the phones), meaning the outcome from the other party's point of view.
