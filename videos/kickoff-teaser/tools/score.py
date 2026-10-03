"""Original score + sound design for the Kickoff teaser, synthesised to the edit in edit.json.

Writes assets/bed.wav: score + source-clip sound (crowd, commentary), ducked under the voiceover.
The voiceover itself stays as separate <audio> clips in index.html.

Usage: python3 tools/score.py <dir with c1..c7.mp4 and n1..n5.mp4>
"""
import json, subprocess, sys, wave
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
E = json.loads((ROOT / "edit.json").read_text())
H = E["hits"]
SR = 44100
DUR = E["duration"]
n = int(SR * DUR)
L = np.zeros(n); R = np.zeros(n)
rng = np.random.default_rng(7)


def tt(d): return np.arange(int(SR * d)) / SR


def put(sig, t, g=1.0, pan=0.0, buf=None):
    bl, br = (L, R) if buf is None else buf
    i = int(t * SR); j = min(n, i + len(sig))
    if i >= n or j <= i: return
    s = sig[: j - i] * g
    bl[i:j] += s * (1 - max(0, pan)); br[i:j] += s * (1 + min(0, pan))


def lp(x, a):  # one-pole low-pass, a in (0,1): higher = darker
    y = np.empty_like(x); acc = 0.0
    b = 1 - a
    for k in range(len(x)):
        acc = acc * a + x[k] * b; y[k] = acc
    return y


def lpf(x, cutoff):
    """FFT brick-ish low-pass (fast, fine for pads)."""
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / (1 + (f / cutoff) ** 4)
    return np.fft.irfft(X, len(x))


def hpf(x, cutoff):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 - 1 / (1 + (f / max(cutoff, 1)) ** 4)
    return np.fft.irfft(X, len(x))


def env(d, a=0.01, r=0.3):
    t = tt(d)
    return np.minimum(1, t / max(a, 1e-4)) * np.minimum(1, np.maximum(0, d - t) / max(r, 1e-4))


def saw(f, d, harm=16):
    t = tt(d)
    return sum(((-1) ** (k + 1)) * np.sin(2 * np.pi * k * f * t) / k for k in range(1, harm + 1)) * (2 / np.pi)


def supersaw(f, d, harm=12):
    return (saw(f, d, harm) + saw(f * 1.005, d, harm) + saw(f * 0.995, d, harm) + saw(f * 2.003, d, 6) * 0.3) / 3.3


def note(name):
    names = {"C": -9, "C#": -8, "D": -7, "Eb": -6, "E": -5, "F": -4, "F#": -3, "G": -2, "Ab": -1, "A": 0, "Bb": 1, "B": 2}
    p, o = name[:-1], int(name[-1])
    return 440 * 2 ** ((names[p] + (o - 4) * 12) / 12)


# ---------- instruments ----------
def boom(d=2.5, f0=34, depth=110, g=1.0):
    t = tt(d)
    body = np.sin(2 * np.pi * np.cumsum(f0 + depth * np.exp(-t * 10)) / SR) * np.exp(-t * 1.6)
    click = rng.standard_normal(len(t)) * np.exp(-t * 300) * 0.3
    return np.tanh((body + click) * 1.4) * g


def crash(d=3.0):
    t = tt(d)
    return hpf(rng.standard_normal(len(t)), 3000) * np.exp(-t * 1.6) * 0.22


def impact(d=4.0, g=1.0):
    t = tt(d)
    b = boom(d, 30, 140)
    metal = sum(np.sin(2 * np.pi * f * t) * np.exp(-t * k) for f, k in ((97, 1.2), (143, 1.6), (211, 2.2), (389, 3.5))) * 0.12
    return np.tanh(b * 1.1 + crash(d) * 1.3 + metal) * g


