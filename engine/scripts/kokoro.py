#!/usr/bin/env python3
"""Makes voice.mp3 and voice.alignment.json from script.txt with Kokoro, the open voice model (Apache 2.0, runs locally,
no key). A free stand-in for voice.py: tighten.py, align.py and the checks run on its output unchanged.

usage: kokoro.py <slug> [--voice af_heart] [--speed 1.0]
       kokoro.py --test                     checks the character timing on made-up word times

reel.json can hold the defaults:  "kokoro": { "voice": "af_heart", "speed": 1.0 }

Kokoro reports no word times, so the take is heard back by faster-whisper (small.en, fetched from Hugging Face on first
run) and its words matched to the script with align.py's matcher. Each word's time is spread over its letters, which is
the shape tighten.py and align.py read. Needs `pip install kokoro-onnx soundfile faster-whisper`, plus kokoro-v1.0.onnx and voices-v1.0.bin in models/ at the top of this repo
(github.com/thewh1teagle/kokoro-onnx/releases, model-files-v1.0).
"""
import json, re, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT.parent / "models"


def char_times(text, words):
    """ElevenLabs-shaped alignment for `text`, from timed words in script order. The characters join back into `text`
    exactly; the gap before a word (spaces, line breaks) spans the silence since the word before it."""
    chars, t0, t1, pos, last = [], [], [], 0, 0.0
    for w in words:
        at = text.index(w["w"], pos)
        for c in text[pos:at]:
            chars.append(c); t0.append(last); t1.append(w["t"])
        step = (w["e"] - w["t"]) / len(w["w"])
        for k, c in enumerate(w["w"]):
            chars.append(c); t0.append(round(w["t"] + k * step, 3)); t1.append(round(w["t"] + (k + 1) * step, 3))
        pos, last = at + len(w["w"]), w["e"]
    for c in text[pos:]:
        chars.append(c); t0.append(last); t1.append(last)
    return {"characters": chars, "character_start_times_seconds": t0, "character_end_times_seconds": t1}


def test():
    text = "One two.\n\nThree"
    al = char_times(text, [{"w": "One", "t": 0.0, "e": 0.3}, {"w": "two.", "t": 0.4, "e": 0.8}, {"w": "Three", "t": 1.5, "e": 2.0}])
    assert "".join(al["characters"]) == text
    s, e = al["character_start_times_seconds"], al["character_end_times_seconds"]
    assert len(s) == len(e) == len(text) and all(a <= b for a, b in zip(s, e)) and s == sorted(s)
    assert (s[3], e[3]) == (0.3, 0.4) and (s[10], e[14]) == (1.5, 2.0)   # the space, then "Three" fills its own time
    print("PASS: character times rebuild the script in order")


if __name__ == "__main__":
    if sys.argv[1] == "--test":
        sys.exit(test())
    sys.path.insert(0, str(ROOT / "scripts"))
    from align import match, to_wav, silences, clamp_to_silences
    from voice import pad
    import soundfile
    from kokoro_onnx import Kokoro

    reel = ROOT / "reels" / sys.argv[1]
    text = re.sub(r"\n{2,}", "\n\n", (reel / "script.txt").read_text().strip())   # the same text voice.py and tighten.py read
    cfg = {"voice": "af_heart", "speed": 1.0, **json.loads((reel / "reel.json").read_text()).get("kokoro", {})}
    for k in ("voice", "speed"):
        if f"--{k}" in sys.argv:
            cfg[k] = sys.argv[sys.argv.index(f"--{k}") + 1]
    model, voices = MODELS / "kokoro-v1.0.onnx", MODELS / "voices-v1.0.bin"
    if not model.exists() or not voices.exists():
        sys.exit(f"put kokoro-v1.0.onnx and voices-v1.0.bin in {MODELS} (github.com/thewh1teagle/kokoro-onnx/releases, model-files-v1.0)")

    audio, rate = Kokoro(str(model), str(voices)).create(text, voice=cfg["voice"], speed=float(cfg["speed"]), lang="en-us")
    wav = Path(tempfile.mkdtemp()) / "voice.wav"
    soundfile.write(wav, audio, rate)
    mp3 = reel / "voice.mp3"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(wav), "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "192k", str(mp3)], check=True)
    pad(mp3)

    words = [{"w": w} for w in text.split()]
    from faster_whisper import WhisperModel   # ponytail: whisper.cpp could not be built here; this pip package needs no build
    segments, _ = WhisperModel("small.en", device="cpu", compute_type="int8").transcribe(soundfile.read(to_wav(mp3, 16000), dtype="float32")[0], word_timestamps=True, initial_prompt=text)
    heard = [[w.word.strip(), w.start, w.end] for s in segments for w in s.words]
    missed = match(words, heard)   # prints any word whisper did not hear, which is then timed from its neighbours
    clamp_to_silences(words, silences(mp3)[0])   # whisper runs words across pauses; tighten.py needs them in the silence
    al = char_times(text, words)
    (reel / "voice.alignment.json").write_text(json.dumps({"voice": {"model": "kokoro", **cfg}, "alignment": al}, ensure_ascii=False))
    end = words[-1]["e"]
    print(f"{mp3}: {end:.2f} s, {len(words)} words, {len(words) / end:.2f} words a second, {missed} spans timed from neighbours")
