"""Original synthesized score + SFX for the trailer, synced to recorded marks.

usage: python3 audio.py <out_dir> <duration_seconds>
Reads out_dir/marks.json and out_dir/frames.json; writes out_dir/audio.wav.
"""
import json
import sys
import wave

import numpy as np

OUT = sys.argv[1]
DUR = float(sys.argv[2])
SR = 44100
N = int(SR * (DUR + 0.5))
rng = np.random.default_rng(7)

meta = json.load(open(f"{OUT}/marks.json"))
frames = json.load(open(f"{OUT}/frames.json"))
offset = meta["t0"] - frames[0]["t"]  # marks are relative to t0; video starts at first frame
marks = [(m["name"], m["t"] + offset) for m in meta["marks"]]
END_T = next((t for n, t in marks if n == "end"), DUR - 5)

L = np.zeros(N)
R = np.zeros(N)


def note(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def env(n, a=0.01, r=0.2, sustain=1.0):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * sustain
    tail = max(1, int(r * SR))
    if n > tail:
        e[-tail:] *= np.linspace(1, 0, tail)
    return e


def add(sig, start, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= N or i + len(sig) <= 0:
        return
    j = min(N, i + len(sig))
    s = sig[: j - i] * gain
    L[i:j] += s * (1 - pan) * 0.5 * 2 ** 0.5
    R[i:j] += s * (1 + pan) * 0.5 * 2 ** 0.5


def osc(freq, dur, kind="sine", detune=0.0):
    t = np.arange(int(dur * SR)) / SR
    f = freq * (1 + detune)
    if kind == "sine":
        return np.sin(2 * np.pi * f * t)
    if kind == "tri":
        return 2 * np.abs(2 * ((f * t) % 1) - 1) - 1
    if kind == "saw":
        return 2 * ((f * t) % 1) - 1
    raise ValueError(kind)


def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):  # one-pole; fine for short buffers
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


# ---------------------------------------------------------------- music
BPM = 112
BEAT = 60 / BPM
BAR = 4 * BEAT
# A minor pop loop: Am - F - C - G
CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
ROOTS = [45, 41, 36, 43]

music_end = END_T + 4.5
bar_i = 0
t = 0.0
pad_cache = {}
while t < music_end:
    c = CHORDS[bar_i % 4]
    root = ROOTS[bar_i % 4]
    intro = t < 4.0
    outro = t >= END_T
    # Pad: detuned saws, filtered
    key = bar_i % 4
    if key not in pad_cache:
        p = sum(osc(note(m), BAR, "saw", d) for m in c for d in (-0.004, 0.004)) / 6
        pad_cache[key] = lowpass(p, 1400) * env(len(p), a=0.25, r=0.35)
    add(pad_cache[key], t, 0.16 if not intro else 0.2, pan=-0.15)
    add(pad_cache[key], t + 0.012, 0.16 if not intro else 0.2, pan=0.15)

    if not intro and not outro:
        for b in range(8):  # bass on 8ths
            bt = t + b * BEAT / 2
            s = osc(note(root), BEAT / 2 * 0.9, "tri") * env(int(BEAT / 2 * 0.9 * SR), 0.005, 0.08)
            add(s, bt, 0.22)
        for b in (0, 2):  # kick
            kt = t + b * BEAT
            n = int(0.35 * SR)
            tt = np.arange(n) / SR
            f = 50 + 110 * np.exp(-tt * 30)
            k = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 9)
            add(k, kt, 0.55)
        if t > 8:
            for b in range(4):  # off-beat hats
                ht = t + b * BEAT + BEAT / 2
                n = int(0.05 * SR)
                h = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 90)
                add(np.diff(h, prepend=0), ht, 0.08, pan=0.3)
            add(rng.standard_normal(int(0.12 * SR)) * np.exp(-np.arange(int(0.12 * SR)) / SR * 30), t + BEAT, 0.06)  # snare-ish
            add(rng.standard_normal(int(0.12 * SR)) * np.exp(-np.arange(int(0.12 * SR)) / SR * 30), t + 3 * BEAT, 0.06)
        if t > 12:
            arp = c + [c[0] + 12]
            for s16 in range(16):
                at = t + s16 * BEAT / 4
                m = arp[s16 % 4] + 12
                pl = osc(note(m), 0.16, "tri") * np.exp(-np.arange(int(0.16 * SR)) / SR * 22)
                add(pl, at, 0.05, pan=0.4 if s16 % 2 else -0.4)
    t += BAR
    bar_i += 1