def braam(f, d):
    s = supersaw(f, d, 10) + supersaw(f * 1.498, d, 8) * 0.6 + np.sin(2 * np.pi * f / 2 * tt(d)) * 0.8
    s = lpf(s, 900)
    return np.tanh(s * 1.8) * env(d, 0.02, d * 0.7) * 0.5


def pad(freqs, d, cutoff=1200, a=1.5, r=1.5):
    s = sum(supersaw(f, d, 10) for f in freqs) / len(freqs)
    return lpf(s, cutoff) * env(d, a, r)


def bell(f, d=2.5):
    t = tt(d)
    return (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 3) + 0.2 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 6)) * np.exp(-t * 1.4) * 0.18


def tick(hi=True):
    t = tt(0.04)
    f = 2600 if hi else 1900
    return (np.sin(2 * np.pi * f * t) * 0.6 + hpf(rng.standard_normal(len(t)), 4000) * 0.5) * np.exp(-t * 160) * 0.35


def flap():
    t = tt(0.03)
    return hpf(rng.standard_normal(len(t)), 1500) * np.exp(-t * 220) * 0.25


def kick(d=0.45, g=1.0):
    t = tt(d); f = 45 + 160 * np.exp(-t * 30)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6)
    return np.tanh((body + rng.standard_normal(len(t)) * np.exp(-t * 400) * 0.2) * 1.7) * g


def snare(d=0.25):
    t = tt(d)
    return hpf(rng.standard_normal(len(t)), 900) * np.exp(-t * 18) * 0.42 + np.sin(2 * np.pi * 185 * t) * np.exp(-t * 28) * 0.3


def clap():
    t = tt(0.25); x = hpf(rng.standard_normal(len(t)), 1100)
    e = sum(np.exp(-np.maximum(t - o, 0) * 60) * (t >= o) for o in (0, 0.012, 0.024)) + 0.4 * np.exp(-t * 14)
    return x * e * 0.3


def hat(open_=False):
    t = tt(0.25 if open_ else 0.05)
    return hpf(rng.standard_normal(len(t)), 7000) * np.exp(-t * (12 if open_ else 80)) * 0.22


def bass(f, d):
    t = tt(d)
    s = np.sin(2 * np.pi * f * t) + 0.4 * np.tanh(3 * np.sin(2 * np.pi * f * t))
    return s * env(d, 0.005, 0.05) * 0.45


def pluck(f, d=0.3):
    t = tt(d)
    return (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(4 * np.pi * f * t)) * np.exp(-t * 12) * 0.16


def riser(d, f0=200, f1=3000):
    t = tt(d)
    x = rng.standard_normal(len(t))
    # sweep a band by mixing progressively brighter noise
    lo, hi = hpf(x, f0), hpf(x, f1)
    k = (t / d) ** 2
    tone = np.sin(2 * np.pi * np.cumsum(f0 / 2 + (f1 / 4 - f0 / 2) * (t / d) ** 2) / SR) * 0.25
    return ((lo * (1 - k) + hi * k) * 0.25 + tone) * (t / d) ** 2.2


def heartbeat():
    return np.concatenate([kick(0.18, 0.55), np.zeros(int(SR * 0.08)), kick(0.3, 0.4)])


def whistle(d=0.9):
    t = tt(d)
    f = 2850 + 120 * np.sin(2 * np.pi * 28 * t)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.3 * hpf(rng.standard_normal(len(t)), 2500) * 0.3
    return s * env(d, 0.02, 0.15) * 0.18


def whoosh(d=0.6):
    t = tt(d)
    x = rng.standard_normal(len(t))
    return lpf(x, 2500) * np.sin(np.pi * t / d) ** 2 * 0.5


# ---------- arrangement ----------
D2, A2, F2, D3, F3, A3, C3, E3 = (note(x) for x in ("D2", "A2", "F2", "D3", "F3", "A3", "C3", "E3"))
Bb2 = note("Bb2"); G2 = note("G2"); C2 = note("C2")

