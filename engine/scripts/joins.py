"""Scene-change check: is every join one continuous move, and what does it look like?

usage: python3 scripts/joins.py <slug> <mp4> [--sheet out.jpg]

For each scene change (the middle of the silence before the next scene's first word, as in check.py) it reports
  jump   the largest single-frame change within 0.25 s of the change (mean grey level, 108x192, 0-255)
  motion the median frame-to-frame change around it (what the camera is doing anyway)
and grades it:
  seamless  jump < motion + 3        the frames either side are the same picture moving (a continuous join)
  soft      jump < 3 x motion + 6    a morph or quick fly that still reads as one move
  white dip the picture passes through near-white (a deliberate dip)
  CUT       otherwise                one frame swaps the picture: fix it in the scenes (match the frames) or with a morph
With --sheet it also writes a contact sheet: every change at -1, -0.5, -0.1, +0.02, +0.25, +0.5, +1, +1.5 s.
Look at that sheet before any full render.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
W, H = 108, 192
N = W * H


def grey(mp4):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", mp4, "-vf", f"scale={W}:{H},format=gray", "-f", "rawvideo", "-"],
                         capture_output=True, check=True, stdin=subprocess.DEVNULL).stdout
    return [raw[i * N:(i + 1) * N:5] for i in range(len(raw) // N)]


def diff(a, b):
    return sum(abs(x - y) for x, y in zip(a, b)) / len(a)


def main():
    slug, mp4 = sys.argv[1], sys.argv[2]
    sheet = sys.argv[sys.argv.index("--sheet") + 1] if "--sheet" in sys.argv else None
    d = json.loads((ROOT / "reels" / slug / "words.json").read_text())
    joins = []
    for s, nxt in zip(d["scenes"], d["scenes"][1:]):
        mid = (d["words"][nxt["firstWord"] - 1]["e"] + d["words"][nxt["firstWord"]]["t"]) / 2
        joins.append((s["id"], nxt["id"], mid))
    fr = grey(mp4)
    fps = 60
    bad = 0
    for a, b, t in joins:
        c = int(round(t * fps))
        window = [diff(fr[i], fr[i - 1]) for i in range(max(1, c - 15), min(len(fr), c + 16))]
        around = sorted(diff(fr[i], fr[i - 1]) for i in range(max(1, c - 45), min(len(fr), c + 46)))
        jump, motion = max(window), around[len(around) // 2]
        white = max(sum(fr[i]) / len(fr[i]) for i in range(max(0, c - 15), min(len(fr), c + 16)))
        grade = ("seamless" if jump < motion + 3 else "soft" if jump < 3 * motion + 6
                 else "white dip" if white > 205 and jump < 40 else "CUT")
        bad += grade == "CUT"
        print(f"{'FAIL' if grade == 'CUT' else 'ok  '}  {a:>8} -> {b:<8} at {t:6.2f} s  jump {jump:5.1f}  motion {motion:4.1f}  {grade}")
    if sheet:
        from PIL import Image, ImageDraw
        offs = [-1.0, -0.5, -0.1, 0.02, 0.25, 0.5, 1.0, 1.5]
        w, h, pad = 180, 320, 30
        img = Image.new("RGB", (w * len(offs), (h + pad) * len(joins)), (20, 20, 24))
        dr = ImageDraw.Draw(img)
        for r, (a, b, t) in enumerate(joins):
            y = r * (h + pad)
            dr.text((8, y + 8), f"{a} -> {b}  at {t:.2f} s", fill=(255, 220, 80))
            for k, o in enumerate(offs):
                raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", f"{t + o:.3f}", "-i", mp4, "-frames:v", "1", "-vf", f"scale={w}:{h}",
                                      "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, stdin=subprocess.DEVNULL).stdout
                if len(raw) == w * h * 3:
                    img.paste(Image.frombytes("RGB", (w, h), raw), (k * w, y + pad))
                dr.text((k * w + 5, y + pad + h - 16), f"{o:+.2f}s", fill=(255, 255, 255))
        img.save(sheet, quality=85)
        print(f"sheet: {sheet}")
    print("ok" if not bad else f"{bad} join(s) cut")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
