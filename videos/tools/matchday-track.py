"""Matchday track: an original, self-synthesised 45s electronic track for Kickoff videos.

128 BPM, 24 bars (1.875s each) = exactly 45s. Arrangement (bar numbers from 0):
  0-3   intro: pad, filtered kick from bar 2, hats building, riser + snare roll in bar 3
  4     DROP 1 (impact at 7.5s)
  4-11  groove: four-on-the-floor, claps on 2 and 4, pumping bass, pluck arp
  8     referee whistle (kickoff) at 15.0s; bar 10 full-time whistle at 18.75s
  12-13 break: kick out, pad + arp, riser + snare roll into
  14    DROP 2 (impact at 26.25s), 16th arp, extra percussion
  14-21 full groove; 21 has a short build
  22    final hit (41.25s) and ring-out to 45s

Usage: pip install numpy && python3 videos/tools/matchday-track.py out.wav
       ffmpeg -i out.wav -af loudnorm=I=-14:TP=-1.5:LRA=11 -ar 44100 -b:a 192k videos/<slug>/assets/music.mp3
"""
import sys, wave
import numpy as np

SR = 44100
BPM = 128
B = 60 / BPM          # beat
BAR = 4 * B           # 1.875s
DUR = 24 * BAR        # 45.0s
n = int(SR * DUR)
L = np.zeros(n); R = np.zeros(n)
rng = np.random.default_rng(2026)

def put(sig, t, g=1.0, pan=0.0):
    i = int(t * SR); j = min(n, i + len(sig))
    if i >= n or j <= i: return
    s = sig[: j - i] * g
    L[i:j] += s * (1 - max(0, pan)); R[i:j] += s * (1 + min(0, pan))

def tt(d): return np.arange(int(SR * d)) / SR

def kick(d=0.42, hard=1.0):
    t = tt(d); f = 42 + 150 * np.exp(-t * 32)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6.5)
    click = rng.standard_normal(len(t)) * np.exp(-t * 400) * 0.25 * hard
    return np.tanh((body + click) * 1.6)

def clap(d=0.25):
    t = tt(d); x = rng.standard_normal(len(t))
    env = sum(np.exp(-np.maximum(t - o, 0) * 60) * (t >= o) for o in (0, 0.011, 0.022)) + 0.4 * np.exp(-t * 14)
    return hp(x, 0.9) * env * 0.35

def hat(d=0.05, open_=False):
    t = tt(0.22 if open_ else d); x = hp(rng.standard_normal(len(t)), 0.97)
    return x * np.exp(-t * (14 if open_ else 90)) * 0.28

def snare(d=0.18):
    t = tt(d); x = hp(rng.standard_normal(len(t)), 0.6)
    return (x * np.exp(-t * 22) * 0.4 + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.3)

def hp(x, a):  # one-pole high-pass
    return x - np.concatenate([[0], x[:-1]]) * a

def saw(f, d, harm=14):
    t = tt(d)
    return sum(((-1) ** (k + 1)) * np.sin(2 * np.pi * k * f * t) / k for k in range(1, harm + 1)) * (2 / np.pi)

def supersaw(f, d):
    return (saw(f, d, 10) + saw(f * 1.006, d, 10) + saw(f * 0.994, d, 10)) / 3

def pluck(f, d=0.28):
    t = tt(d)
    return (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * 2 * f * t) + 0.2 * np.sin(2 * np.pi * 3 * f * t)) * np.exp(-t * 11) * 0.22

def bassnote(f, d):
    t = tt(d)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.tanh(3 * np.sin(2 * np.pi * f * t))
    return s * np.minimum(1, t * 200) * np.minimum(1, (d - t) * 60) * 0.42

def impact(d=2.2):
    t = tt(d)
    boom = np.sin(2 * np.pi * np.cumsum(38 + 90 * np.exp(-t * 9)) / SR) * np.exp(-t * 2.2)
    crash = hp(rng.standard_normal(len(t)), 0.95) * np.exp(-t * 2.6) * 0.35
    return np.tanh((boom * 1.2 + crash))

def riser(d):
    t = tt(d); x = hp(rng.standard_normal(len(t)), 0.9)
    return x * (t / d) ** 2.2 * 0.35

def whistle(d, trill=True):
    t = tt(d)
    f = 2950 + (70 * np.sin(2 * np.pi * 38 * t) if trill else 0)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.25 * np.sin(2 * np.pi * np.cumsum(2 * f) / SR)
    env = np.minimum(1, t * 60) * np.minimum(1, (d - t) * 30)
    return s * env * 0.16