# A. Origins: dark drone, bell motif in the gaps between lines, low booms on each cut
put(pad([D2, A2, D3], H["chaos"], cutoff=380, a=3.0, r=1.2), 0.0, 0.45)
put(pad([F3, A3, note("D4")], H["chaos"] - H["noise"], cutoff=900, a=4.0, r=2.0), H["noise"] + 0.4, 0.35)
for i, (nm, t0) in enumerate((("D5", 0.35), ("A4", 4.25), ("D5", 9.15), ("C5", 11.45), ("A4", 12.95), ("F4", 14.6))):
    put(bell(note(nm)), t0, 0.9, pan=(-0.3 if i % 2 else 0.3))
for k, g in (("streets", 0.9), ("mud", 0.5), ("noise", 0.6), ("by", 1.0), ("of", 0.55), ("for", 0.7), ("simple", 0.5)):
    put(boom(2.6, g=g), H[k] - 0.01, 0.7)
put(whoosh(0.7), H["streets"] - 0.6, 0.6)
put(riser(H["chaos"] - H["simple"] - 0.3, 120, 1800), H["simple"] + 0.3, 0.35)

# B. Chaos: accelerating clock ticks, pulse, slow-mo save thud, red-card stab, riser into the goal
t, k = H["chaos"], 0
while t < H["goal"] - 0.05:
    put(tick(k % 2 == 0), t, 0.9 if k % 2 == 0 else 0.6)
    k += 1; frac = (t - H["chaos"]) / (H["goal"] - H["chaos"])
    t += 0.5 * (1 - frac) ** 1.6 + 0.07
put(boom(2.0, 32, 90), H["yes"], 0.8)
put(boom(2.0, 32, 90), H["win"], 0.8)
t = H["penalty"]
while t < H["goal"] - 0.1:
    frac = (t - H["penalty"]) / (H["goal"] - H["penalty"])
    step = 0.25 if frac < 0.55 else 0.125
    put(bass(D2, step * 0.9), t, 0.8)
    t += step
put(lpf(supersaw(D3, H["goal"] - H["penalty"]), 700) * np.linspace(0.05, 0.6, int(SR * (H["goal"] - H["penalty"]))), H["penalty"], 0.4)
put(whoosh(0.5), H["strike"] - 0.35, 0.7)                      # the strike, slowed
put(boom(2.4, 30, 60), H["save"] - 0.01, 0.9)                   # the save lands like a door slam
put(braam(D2, 1.4), H["reaction"], 0.4)
put(impact(3.0, 0.8), H["cardup"] - 0.01, 0.85)
put(braam(D2, 2.2), H["cardup"], 0.7)
put(riser(H["goal"] - H["late"], 150, 4000), H["late"], 0.55)
put(impact(5.0, 1.0), H["goal"] - 0.02, 1.0)
put(braam(D2, 2.6), H["goal"], 0.55)

# C. A thousand variables: flap clicks accelerating, collapse hit on "one scoreline"
t, k = H["variables"], 0
while t < H["scoreline"] - 0.02:
    put(flap(), t, 0.8, pan=0.5 * np.sin(k * 1.7)); k += 1
    frac = (t - H["variables"]) / (H["scoreline"] - H["variables"])
    t += 0.09 * (1 - frac) + 0.025
put(riser(H["scoreline"] - H["variables"], 300, 5000), H["variables"], 0.35)
put(impact(3.2, 0.9), H["scoreline"] - 0.01, 0.9)
put(bell(note("D5"), 3.0), H["scoreline"], 1.0)