# Riser into the first scene
n = int(1.8 * SR)
riser = rng.standard_normal(n) * np.linspace(0, 1, n) ** 2
add(lowpass(riser, 3000), 2.4, 0.12)

# ---------------------------------------------------------------- sfx


def bell(m, dur=0.6):
    s = osc(note(m), dur) + 0.4 * osc(note(m) * 2.01, dur) + 0.2 * osc(note(m) * 3.0, dur)
    return s * np.exp(-np.arange(len(s)) / SR * 6) / 1.6


for name, at in marks:
    if name == "whoosh":
        n = int(0.6 * SR)
        w = lowpass(rng.standard_normal(n), 2500) * np.sin(np.linspace(0, np.pi, n))
        add(w, at - 0.1, 0.35)
    elif name == "pick":
        n = int(0.09 * SR)
        tt = np.arange(n) / SR
        add(np.sin(2 * np.pi * (500 + 3000 * tt) * tt) * np.exp(-tt * 40), at, 0.25)
    elif name == "lock":
        add(osc(note(76), 0.12, "tri") * np.exp(-np.arange(int(0.12 * SR)) / SR * 30), at, 0.2)
        add(osc(note(81), 0.18, "tri") * np.exp(-np.arange(int(0.18 * SR)) / SR * 20), at + 0.06, 0.2)
    elif name == "reveal_small":
        add(bell(76), at, 0.3)
        add(bell(79), at + 0.09, 0.28)
    elif name == "reveal_bullseye":
        for k, m in enumerate([72, 76, 79, 84, 88]):
            add(bell(m, 0.9), at + k * 0.07, 0.3, pan=(-0.3 + 0.15 * k))
        n = int(1.2 * SR)
        sh = lowpass(rng.standard_normal(n), 6000) * np.exp(-np.arange(n) / SR * 3)
        add(np.diff(sh, prepend=0), at, 0.25)
    elif name == "boss":
        n = int(0.9 * SR)
        tt = np.arange(n) / SR
        stab = sum(osc(note(m), 0.9, "saw") for m in (33, 45, 52)) / 3
        add(lowpass(stab, 900) * np.exp(-tt * 3.5), at, 0.5)
        boom = np.sin(2 * np.pi * np.cumsum(40 + 80 * np.exp(-tt * 12)) / SR) * np.exp(-tt * 4)
        add(boom, at, 0.6)
    elif name == "fanfare":
        for k, m in enumerate([67, 72, 76, 79, 84]):
            add(bell(m, 1.0), at + k * 0.11, 0.3, pan=(-0.4 + 0.2 * k))
    elif name == "end":
        n = int(3.5 * SR)
        tt = np.arange(n) / SR
        chord = sum(osc(note(m), 3.5, "saw", d) for m in (45, 57, 60, 64, 69) for d in (-0.003, 0.003)) / 10
        add(lowpass(chord, 1800) * np.exp(-tt * 0.9), at, 0.4)
        add(np.sin(2 * np.pi * np.cumsum(45 + 70 * np.exp(-tt * 10)) / SR) * np.exp(-tt * 3), at, 0.6)

# ---------------------------------------------------------------- master
fade_in = int(0.3 * SR)
fade_out = int(1.5 * SR)
mix = np.stack([L, R], axis=1)[: int(DUR * SR)]
mix[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
mix[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None]
mix = np.tanh(mix * 1.4)  # gentle saturation / limiting
mix *= 0.89 / max(1e-9, np.abs(mix).max())
pcm = (mix * 32767).astype(np.int16)
with wave.open(f"{OUT}/audio.wav", "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("audio ok", len(pcm) / SR, "s; marks:", [(n, round(t, 2)) for n, t in marks if n not in ("pick", "lock")])
