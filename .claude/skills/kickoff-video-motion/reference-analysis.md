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