# D. The takes: 120 BPM groove (the dialogue ducks it), denser into "every opinion", dead stop at the silence
B = 0.5
prog = [D2, D2, Bb2, C2]
t0 = H["takes"]
nb = int(round((H["silence"] - t0) / B))
for b in range(nb):
    t = t0 + b * B
    put(kick(), t, 0.85)
    if b % 2 == 1: put(clap(), t, 0.7)
    put(hat(), t + B / 2, 0.6)
    if t >= H["fan"]: put(hat(), t + B / 4, 0.35); put(hat(), t + 3 * B / 4, 0.35)
    root = prog[(b // 4) % 4]
    for s_ in range(2): put(bass(root, B / 2 * 0.85), t + s_ * B / 2, 0.7)
    if b >= 4:
        arp = [root * 4, root * 4 * 1.189, root * 4 * 1.498, root * 8]
        for s_ in range(4): put(pluck(arp[(b * 4 + s_) % 4]), t + s_ * B / 4, 0.8, pan=0.3 * (1 if s_ % 2 else -1))
for s_ in range(16):  # snare roll into the cut
    put(snare(), H["silence"] - 1.0 + s_ * 1.0 / 16, 0.25 + 0.5 * s_ / 16)
put(riser(2.6, 200, 5000), H["silence"] - 2.6, 0.4)

# E. The turn: near silence, a held high tone, heartbeat that quickens, reverse swell
gap = H["call"] - H["silence"]
put(np.sin(2 * np.pi * note("A5") * tt(gap - 0.2)) * env(gap - 0.2, 1.0, 1.0) * 0.035, H["silence"] + 0.2, 1.0)
put(pad([D3, F3, A3], gap + 0.1, cutoff=400, a=2.5, r=0.2), H["silence"], 0.35)
t = H["silence"] + 0.5
while t < H["call"] - 0.4:
    put(heartbeat(), t, 0.7); t += 1.0 if t < H["right"] else 0.75
put(riser(3.0, 100, 2500), H["call"] - 3.0, 0.5)

# F. Call the score -> full time
put(impact(3.5, 0.9), H["call"] - 0.01, 0.9)
put(tick(True), H["tap"], 1.0)
t = H["call"]
arp = [note("D4"), note("A4"), note("F4"), note("A4"), note("E4"), note("A4"), note("F4"), note("D5")]
k = 0
while t < H["ft"] - 0.1:
    put(pluck(arp[k % 8], 0.35), t, 0.9, pan=0.25 * (1 if k % 2 else -1))
    if k % 4 == 0: put(kick(0.4, 0.6), t, 0.8)
    k += 1; t += 0.25
put(pad([D3, F3, A3, note("C4")], H["ft"] - H["call"], cutoff=1100, a=0.5, r=0.3), H["call"], 0.35)
put(whistle(0.35), H["ft"] - 0.55, 1.0); put(whistle(1.0), H["ft"] - 0.12, 1.0)
put(impact(3.0, 0.8), H["ft"], 0.75)

# G. Anthem: big chords, half-time drums, cymbal swell, cut to black
chords = [[D3, F3, A3, note("D4")], [Bb2, D3, F3, note("Bb3")], [F2 * 2, A3, note("C4"), note("F4")], [C3, E3, G2 * 2, note("C4")]]
cd = (H["black"] - H["anthem"]) / 4
for i, ch in enumerate(chords):
    put(pad(ch, cd + 0.25, cutoff=1800 + i * 500, a=0.05, r=0.25), H["anthem"] + i * cd, 0.55)
    put(bass(ch[0] / 2, cd * 0.95), H["anthem"] + i * cd, 0.6)
for b in range(int((H["black"] - H["anthem"]) / 0.5)):
    t = H["anthem"] + b * 0.5
    if b % 4 == 0: put(kick(0.6, 1.0), t, 0.9)
    if b % 4 == 2: put(snare(0.4), t, 0.8)
    put(hat(open_=(b % 2 == 1)), t, 0.4)
put(boom(2.0), H["anthem"], 0.9)
put(riser(1.6, 400, 6000), H["black"] - 1.6, 0.4)

# H. Logo hit and tagline stinger
put(np.flip(crash(1.2)) * 1.4, H["logo"] - 1.2, 0.8)
put(impact(6.0, 1.0), H["logo"] - 0.01, 1.0)
put(pad([D2, A2, D3, note("E4"), F3], DUR - H["logo"], cutoff=900, a=0.3, r=3.5), H["logo"], 0.45)
put(bell(note("D5"), 4.0), H["tagline"], 1.0); put(bell(note("A5"), 4.0), H["tagline"] + 1.3, 0.8)
put(boom(2.0, 36, 60), H["tagline"] + 1.3, 0.5)

# I. Camera shutter on every negative-flash cut
def shutter():
    t = tt(0.12)
    x = hpf(rng.standard_normal(len(t)), 2000)
    clk = x * (np.exp(-t * 300) + 0.7 * np.exp(-np.maximum(t - 0.045, 0) * 260) * (t >= 0.045))
    thump = np.sin(2 * np.pi * 90 * t) * np.exp(-t * 40) * 0.6
    return (clk * 0.5 + thump) * 0.6
for t0 in E["shutters"]:
    put(shutter(), t0 - 0.02, 0.9)


# ---------- source-clip sound ----------
def load_src(path, ms, d):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(ms), "-t", str(d), "-i", str(path), "-vn", "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    a = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(float)
    m = int(SR * d)
    a = a[:m] if len(a) >= m else np.vstack([a, np.zeros((m - len(a), 2))])
    f = np.minimum(1, np.arange(m) / (SR * 0.02)) * np.minimum(1, (m - np.arange(m)) / (SR * 0.06))
    return a * f[:, None]


FX = (np.zeros(n), np.zeros(n))
src = Path(sys.argv[1]) if len(sys.argv) > 1 else None
if src:
    for clip, ms, at, d, g, _ in E["source_audio"]:
        if g <= 0: continue
        a = load_src(src / f"{clip}.mp4", ms, d)
        i = int(at * SR); j = min(n, i + len(a))
        FX[0][i:j] += a[: j - i, 0] * g; FX[1][i:j] += a[: j - i, 1] * g

# ---------- duck under the voiceover ----------
vo_env = np.zeros(n)
for vid, at in E["vo"]:
    p = ROOT / "assets" / "vo" / f"{vid}.mp3"
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    v = np.abs(np.frombuffer(raw, dtype=np.float32).astype(float))
    i = int(at * SR); j = min(n, i + len(v)); vo_env[i:j] = np.maximum(vo_env[i:j], v[: j - i])
for name, clip, ms, at, d in E.get("dialogue", []):
    p = ROOT / "assets" / "dialogue" / f"{name}.mp3"
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    v = np.abs(np.frombuffer(raw, dtype=np.float32).astype(float))
    i = int(at * SR); j = min(n, i + len(v)); vo_env[i:j] = np.maximum(vo_env[i:j], v[: j - i])
# smooth: fast attack (~20ms), slow release (~350ms), computed on 10ms blocks
blk = SR // 100
nb = n // blk + 1
lv = np.array([vo_env[k * blk:(k + 1) * blk].max() if k * blk < n else 0 for k in range(nb)])
sm = np.zeros(nb); acc = 0.0
for k in range(nb):
    acc = max(lv[k], acc * 0.972)
    sm[k] = acc
key = np.clip(sm / 0.25, 0, 1)
duck_music = np.repeat(1 - 0.72 * key, blk)[:n]   # about -11 dB under voice
duck_fx = np.repeat(1 - 0.80 * key, blk)[:n]      # crowd/commentary further down

out = np.stack([L * duck_music + FX[0] * duck_fx, R * duck_music + FX[1] * duck_fx], axis=1)
peak = np.max(np.abs(out)) or 1
out = np.tanh(out / peak * 1.6) * 0.9
pcm = (np.clip(out, -1, 1) * 32767).astype(np.int16)
dst = ROOT / "assets" / "bed.wav"
with wave.open(str(dst), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("wrote", dst, f"{DUR}s")
