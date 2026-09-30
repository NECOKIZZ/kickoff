# Reference analysis: the "Gloam × Tempo" SDK launch video

The user's chosen reference for the feel of Kickoff videos. 15s, 30fps, light theme. Measured frame by frame with ffmpeg (4fps overview plus 30fps close-ups) and `hyperframes beats` on its audio, 2026-09-29. The video itself is not in the repo (third-party content); these notes are the record.

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

Neither reference so far uses 3D card flips. Those are expected in the remaining reference videos.
