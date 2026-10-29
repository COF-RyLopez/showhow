#!/usr/bin/env python3
"""Loudness check for a finished render: -14 LUFS integrated and a true peak no higher than -1.5 dBTP, the level
short-video apps play at, so the reel is neither turned down nor clipped.

usage: loud.py <mp4>            measures and prints PASS or FAIL
       loud.py <mp4> --fix      writes <name>.loud.mp4 beside it, normalised in two passes (aiming 0.5 dB under the peak limit, so rounding never tips it over), video copied untouched
Needs ffmpeg. Exit code 1 on FAIL.
"""
import json, re, subprocess, sys
from pathlib import Path

TARGET, PEAK, TOL = -14.0, -1.5, 1.0


def measure(mp4, extra=""):
    out = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(mp4), "-af", f"loudnorm=I={TARGET}:TP={PEAK}:LRA=11{extra}:print_format=json",
                          "-f", "null", "-"], capture_output=True, text=True).stderr
    return json.loads(re.findall(r"\{[^{}]+\}", out)[-1])


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    mp4 = Path(sys.argv[1])
    m = measure(mp4)
    i, tp = float(m["input_i"]), float(m["input_tp"])
    ok = abs(i - TARGET) <= TOL and tp <= PEAK + 0.1
    print(f"{'PASS' if ok else 'FAIL'}  {i:.1f} LUFS, true peak {tp:.1f} dBTP (target {TARGET} LUFS, peak {PEAK} dBTP at most)")
    if "--fix" in sys.argv and not ok:
        out = mp4.with_suffix(".loud.mp4")
        lin = (f":measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
               f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(mp4), "-c:v", "copy", "-af",
                        f"loudnorm=I={TARGET}:TP={PEAK - 0.5}:LRA=11{lin},aresample=48000", "-c:a", "aac", "-b:a", "192k", str(out)], check=True)
        print(out)
        return main_check(out)
    sys.exit(0 if ok else 1)


def main_check(mp4):
    m = measure(mp4)
    i, tp = float(m["input_i"]), float(m["input_tp"])
    ok = abs(i - TARGET) <= TOL and tp <= PEAK + 0.1
    print(f"{'PASS' if ok else 'FAIL'}  after the fix: {i:.1f} LUFS, true peak {tp:.1f} dBTP")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
