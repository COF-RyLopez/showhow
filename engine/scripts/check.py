#!/usr/bin/env python3
"""Automatic review: each check targets a common defect, so it is caught here before anyone sees it.

  check.py plan <slug>            before anything is drawn: caption, blocks, scene boundaries, type sizes in the scenes
  check.py render <slug> <mp4>    after rendering: dead holds and bare ground during a handover

Exits with 1 when any line says FAIL. A WARN needs judgement: read it, decide, carry on.
"""
import json, re, subprocess, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
MIN_TYPE = 32       # px on a 1080-wide frame: smaller than this, a claim is just texture on a phone
MAX_BLOCK_WORDS = 8
MIN_SILENCE = 0.15  # s: scene handovers need a true gap between sentences
MAX_STILL = 1.2     # s of total stillness allowed, caption counted
PACE = (2.6, 3.8)   # words per second: outside this a voice reads too slow or too rushed for a short
fails = 0


def say(level, msg):
    global fails
    fails += level == "FAIL"
    print(f"{level:4}  {msg}")


def pace(reel, d):
    """Pace and pauses: words per second inside PACE, a 0.30 s breath before each paragraph, 0.2 s for every other
    pause. Paragraph starts are read from the blank lines in script.txt."""
    words, dur = d["words"], d["duration"]
    rate = len(words) / dur
    ok = PACE[0] <= round(rate, 1) <= PACE[1]
    say("ok" if ok else "WARN", f"pace {rate:.2f} words a second over {dur:.1f} s"
        + ("" if ok else f": the target is {PACE[0]} to {PACE[1]}. Change the voice speed in reel.json,"
           " or apply one uniform atempo to the raw take before tighten.py"))
    script = reel / "script.txt"
    if not script.exists():
        return
    starts, n = set(), 0
    for para in re.split(r"\n\s*\n", script.read_text().strip()):
        starts.add(n)
        n += len(para.split())
    if n != len(words):
        say("WARN", f"script.txt has {n} words, words.json {len(words)}: paragraph breaths not checked")
        return
    for a, b in d["silences"]:
        nxt = next((i for i, x in enumerate(words) if x["t"] >= b - 0.06), None)
        if nxt is None or nxt < d["scenes"][1]["firstWord"] or b - a <= 0.25:  # pauses in the hook are left as they are
            continue
        if nxt in starts and nxt > 1:
            if b - a > 0.45:
                say("WARN", f"breath before \"{words[nxt]['w']}\" at {a:.2f} s is {b - a:.2f} s: the paragraph breath is 0.30 s")
        else:
            say("WARN", f"pause before \"{words[nxt]['w']}\" at {a:.2f} s is {b - a:.2f} s inside a paragraph: every pause but the paragraph breath is 0.2 s")


