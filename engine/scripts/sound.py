#!/usr/bin/env python3
"""Mixes the reel's sound: the voice, a soft click on every key word, a whoosh and a low hit at every scene change,
and a quiet pad under it all that ducks while the voice speaks. Writes reels/<slug>/sound.wav, which render.mjs
plays instead of the bare voice. Run it after align.py, and again after any new voice or caption.

usage: sound.py <slug> [--no-bed] [--no-sfx]
       sound.py --test                     checks placement and ducking on a made-up voice

Every sound is synthesised here (numpy, no downloads), so the same reel always gets the same mix. Hits start a few
frames early: a sound that lands with the picture reads as late. loud.py --fix still levels the final render.
"""
import json, subprocess, sys, tempfile, wave
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SR = 48000
EARLY = 0.04          # s: hits start this much before their word
CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]   # Am, F, C, G as MIDI notes
BAR = 3.0             # s per chord


def secs(n): return np.arange(int(n * SR)) / SR
def hz(m): return 440.0 * 2 ** ((m - 69) / 12)


def lowpass(x, cut):
    X = np.fft.rfft(x)
    X[np.fft.rfftfreq(len(x), 1 / SR) > cut] = 0
    return np.fft.irfft(X, len(x))


def click():
    """a soft pop: a sine falling from 900 to 300 Hz over 60 ms"""
    t = secs(0.09)
    f = 300 + 600 * np.exp(-t / 0.02)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.025)


def whoosh(dur=0.55):
    """band-limited noise that swells and cuts off"""
    t = secs(dur)
    n = np.random.default_rng(7).standard_normal(len(t))
    n = lowpass(n, 2500) - lowpass(n, 250)
    return n / np.abs(n).max() * (t / dur) ** 2.2 * np.minimum(1, (dur - t) / 0.03)


def hit():
    """a low thump: a sine falling from 90 to 48 Hz"""
    t = secs(0.45)
    f = 48 + 42 * np.exp(-t / 0.05)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16)


def bed(n):
    """slow detuned-sine chords, each fading into the next, exactly n samples long"""
    t = np.arange(n) / SR
    dur = n / SR
    out = np.zeros_like(t)
    for i in range(int(dur // BAR) + 1):
        a = i * BAR
        env = np.clip((t - a + 0.8) / 0.8, 0, 1) * np.clip((a + BAR + 0.8 - t) / 0.8, 0, 1)
        if not env.any():
            continue
        for m in CHORDS[i % len(CHORDS)] + [CHORDS[i % len(CHORDS)][0] - 12]:
            for d in (-0.0015, 0, 0.0015):
                out += env * np.sin(2 * np.pi * hz(m) * (1 + d) * t + m)
    out = lowpass(out, 1800)
    fade = np.minimum(1, np.minimum(t / 0.6, (dur - t) / 1.2))
    return out / np.abs(out).max() * np.clip(fade, 0, 1)


def smooth(x, s):
    k = max(1, int(s * SR))
    c = np.cumsum(np.concatenate([[0], x]))
    y = (c[k:] - c[:-k]) / k
    return np.concatenate([np.full(k // 2, y[0]), y, np.full(len(x) - len(y) - k // 2, y[-1])])


def duck(voice):
    """gain for the bed: 1 in silence, down to 0.35 while the voice speaks"""
    env = smooth(np.abs(voice), 0.06)
    env = np.clip(env / (np.percentile(env, 95) or 1), 0, 1)
    return smooth(1 - 0.65 * env, 0.15)


def place(mix, sound, at, gain):
    i = max(0, int(at * SR))
    n = min(len(sound), len(mix) - i)
    if n > 0:
        mix[i:i + n] += gain * sound[:n]


def mixdown(voice, words, scenes, use_bed=True, use_sfx=True):
    mix = voice.copy()
    speech = voice[np.abs(voice) > 0.02]
    ref = np.sqrt(np.mean(speech ** 2)) if len(speech) else 0.1
    if use_bed:
        mix += 0.22 * ref * bed(len(voice)) * duck(voice)
    if use_sfx:
        for w in words:
            if w.get("key"):
                place(mix, click(), w["t"] - EARLY, 0.9 * ref)
        for sc in scenes[1:]:
            at = words[sc["firstWord"]]["t"] - 0.12   # the handover sits in the silence just before the scene's first word
            place(mix, whoosh(), at - 0.55, 0.6 * ref)
            place(mix, hit(), at - EARLY, 1.6 * ref)
    return mix / max(1.0, np.abs(mix).max() / 0.89)   # headroom only; loud.py levels the render


def read(path):
    wav = Path(tempfile.mkdtemp()) / "v.wav"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), str(wav)], check=True)
    with wave.open(str(wav)) as f:
        return np.frombuffer(f.readframes(f.getnframes()), np.int16).astype(np.float64) / 32768


def write(path, x):
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR)
        f.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


def test():
    t = secs(4)
    voice = np.where((t > 1) & (t < 2), 0.3 * np.sin(2 * np.pi * 200 * t), 0)
    words = [{"w": "a", "t": 1.0, "e": 1.4, "key": True}, {"w": "b", "t": 3.0, "e": 3.4}]
    out = mixdown(voice, words, [{"firstWord": 0}, {"firstWord": 1}])
    i = int((1.0 - EARLY) * SR)
    assert np.abs(out[i - 200:i]).max() < 0.03 < np.abs(out[i:i + 2000]).max(), "the click starts EARLY before its word"
    g = duck(voice)
    assert g[int(1.5 * SR)] < 0.5 < g[int(3.5 * SR)], "the bed ducks under the voice and comes back after"
    assert len(out) == len(voice) and np.abs(out).max() <= 0.9, "same length, with headroom"
    print("PASS: hits land early on their words, the bed ducks under the voice")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    if sys.argv[1] == "--test":
        sys.exit(test())
    reel = ROOT / "reels" / sys.argv[1]
    src = next((reel / f"voice{x}" for x in (".mp3", ".wav", ".m4a") if (reel / f"voice{x}").exists()), None)
    if not src or not (reel / "words.json").exists():
        sys.exit(f"{reel} needs a voice and words.json: run the voice step and align.py first")
    d = json.loads((reel / "words.json").read_text())
    out = mixdown(read(src), d["words"], d["scenes"], "--no-bed" not in sys.argv, "--no-sfx" not in sys.argv)
    write(reel / "sound.wav", out)
    keys = sum(1 for w in d["words"] if w.get("key"))
    print(f"{reel / 'sound.wav'}: {len(out) / SR:.2f} s, {keys} key-word clicks, {len(d['scenes']) - 1} scene hits"
          f"{'' if '--no-bed' in sys.argv else ', pad bed ducked under the voice'}")
