#!/usr/bin/env python3
"""Measures how much the picture moves, second by second, so a reel never moves too fast to follow on one watch.

  python3 scripts/motion.py <video.mp4> [--words reels/<slug>/words.json] [--keep id,id] [--offset s] [--from s --to s] [--json]

The rule is about what happens inside a world: there, nothing may move too fast to follow. A change from one world to
the next may be quick. --words marks the scene changes; --keep lists the scenes marked keep = true in the plan (the
engine's meaning: the next scene carries on in the same world), so the change out of each is judged as inside a world. Within half a second of any other
scene change (a change of world), the speed and transition checks do not apply: the change may be quick, but it is
still one continuous move, so a cut fails everywhere. --offset is the reel time at the file's first frame, for a stretch rendered with
render.mjs --from (so a stretch from 12 s is measured with --offset 12).

The measure: every frame is shrunk to 108x192 grey, and the speed of a quarter second is the mean absolute grey-level
change between neighbouring frames in it (0-255 scale), read at 60 fps (a 30 fps file is read as if each frame held
twice). Two or three moves a scene and real energy are fine; what fails is a move too fast to follow. It fails when
  - inside a world, any quarter second is over 12 (a zoom, pan or whip too fast to follow),
  - a second under 1 is followed by one over 8 (a near-freeze, then a jump),
  - the picture is fully still for longer than 1.2 s (the camera stopped),
  - with --words, a scene is on screen for less than 2 s (a new picture nobody had time to read),
  - anywhere, one frame changes more than 30 and more than 2.5 times both its neighbours (a cut or a snap),
  - inside a world, the picture changes by 80 or more over a second with 75% of that inside its fastest 10 frames
    (a change too fast to follow: spread it over 40 to 60 frames). Good handovers sit at 50-57%, the flagged ones at 85-140%.
The cut and transition checks are the same as in scripts/speed.py.
It prints one line per second and the failures, and exits 1 on any failure. Needs ffmpeg and numpy.
"""
import json
import subprocess
import sys

import numpy as np

W, H = 108, 192
MAX_QUARTER, FREEZE, JUMP, STILL, STILL_SECONDS = 12.0, 1.0, 8.0, 0.05, 1.2
CUT, CUT_RATIO, CHANGE, PACKED = 30.0, 2.5, 80.0, 0.75


def main():
    a = sys.argv[1:]
    if not a or a[0].startswith("-"):
        print(__doc__)
        sys.exit(2)
    src = a[0]
    opt = lambda n: float(a[a.index(n) + 1]) if n in a else None
    t0, t1 = opt("--from"), opt("--to")
    cmd = ["ffmpeg", "-v", "error"]
    if t0 is not None:
        cmd += ["-ss", str(t0)]
    cmd += ["-i", src]
    if t1 is not None:
        cmd += ["-t", str(t1 - (t0 or 0))]
    cmd += ["-vf", f"fps=60,scale={W}:{H}:flags=area,format=gray", "-f", "rawvideo", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    frames = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)
    if len(frames) < 2:
        print("motion: too few frames to measure")
        sys.exit(1)
    diff = np.abs(np.diff(frames, axis=0)).mean(axis=(1, 2))
    # A 30 fps source read at 60 fps repeats each frame, so its changes land on every other step: spread them out.
    if np.mean(diff[1::2] < 1e-6) > 0.9 or np.mean(diff[0::2] < 1e-6) > 0.9:
        diff = np.convolve(diff, [0.5, 0.5], mode="same")
    start = (opt("--offset") or 0.0) + (t0 or 0.0)
    secs = [float(diff[i:i + 60].mean()) for i in range(0, len(diff), 60)]
    cuts, short = [], []
    if "--words" in a:
        w = json.load(open(a[a.index("--words") + 1]))
        keep = set(a[a.index("--keep") + 1].split(",")) if "--keep" in a else set()
        cuts = [w["words"][sc["firstWord"]]["t"] for prev, sc in zip(w["scenes"], w["scenes"][1:]) if prev["id"] not in keep]
        every = [w["words"][sc["firstWord"]]["t"] for sc in w["scenes"][1:]]
        starts = [0.0] + every + [w["duration"]]
        for sc, t0_, t1_ in zip(w["scenes"], starts, starts[1:]):
            if t1_ - t0_ < 2.0:
                short.append(f"scene {sc['id']} is on screen {t1_ - t0_:.1f} s: every new picture needs about 2 s to read")
    near = lambda t0, t1: any(t0 < c + 0.5 and t1 > c - 0.5 for c in cuts)
    handover = lambda i: near(start + i, start + i + 1)
    quarters = [float(diff[i:i + 15].mean()) for i in range(0, len(diff), 15)]
    fails = list(short)
    for i, m in enumerate(quarters):
        t = start + i / 4
        if m > MAX_QUARTER and not near(t, t + 0.25):
            fails.append(f"{t:.2f}-{t + 0.25:.2f} s: speed {m:.1f}, over {MAX_QUARTER:.0f}")
    for i, m in enumerate(secs):
        if i + 1 < len(secs) and m < FREEZE and secs[i + 1] > JUMP:
            fails.append(f"{start + i:.0f}-{start + i + 2:.0f} s: near-freeze ({m:.1f}) then a jump ({secs[i + 1]:.1f})")
    # a cut or snap: one frame jumps against both neighbours (diff[k] is the change into frame k + 1)
    for k in range(1, len(diff) - 1):
        if diff[k] > CUT and diff[k] > CUT_RATIO * max(diff[k - 1], diff[k + 1], 1.0):
            fails.append(f"{start + (k + 1) / 60:.2f} s: cut or snap, one frame changes {diff[k]:.1f} (neighbours {diff[k - 1]:.1f}, {diff[k + 1]:.1f})")
    # a transition packed into a few frames: a big change over one second, mostly inside its fastest 10 frames
    last = -999
    gap = lambda a_, b_: float(np.abs(frames[a_] - frames[b_]).mean())
    for i in range(60, len(frames), 6):
        d60 = gap(i, i - 60)
        if d60 < CHANGE:
            continue
        d10 = max(gap(j, j - 10) for j in range(i - 50, i + 1, 2))
        if d10 >= PACKED * d60 and i - last > 60 and not near(start + (i - 60) / 60, start + i / 60):
            last = i
            fails.append(f"{start + (i - 60) / 60:.2f}-{start + i / 60:.2f} s: transition too fast, {d10 / d60:.0%} of the change inside 10 frames (spread it over 40 to 60)")
    run = 0
    for i, d in enumerate(diff):
        run = run + 1 if d < STILL else 0
        if run == int(STILL_SECONDS * 60) + 1:
            fails.append(f"{start + (i - run + 1) / 60:.2f} s: the picture stops for over {STILL_SECONDS} s")
    if "--json" in a:
        print(json.dumps({"seconds": [round(m, 2) for m in secs], "quarters": [round(m, 2) for m in quarters], "fails": fails}))
    else:
        for i, m in enumerate(secs):
            peak = max(quarters[i * 4:i * 4 + 4] or [0])
            print(f"{start + i:6.0f} s  peak {peak:5.1f}  {'#' * min(40, int(round(peak * 2)))}{'  change of world' if handover(i) else ''}")
        print("\n".join(["FAIL " + f for f in fails]) or "PASS: never too fast to follow")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
