#!/usr/bin/env python3
"""Builds words.json from caption.txt and the voice. The caption is the script; it is never transcribed from the voice.

usage: align.py <slug>          (input: reels/<slug>/caption.txt plus reels/<slug>/voice.*)

caption.txt is the single file a reel is driven by:
  == hook | ground: dark                 opens a scene (the id is its key in the reel's scene map; ground is dark or light)
  can take off / weighing over           each line is one caption block (no more than two lines on screen)
  *80* tonnes,                           *word* marks the block's key word, which gets the selection box
  A ✈️ *Boeing* 737                       an emoji just before a word shows inline ahead of it
  and the only thing / holding it *up*   " / " breaks the line at that point
                                         (without " / " the engine balances the two lines on its own)
  @bottom / @top                         moves the caption slot, starting with the next block
  # ...                                  a comment line

Word times are read from reels/<slug>/voice.alignment.json if it exists (ElevenLabs "with timestamps", exact).
Otherwise speech recognition is used (whisper.cpp small.en when the model is present, or auto-editor's Apple pass),
matched against the caption's own words; any caption word the recogniser missed is timed between its neighbours and reported.
"""
import difflib, json, re, subprocess, sys, tempfile, wave
from pathlib import Path
import numpy as np
from where import WHISPER, whisper_cli   # whisper model and program kept in this folder, on any OS

ROOT = Path(__file__).resolve().parent.parent
MODELS = [WHISPER]
norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())
is_emoji = lambda tok: not re.search(r"[A-Za-z0-9$€%]", tok)


def parse(text):
    scenes, blocks, words, slot = [], [], [], "top"
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("=="):
            head = [p.strip() for p in line[2:].split("|")]
            ground = next((p.split(":")[1].strip() for p in head[1:] if p.startswith("ground")), "dark")
            scenes.append({"id": head[0], "ground": ground, "firstWord": len(words)})
            slot = "top"
            continue
        if line in ("@top", "@bottom"):
            slot = line[1:]
            continue
        if not scenes:
            sys.exit("caption.txt: the first line must open a scene, e.g. '== hook | ground: dark'")
        idx, emoji, br = [], None, None
        for tok in line.split():
            if tok == "/":
                br = len(words)
                continue
            if is_emoji(tok.strip("*")):
                emoji = tok.strip("*")
                continue
            key = tok.startswith("*") and tok.endswith("*")
            words.append({"w": tok.strip("*"), "key": key, "emoji": emoji})
            idx.append(len(words) - 1)
            emoji = None
        blocks.append({"words": idx, "slot": slot, "scene": len(scenes) - 1, **({"br": br} if br is not None else {})})
    return scenes, blocks, words


def to_wav(src, rate):
    out = Path(tempfile.mkdtemp()) / "a.wav"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(src), "-vn", "-ac", "1", "-ar", str(rate), str(out)], check=True)
    return out


def recognise(voice):
    wav = to_wav(voice, 16000)
    model = next((m for m in MODELS if m.exists()), None) if sys.platform == "darwin" else (whisper_cli() and WHISPER)   # Apple speech exists only on a Mac; elsewhere use whisper.cpp
    if model:
        base = wav.with_suffix("")
        subprocess.run([whisper_cli(), "-m", str(model), "-f", str(wav), "-ojf", "-of", str(base), "-np"], check=True, capture_output=True)
        out, cur = [], None
        for seg in json.loads(base.with_suffix(".json").read_text())["transcription"]:
            for tok in seg["tokens"]:
                x = tok["text"]
                if x.startswith("["):
                    continue
                if x.startswith(" ") or cur is None:
                    if cur:
                        out.append(cur)
                    cur = [x.strip(), tok["offsets"]["from"] / 1000, tok["offsets"]["to"] / 1000]
                else:
                    cur[0] += x
                    cur[2] = tok["offsets"]["to"] / 1000
        return out + ([cur] if cur else [])
    mp3 = wav.with_suffix(".jsonl")
    subprocess.run(["auto-editor", "whisper", str(wav), "apple", "-sw", "-f", "json", "-l", "en", "-o", str(mp3)], check=True, capture_output=True)
    return [[d["text"], d["start"] / 1000, d["end"] / 1000] for d in map(json.loads, mp3.read_text().splitlines())]


def from_alignment(path):
    a = json.loads(path.read_text())
    a = a.get("alignment", a)
    out, cur = [], None
    for ch, s, e in zip(a["characters"], a["character_start_times_seconds"], a["character_end_times_seconds"]):
        if ch.isspace():
            if cur:
                out.append(cur)
            cur = None
        elif cur is None:
            cur = [ch, s, e]
        else:
            cur[0] += ch
            cur[2] = e
    return out + ([cur] if cur else [])


