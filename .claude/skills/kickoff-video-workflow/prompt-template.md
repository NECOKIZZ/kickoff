# Kickoff video prompt template

Fill the brackets, paste to Claude Code in this repo. The skills supply brand, facts and motion rules, so the prompt only needs the brief, the assets and the storyboard.

```
Make a [15]-second [16:9 | 9:16] motion graphic video with HyperFrames for Kickoff.

Use the kickoff-video-brand, kickoff-video-product, kickoff-video-motion and
kickoff-video-workflow skills, plus the HyperFrames skills they point to.
Read them before writing anything.

Purpose: [launch teaser | explain how Score Markets work | Season Accumulator | matchday]
Audience: [football fans on X | crypto-curious | ...]
The one thing viewers should remember: [Closeness pays: you can be wrong and still win.]
CTA: [Join the waitlist at kickoff.cash]

Style: same as videos/kickoff-launch-v2 (cream + purple, sticker words, floating cards).
      [or: dark (ink + green)]  One accent only.
Project folder: videos/[slug]/
Assets I've put in it: [assets/music.mp3, ...]  (brand logos/crests: copy from public/brand)
Music: assets/music.mp3. Run `npx hyperframes beats` first and put every scene change
and word entrance on the beat grid.

Storyboard (adjust freely, tell me what you change):
(one row per musical phrase, ~2.3s each; a scene is usually 1–2 phrases)
1. [0-4.6s]   [yes/no card, cursor clicks Yes; card slides aside; "Yes or no?" "Too blunt." stickers]
2. [4.6-9.1s] [iris to dark: "Proximity Markets." letter slam; feature pills]
3. [9.1-13.7s][grid card, cursor clicks 2-1; stake card flies in; Stake -> "✓ Staked" + confetti]
4. [...]      [...]
5. [last]     [cards collapse into the logo; tagline; waitlist + "Testnet · play money" pills]

Process: check with `npx hyperframes check .` and fix everything; render a draft;
pull stills at each scene change and look at them; fix overlaps, spacing and timing;
re-render; repeat until the frames are right. Then give me the file path and tell me
what you could not verify.
```

Notes
- Leave the storyboard out and Claude will propose one first (and should show it before building anything over ~15s).
- The music must be a track you have rights to. Without it Claude generates a placeholder with `videos/tools/placeholder-music.py` and says so.
- Player Perps, real-money claims and payout promises are refused by the product skill; if you ask for them Claude should push back.