def plan(slug):
    reel = ROOT / "reels" / slug
    d = json.loads((reel / "words.json").read_text())
    words, blocks, scenes = d["words"], d["blocks"], d["scenes"]

    for a, b in zip(words, words[1:]):
        if b["t"] - a["t"] < 0.03:
            say("WARN", f"\"{a['w']}\" and \"{b['w']}\" start {b['t'] - a['t']:.2f} s apart: check the alignment there")
    since_key = 0
    for i, b in enumerate(blocks):
        text = " ".join(words[w]["w"] for w in b["words"])
        keys = sum(1 for w in b["words"] if words[w].get("key"))
        emoji = sum(1 for w in b["words"] if words[w].get("emoji"))
        if len(b["words"]) > MAX_BLOCK_WORDS:
            say("FAIL", f"block {i} has {len(b['words'])} words (\"{text}\"): {MAX_BLOCK_WORDS} at most")
        if keys > 1:
            say("FAIL", f"block {i} marks {keys} key words (\"{text}\"): one per block, or the mark means nothing")
        if emoji > 1:
            say("FAIL", f"block {i} has {emoji} emoji (\"{text}\"): one per block")
        since_key = 0 if keys else since_key + 1
        if since_key == 3:
            say("WARN", f"three blocks in a row without a key word, ending at \"{text}\": every number, name and obligation verb gets one")

    for s, nxt in zip(scenes, scenes[1:]):
        a, b = words[nxt["firstWord"] - 1]["e"], words[nxt["firstWord"]]["t"]
        gap = max((min(b, y) - max(a, x) for x, y in d["silences"]), default=0)
        level = "FAIL" if gap < MIN_SILENCE else "ok"
        say(level, f"scene \"{s['id']}\" -> \"{nxt['id']}\" hands over at {(a + b) / 2:.2f} s inside {max(gap, 0):.2f} s of silence"
            + ("" if level == "ok" else f": it needs {MIN_SILENCE} s. Start the scene at a sentence boundary"))

    pace(reel, d)

    scene_dir = reel / "scenes"
    known = {s["id"] for s in scenes}
    index = (scene_dir / "index.tsx").read_text() if (scene_dir / "index.tsx").exists() else ""
    for sid in sorted(known):
        if not re.search(rf"\b{re.escape(sid)}\s*:", index):
            say("WARN", f"scene \"{sid}\" has no component in scenes/index.tsx yet: it will render as caption over bare ground")
    for tsx in sorted(scene_dir.glob("*.tsx")):
        for n, line in enumerate(tsx.read_text().splitlines(), 1):
            for size in re.findall(r"fontSize:\s*(\d+)", line):
                if int(size) < MIN_TYPE and "texture" not in line:
                    say("WARN", f"{tsx.name}:{n} type at {size} px: under {MIN_TYPE} px nobody reads it on a phone. Enlarge it, or end the line with // texture")
    print(f"plan: {len(scenes)} scenes, {len(blocks)} blocks, {len(words)} words, {d['duration']} s")


def frames(mp4, w=90, h=160, fps=30):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", mp4, "-vf", f"fps={fps},scale={w}:{h},format=gray", "-f", "rawvideo", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w).astype(np.int16), fps


def render(slug, mp4):
    d = json.loads((ROOT / "reels" / slug / "words.json").read_text())
    a, fps = frames(mp4)
    diff = np.abs(a[1:] - a[:-1]).mean(axis=(1, 2))
    still, start, worst = diff < 0.12, None, (0.0, 0.0)
    for i, q in enumerate(list(still) + [False]):
        if q and start is None:
            start = i
        elif not q and start is not None:
            if (i - start) / fps > worst[0] and i < len(diff) - 2:  # a hold on the final frames is allowed
                worst = ((i - start) / fps, start / fps)
            start = None
    say("FAIL" if worst[0] > MAX_STILL else "ok", f"longest stretch with nothing moving: {worst[0]:.2f} s at {worst[1]:.2f} s (limit {MAX_STILL} s)")

    # bare ground during a handover: the stage band stays flat for more than one frame at 30 fps
    stage = a[:, int(160 * 520 / 1920):int(160 * 1450 / 1920), :]
    for s, nxt in zip(d["scenes"], d["scenes"][1:]):
        mid = (d["words"][nxt["firstWord"] - 1]["e"] + d["words"][nxt["firstWord"]]["t"]) / 2
        lo, hi = max(0, int((mid - 0.4) * fps)), min(len(stage), int((mid + 0.4) * fps))
        bare = [i for i in range(lo, hi) if stage[i].std() < 2.0]
        run = max((len(g) for g in np.split(bare, np.where(np.diff(bare) != 1)[0] + 1)), default=0) if bare else 0
        say("FAIL" if run > 1 else "ok", f"handover into \"{nxt['id']}\" at {mid:.2f} s: {run} bare frames at 30 fps (more than 1 reads as a dropped frame)")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "plan":
        plan(sys.argv[2])
    elif len(sys.argv) >= 4 and sys.argv[1] == "render":
        render(sys.argv[2], sys.argv[3])
    else:
        sys.exit(__doc__)
    sys.exit(1 if fails else 0)