def match(words, heard):
    a, b = [norm(w["w"]) for w in words], [norm(h[0]) for h in heard]
    missed = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag == "equal":
            for i, j in zip(range(i1, i2), range(j1, j2)):
                words[i]["t"], words[i]["e"] = heard[j][1], heard[j][2]
        elif i2 > i1:  # caption and recogniser disagree here: share the recognised span across the caption words
            t0 = heard[j1][1] if j1 < len(heard) and j2 > j1 else None
            t1 = heard[j2 - 1][2] if j2 > j1 else None
            missed.append((i1, i2, " ".join(h[0] for h in heard[j1:j2]), t0, t1))
    for i1, i2, said, t0, t1 in missed:
        lo = t0 if t0 is not None else (words[i1 - 1]["e"] if i1 else 0.0)
        hi = t1 if t1 is not None else next((w["t"] for w in words[i2:] if "t" in w), lo + 0.3 * (i2 - i1))
        total = sum(len(words[i]["w"]) for i in range(i1, i2)) or 1
        t = lo
        for i in range(i1, i2):
            d = (hi - lo) * len(words[i]["w"]) / total
            words[i]["t"], words[i]["e"] = round(t, 3), round(t + d, 3)
            t += d
        print(f"  ! caption \"{' '.join(words[i]['w'] for i in range(i1, i2))}\" / voice heard \"{said}\": timed from neighbours, check it")
    return len(missed)


def silences(voice, floor_db=-42, min_len=0.12):
    with wave.open(str(to_wav(voice, 16000))) as wf:
        x = np.frombuffer(wf.readframes(wf.getnframes()), np.int16).astype(np.float32) / 32768
    n = 160  # 10 ms windows at 16 kHz
    rms = np.array([np.sqrt(np.mean(x[i:i + n] ** 2) + 1e-12) for i in range(0, len(x) - n, n)])
    quiet, out, start = 20 * np.log10(rms) < floor_db, [], None
    for i, q in enumerate(list(quiet) + [False]):
        if q and start is None:
            start = i
        elif not q and start is not None:
            if (i - start) * 0.01 >= min_len:
                out.append([round(start * 0.01, 2), round(i * 0.01, 2)])
            start = None
    return out, round(len(x) / 16000, 3)


def clamp_to_silences(words, sil, window=1.2):
    """No one speaks during a silence. Recognisers stretch the last word of a sentence into the following gap and
    start the next sentence too soon; move the words on both sides back out, spreading the shift over roughly a second."""
    moved = 0
    for s0, s1 in sil:
        if s1 - s0 < 0.2:
            continue
        # words the recogniser put across the gap: those up to the last closing punctuation go before it
        over = [i for i, w in enumerate(words) if w["t"] < s1 and w["e"] > s0]
        if not over:
            continue  # no word overlaps this gap, so nothing to move
        closing = [i for i in over if words[i]["w"][-1] in ".,!?;:"]
        mid = (s0 + s1) / 2
        cut = closing[-1] + 1 if closing else next((i for i in over if (words[i]["t"] + words[i]["e"]) / 2 >= mid), (over[-1] + 1) if over else 0)
        before, after = (words[:cut] if s0 > 0.05 else []), words[cut:]
        if before and before[-1]["e"] > s0 + 0.02:
            end, lo = before[-1]["e"], max(0.0, s0 - window)
            k = (s0 - lo) / (end - lo)
            for w in before:
                for key in ("t", "e"):
                    if w[key] > lo:
                        w[key] = round(lo + (w[key] - lo) * k, 3)
            moved += 1
        if after and after[0]["t"] < s1 - 0.02:
            start, hi = after[0]["t"], s1 + window / 2
            k = (hi - s1) / (hi - start)
            for w in after:
                for key in ("t", "e"):
                    if w[key] < hi:
                        w[key] = round(hi - (hi - w[key]) * k, 3)
            moved += 1
    return moved


if __name__ == "__main__":
    reel = ROOT / "reels" / sys.argv[1]
    voice = next((reel / f"voice{x}" for x in (".mp3", ".wav", ".m4a") if (reel / f"voice{x}").exists()), None)
    if not voice:
        sys.exit(f"no voice.mp3 / .wav / .m4a in {reel}")
    text = (reel / "caption.txt").read_text()
    v2 = False
    scenes, blocks, words = parse(text)
    exact = reel / "voice.alignment.json"
    heard = from_alignment(exact) if exact.exists() else recognise(voice)
    print(f"{len(words)} caption words, {len(heard)} heard ({'exact timestamps' if exact.exists() else 'speech recognition, ±0.1 s'})")
    n_missed = match(words, heard)
    sil, dur = silences(voice)
    if not exact.exists():
        print(f"  {clamp_to_silences(words, sil)} sentence edges pulled out of a silence")
    for a, b in zip(words, words[1:]):
        if b["t"] < a["t"]:
            sys.exit(f"word order broke between \"{a['w']}\" and \"{b['w']}\": the caption and the voice disagree too much")
    out = {"duration": dur, "silences": sil, "scenes": scenes, "blocks": blocks, "words": words}
    (reel / "words.json").write_text(json.dumps({"format": 2, **out} if v2 else out, ensure_ascii=False, indent=1))
    print(f"wrote {reel / 'words.json'}: {len(scenes)} scenes, {len(blocks)} blocks, {len(sil)} silences, {n_missed} spans to check, {dur} s")
