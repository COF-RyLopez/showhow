"""Camera speed check: mean grey-level change between frames at 108x192, averaged per quarter second.

usage: python3 speed.py <mp4> [start_seconds]
Fails any quarter second above 12 (a whip, zoom or pan too fast to follow), any single-frame cut or snap,
and any transition where one picture replaces another inside about 10 frames.
It does not judge how much moves, only how fast.
"""
import subprocess
import sys

W, H = 108, 192
N = W * H
LIMIT = 12.0
mp4 = sys.argv[1]
start = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0
raw = subprocess.run(
    ["ffmpeg", "-loglevel", "error", "-i", mp4, "-vf", f"scale={W}:{H},format=gray", "-f", "rawvideo", "-"],
    capture_output=True, check=True, stdin=subprocess.DEVNULL,
).stdout
frames = len(raw) // N
v = [0.0]
for i in range(1, frames):
    a = raw[i * N:(i + 1) * N:7]
    b = raw[(i - 1) * N:i * N:7]
    v.append(sum(abs(x - y) for x, y in zip(a, b)) / len(a))
fails = 0
for q in range(frames // 15):
    m = sum(v[q * 15:(q + 1) * 15]) / 15
    if m > LIMIT:
        fails += 1
        print(f"FAIL  {start + q * 0.25:6.2f}-{start + (q + 1) * 0.25:6.2f} s  {m:5.1f} (limit {LIMIT})")
CUT = 30.0  # one frame changing this much against both neighbours is a cut or a snap, not a move
for i in range(2, frames - 1):
    if v[i] > CUT and v[i] > 2.5 * max(v[i - 1], v[i + 1], 1.0):
        fails += 1
        print(f"FAIL  {start + i / 60:6.2f} s  cut: one frame changes {v[i]:.1f} (neighbours {v[i - 1]:.1f}, {v[i + 1]:.1f})")
# transitions: when one picture is replaced by another (the frame changes by 80+ over one second), the change must be
# spread across the second, not packed into 10 frames. Smooth handovers put about 50-57% of the change in their
# fastest 10 frames; ones that read as a jolt put 85-140% there (overshoot counts).
full = [raw[i * N:(i + 1) * N:7] for i in range(frames)]


def dist(a, b):
    return sum(abs(x - y) for x, y in zip(full[a], full[b])) / len(full[a])


last_t = -999
for i in range(60, frames, 6):
    d60 = dist(i, i - 60)
    if d60 < 80:
        continue
    d10 = max(dist(j, j - 10) for j in range(i - 50, i + 1, 2))
    if d10 >= 0.75 * d60 and i - last_t > 60:
        last_t = i
        fails += 1
        print(f"FAIL  {start + (i - 60) / 60:6.2f}-{start + i / 60:6.2f} s  transition too fast: {d10 / d60:.0%} of the picture change happens within 10 frames (spread it over 40-60)")
peak = max((sum(v[q * 15:(q + 1) * 15]) / 15 for q in range(frames // 15)), default=0)
print(f"peak {peak:.1f}; " + ("ok" if not fails else f"{fails} quarter-second(s) too fast"))
sys.exit(1 if fails else 0)