# harmony: Am - F - C - G (one chord per bar)
ROOTS = [55.0, 43.65, 65.41, 49.0]
CHORDS = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392.0], [196, 246.94, 293.66]]
ARP = [[440, 523.25, 659.25, 880], [349.23, 440, 523.25, 698.46], [523.25, 659.25, 783.99, 1046.5], [392, 493.88, 587.33, 783.99]]

def section(bar):
    if bar < 4: return "intro"
    if bar < 12: return "drop1"
    if bar < 14: return "break"
    if bar < 22: return "drop2"
    return "outro"

pump = np.ones(n)  # sidechain envelope, dipped at each kick
def duck(t):
    i = int(t * SR); d = int(0.22 * SR); j = min(n, i + d)
    if i < n: pump[i:j] = np.minimum(pump[i:j], 0.35 + 0.65 * (np.arange(j - i) / d) ** 0.7)

pads = np.zeros(n); bass = np.zeros(n)
for bar in range(24):
    t0 = bar * BAR; sec = section(bar); ch = bar % 4
    # pad (bars 0-21), bigger in drops
    if bar < 22:
        p = supersaw(CHORDS[ch][0] / 2, BAR) + supersaw(CHORDS[ch][1] / 2, BAR) + supersaw(CHORDS[ch][2] / 2, BAR)
        env = np.minimum(1, tt(BAR) / (0.6 if sec == "intro" else 0.05)) * np.minimum(1, (BAR - tt(BAR)) / 0.08)
        i = int(t0 * SR); pads[i:i + len(p)] += p * env * {"intro": 0.05, "break": 0.11}.get(sec, 0.07)
    for beat in range(4):
        tb = t0 + beat * B
        if sec == "intro":
            if bar >= 2: put(kick(hard=0.5), tb, 0.45)
            if bar >= 1: put(hat(), tb + B / 2, 0.35 + 0.1 * bar)
        elif sec in ("drop1", "drop2"):
            put(kick(), tb, 1.0); duck(tb)
            if beat in (1, 3): put(clap(), tb, 1.0, pan=0.1)
            put(hat(open_=True), tb + B / 2, 0.5, pan=-0.2)
            if sec == "drop2":
                put(hat(), tb + B / 4, 0.35, pan=0.3); put(hat(), tb + 3 * B / 4, 0.35, pan=0.3)
        elif sec == "break":
            put(hat(), tb + B / 2, 0.25)
        # bass: offbeat 8ths in drops
        if sec in ("drop1", "drop2"):
            for e in range(2):
                bn = bassnote(ROOTS[ch] * (2 if e else 1), B / 2 * 0.9)
                i = int((tb + e * B / 2) * SR); bass[i:i + len(bn)] += bn
        # arp: 8ths in drop1 / break, 16ths in drop2
        if sec in ("drop1", "break", "drop2"):
            steps = 4 if sec == "drop2" else 2
            for s in range(steps):
                note = ARP[ch][(beat * steps + s) % 4]
                put(pluck(note), tb + s * B / steps, 0.9 if sec != "break" else 1.0, pan=(0.35 if s % 2 else -0.35))
    # fills / builds
    if bar in (3, 13):
        put(riser(BAR), t0, 1.0)
        for k in range(16):  # accelerating snare roll
            put(snare(), t0 + k * B / 4, 0.15 + 0.5 * k / 16)
    if bar == 21:
        put(riser(BAR), t0, 0.8)
        for k in range(8): put(snare(), t0 + 2 * B + k * B / 4, 0.2 + 0.4 * k / 8)

# impacts on the drops and the final hit
for t in (4 * BAR, 14 * BAR, 22 * BAR):
    put(impact(), t, 1.0)
put(kick(0.6), 22 * BAR, 1.0)
# final chord ring-out
fc = sum(supersaw(f / 2, 3.6) for f in CHORDS[0]) * np.exp(-tt(3.6) * 1.1) * 0.08
put(fc, 22 * BAR, 1.0)
# referee whistles: kickoff (short), full time (long, two peeps + long)
put(whistle(0.32), 8 * BAR, 1.0)
put(whistle(0.22), 10 * BAR, 1.0); put(whistle(0.22), 10 * BAR + 0.3, 1.0); put(whistle(0.85), 10 * BAR + 0.62, 1.0)

mix_bus = pads * pump + bass * pump
L += mix_bus; R += mix_bus
mix = np.stack([L, R], 1)
mix = np.tanh(mix * 0.7) / np.tanh(0.7)          # gentle glue / soft clip
mix = mix / np.max(np.abs(mix)) * 0.89
fade = np.ones(n); fs = int((DUR - 1.2) * SR); fade[fs:] = np.linspace(1, 0, n - fs) ** 1.5
mix *= fade[:, None]
pcm = (mix * 32767).astype(np.int16)
w = wave.open(sys.argv[1], "wb"); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes()); w.close()
