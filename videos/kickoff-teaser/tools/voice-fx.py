"""Sorcerer voice treatments for the teaser VO: pitch/formant shift, EQ, grit, convolution reverb.
Usage: python3 tools/voice-fx.py <preset> <in.wav> <out.wav>
"""
import subprocess, sys, tempfile, os
import numpy as np, soundfile as sf

SR = 48000

def ir(seconds, damp, predelay=0.02, seed=1):
    """Synthetic hall IR: noise with exponential decay, darker over time."""
    rng = np.random.default_rng(seed)
    n = int(SR * seconds); t = np.arange(n) / SR
    x = rng.standard_normal((n, 2)) * np.exp(-t * (6.9 / seconds))[:, None]
    # progressive low-pass (late tail darker)
    y = np.zeros_like(x); acc = np.zeros(2)
    a = np.clip(0.2 + damp * t / seconds, 0, 0.97)
    for k in range(n):
        acc = acc * a[k] + x[k] * (1 - a[k]); y[k] = acc
    y = np.concatenate([np.zeros((int(SR * predelay), 2)), y])
    return y / np.max(np.abs(y))

PRESETS = {
    #            pitch  formant    eq                                                     grit  ir(s,damp)  wet   sub-octave
    "sorcerer": (0.82, "shifted",  "lowshelf=f=140:g=4,equalizer=f=320:t=q:w=1:g=-2,equalizer=f=3200:t=q:w=1.2:g=2.5", 0.25, (3.2, 0.85), 0.22, 0.0),
    # the chosen narrator: Old Sorcerer without the room (the user heard the echo)
    "sorcerer-dry": (0.82, "shifted", "lowshelf=f=140:g=4,equalizer=f=320:t=q:w=1:g=-2,equalizer=f=3200:t=q:w=1.2:g=2.5", 0.25, None, 0.0, 0.0),
    "ancient":  (0.89, "preserved","lowshelf=f=120:g=5,equalizer=f=2800:t=q:w=1:g=1.5",      0.10, (2.2, 0.8),  0.15, 0.0),
    "storyteller": (0.80, "shifted","lowshelf=f=150:g=3,equalizer=f=2500:t=q:w=1:g=3",       0.35, (1.2, 0.7),  0.12, 0.0),
    "oracle":   (0.79, "shifted",  "lowshelf=f=130:g=4,equalizer=f=3000:t=q:w=1:g=2",        0.20, (4.2, 0.9),  0.30, 0.18),
    "trailer":  (0.94, "preserved","lowshelf=f=110:g=4,equalizer=f=3500:t=q:w=1:g=2",        0.05, (0.9, 0.6),  0.10, 0.0),
    "elder":    (0.85, "shifted",  "lowshelf=f=140:g=3,equalizer=f=2600:t=q:w=1:g=2.5",      0.30, (2.6, 0.85), 0.18, 0.0),
}

def main(preset, src, dst):
    pitch, formant, eq, grit, rev, wet, sub = PRESETS[preset]
    d = tempfile.mkdtemp()
    dry = os.path.join(d, "dry.wav"); irf = os.path.join(d, "ir.wav")
    chain = f"aresample={SR},rubberband=pitch={pitch}:formant={formant}:transients=smooth,{eq}"
    if grit: chain += f",asoftclip=type=tanh:threshold={1 - grit * 0.6}"
    chain += ",acompressor=threshold=-20dB:ratio=3:attack=8:release=180:makeup=4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-af", chain, "-ac", "2", dry], check=True)
    if sub:  # a ghost an octave below, low and blurred
        oct_ = os.path.join(d, "oct.wav")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", dry, "-af", "rubberband=pitch=0.5:formant=shifted,lowpass=f=1800", "-ac", "2", oct_], check=True)
        a, _ = sf.read(dry); b, _ = sf.read(oct_); m = min(len(a), len(b)); a = a[:m] + b[:m] * sub; sf.write(dry, a, SR)
    if not wet:  # dry: no reverb, just level
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", dry, "-af", "loudnorm=I=-16:TP=-1.5", "-ar", "44100", dst], check=True)
        return
    rs, damp = rev
    sf.write(irf, ir(rs, damp), SR)
    fc = (f"[0:a]asplit[a][b];[b][1:a]afir=dry=10:wet=10[r];"
          f"[a]volume={1 - wet}[d];[r]volume={wet * 2.2}[w];[d][w]amix=inputs=2:normalize=0,"
          f"apad=pad_dur={rs * 0.6},loudnorm=I=-16:TP=-1.5")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", dry, "-i", irf, "-filter_complex", fc, "-ar", "44100", dst], check=True)

if __name__ == "__main__":
    main(*sys.argv[1:4])
