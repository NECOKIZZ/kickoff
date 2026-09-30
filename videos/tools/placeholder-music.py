"""Placeholder music for Kickoff video drafts (self-synthesised, no licensing issues).

Shape copied from the reference video: 210 BPM pulse, a hit every 8 pulses (2.29s),
pulses 0-5 carry rhythm, pulses 6-7 drop out (the "breath"), a short riser into the
next hit. 13 phrases = 30s. Replace with a licensed track for anything published.

Usage: pip install numpy && python3 videos/tools/placeholder-music.py out.wav [seconds=30]
       ffmpeg -i out.wav -b:a 192k videos/<slug>/assets/music.mp3
"""
import numpy as np, wave, sys
SR = 44100; P = 60 / 210; PH = 8 * P
DUR = float(sys.argv[2]) if len(sys.argv) > 2 else 30.0
NPH = int(DUR // PH) - 1  # index of the last hit, which rings out to the end
n = int(SR * DUR); out = np.zeros(n)
rng = np.random.default_rng(11)

def add(sig, at, g=1.0):
    i = int(at * SR); j = min(n, i + len(sig))
    if i < n: out[i:j] += g * sig[:j - i]

def kick(d=0.4):
    tt = np.arange(int(SR * d)) / SR; f = 48 + 120 * np.exp(-tt * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 8)

def hat(d=0.05):
    tt = np.arange(int(SR * d)) / SR; x = np.diff(np.concatenate([[0], rng.standard_normal(len(tt))]))
    return x * np.exp(-tt * 80) * 0.3

def clap(d=0.18):
    tt = np.arange(int(SR * d)) / SR; x = rng.standard_normal(len(tt))
    return x * (np.exp(-tt * 28) + 0.5 * np.exp(-np.maximum(tt - 0.01, 0) * 45) * (tt > 0.01)) * 0.3

def pluck(f, d=0.22):
    tt = np.arange(int(SR * d)) / SR
    return (np.sin(2 * np.pi * f * tt) + 0.4 * np.sin(2 * np.pi * 2 * f * tt)) * np.exp(-tt * 14) * 0.16

def bass(f, d):
    tt = np.arange(int(SR * d)) / SR
    return (np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(2 * np.pi * 2 * f * tt)) * np.minimum(1, tt * 60) * np.exp(-tt * 1.5) * 0.34

def impact(d=0.9):
    tt = np.arange(int(SR * d)) / SR
    return kick(d) * 1.1 + rng.standard_normal(len(tt)) * np.exp(-tt * 9) * 0.22

roots = [55, 65.4, 49, 58.3]
arp = [[440, 523, 659, 523, 587], [392, 523, 587, 659, 523], [392, 494, 587, 494, 659], [466, 587, 698, 587, 659]]
for k in range(NPH + 1):
    t0 = k * PH
    add(impact(), t0, 1.0)
    add(bass(roots[k % 4], 6 * P), t0, 1.0)
    if k == NPH:
        continue
    for p in range(6):
        t = t0 + p * P
        add(hat(), t, 0.9); add(hat(), t + P / 2, 0.45)
        if p in (3,): add(kick(), t, 0.8)
        if p in (2, 4): add(clap(), t, 0.9)
        add(pluck(arp[k % 4][p % 5]), t, 1.0)
    # breath: pulses 6-7 near-silent, a short noise riser into the next hit
    i0 = int((t0 + 7 * P) * SR); i1 = int((t0 + 8 * P) * SR); tt = np.arange(i1 - i0) / SR
    out[i0:i1] += rng.standard_normal(len(tt)) * (tt / P) ** 3 * 0.12
out = out / np.max(np.abs(out)) * 0.89
fs = int((DUR - 1.4) * SR); out[fs:] *= np.linspace(1, 0, n - fs)
pcm = (np.stack([out, out], 1) * 32767).astype(np.int16)
w = wave.open(sys.argv[1], 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes()); w.close()
