// Motion verbs that any drawn element can use. All are pure functions of the frame, with durations in 60 fps frames
// and sensible defaults. There are no springs to tune, just a start frame and a length.
import type { CSSProperties } from "react";
import { Easing, interpolate, interpolateColors } from "remotion";

// Both curves are per-frame laws at 60 fps. They scale with the duration because the rule
// applies per frame, not per move: an entrance keeps 0.81 of the distance still to go on each frame, whether the
// move lasts 12 frames or 29.
const R_IN = -Math.log(0.81); // 0.2107: each frame leaves 0.81 of the distance to go; tau 78 ms; 90 % covered in 11-12 frames
const R_OUT = Math.log(1.45); // 0.3716: each frame multiplies the displacement by 1.45, speeding up as it leaves

/** L1. Easing for entrances. It never overshoots; it is not a spring. */
export const arriveEase = (dur: number) => {
  const k = R_IN * Math.max(1, dur);
  const d = 1 - Math.exp(-k);
  return (t: number) => (1 - Math.exp(-k * t)) / d;
};

/** L2. Easing for exits: L1 mirrored, speeding up, at full opacity. */
export const leaveEase = (dur: number) => {
  const k = R_OUT * Math.max(1, dur);
  const d = Math.exp(k) - 1;
  return (t: number) => (Math.exp(k * t) - 1) / d;
};

export const ease = {
  out: Easing.out(Easing.cubic),
  outHard: Easing.out(Easing.exp),
  in: Easing.in(Easing.cubic),
  inOut: Easing.inOut(Easing.cubic),
  back: Easing.out(Easing.back(1.6)),
  linear: Easing.linear,
};

/** L1 progress: how far an entering element has come by this frame */
export const arrive = (f: number, start: number, dur = 24) => prog(f, start, dur, arriveEase(dur));

/** L2 progress: how far a leaving element has gone by this frame */
export const leave = (f: number, start: number, dur = 11) => prog(f, start, dur, leaveEase(dur));

/** goes 0 to 1 from start to start+dur, clamped at both ends */
export const prog = (f: number, start: number, dur: number, easing: (n: number) => number = ease.out) =>
  interpolate(f, [start, start + Math.max(1, dur)], [0, 1], { easing, extrapolateLeft: "clamp", extrapolateRight: "clamp" });

/** this reel's entrance mode, set once per render by <Reel> from theme.entrance */
let ENTRANCE: "blur" | "snap" | "glide" = "blur";
export const setEntrance = (m: "blur" | "snap" | "glide" | undefined) => { ENTRANCE = m ?? "blur"; };

/** appears where it stands, coming into focus. The default entrance for anything that does not travel */
export function blurIn(f: number, start: number, o: { dur?: number; blur?: number; rise?: number; scaleFrom?: number } = {}): CSSProperties {
  if (ENTRANCE === "glide") {
    // glide: a slow, soft slide into place without blur or overshoot
    const dur = Math.round((o.dur ?? 7) * 2);
    const q = prog(f, start, dur, ease.out);
    const from = o.scaleFrom ?? 0.97;
    return { opacity: prog(f, start, Math.round(dur * 0.7), ease.inOut), transform: `translateY(${((1 - q) * (o.rise ?? 22)).toFixed(2)}px) scale(${(from + (1 - from) * q).toFixed(4)})` };
  }
  if (ENTRANCE === "snap") {
    // snap: sharp and unblurred, a fast scale-in that settles slightly
    const q = prog(f, start, o.dur ?? 7, ease.back);
    const from = o.scaleFrom ?? 0.94;
    return { opacity: prog(f, start, Math.max(3, Math.round((o.dur ?? 7) * 0.6)), ease.linear), transform: `translateY(${((1 - q) * (o.rise ?? 0)).toFixed(2)}px) scale(${(from + (1 - from) * q).toFixed(4)})` };
  }
  const p = prog(f, start, o.dur ?? 7);
  const s = (o.scaleFrom ?? 1) + (1 - (o.scaleFrom ?? 1)) * p;
  return {
    opacity: p,
    filter: p < 1 ? `blur(${((1 - p) * (o.blur ?? 12)).toFixed(2)}px)` : undefined,
    transform: `translateY(${((1 - p) * (o.rise ?? 0)).toFixed(2)}px) scale(${s.toFixed(4)})`,
  };
}

/** for badges, chips, pills and avatars: grows in with a slight overshoot */
export function pop(f: number, start: number, o: { dur?: number; from?: number } = {}): CSSProperties {
  if (ENTRANCE === "glide") return blurIn(f, start, { dur: o.dur ?? 8, scaleFrom: 0.92 });
  const p = prog(f, start, o.dur ?? 8, ease.back);
  const from = o.from ?? 0.6;
  return { opacity: prog(f, start, 4, ease.linear), transform: `scale(${(from + (1 - from) * p).toFixed(4)})` };
}

/** blur on its own timeline rather than tied to velocity: it stays at full strength, then releases so it clears
 *  AFTER the move has settled. That gives an entrance its weight: it holds 9-11 frames and releases over 12-13. */
export const blurHold = (f: number, start: number, hold = 11, release = 20) =>
  f < start ? 0 : f < start + hold ? 1 : 1 - prog(f, start + hold, release, ease.linear);

/** exits where it stands: a blur and fade (a fade and slight shrink in snap and glide modes) */
export function blurOut(f: number, start: number, o: { dur?: number; blur?: number } = {}): CSSProperties {
  const p = prog(f, start, o.dur ?? 7, ease.in);
  if (ENTRANCE === "snap" || ENTRANCE === "glide") return { opacity: 1 - p, transform: `scale(${(1 - 0.05 * p).toFixed(4)})` };
  return { opacity: 1 - p, filter: p > 0 ? `blur(${(p * (o.blur ?? 12)).toFixed(2)}px)` : undefined };
}

/** the characters visible so far, at about 36 ms each */
export function typeOn(text: string, f: number, start: number, fps: number, msPerChar = 36) {
  const n = Math.floor(((f - start) / fps) * (1000 / msPerChar));
  const shown = Math.max(0, Math.min(text.length, n));
  return { text: text.slice(0, shown), done: shown >= text.length, typing: f >= start && shown < text.length };
}

/** a number that counts up and settles. To settle it on a word: start = endsOn(word, dur) */
export function countTo(f: number, start: number, dur: number, from: number, to: number, easing = ease.outHard) {
  return f >= start + dur ? to : from + (to - from) * prog(f, start, dur, easing);
}

/** a live reading keeps flickering after it settles, like something measured rather than animated */
export function jitter(f: number, landed: number, amp: number, everyFrames = 5) {
  if (f < landed) return 0;
  const k = Math.floor((f - landed) / everyFrames);
  return Math.round(Math.sin(k * 12.9898) * amp);
}

export const money = (n: number, symbol = "$") => symbol + Math.round(n).toLocaleString("en-US");

/** siblings never land together: give each group one rhythm (4, 6, 8 or 12 frames) */
export const stagger = (start: number, i: number, step = 6) => start + i * step;

/** a state change on the same object: change its colour, do not swap it out */
export const mix = (f: number, start: number, dur: number, a: string, b: string) =>
  interpolateColors(prog(f, start, dur, ease.linear), [0, 1], [a, b]);

/** draws on the stroke of an svg path with pathLength={1}: spread the result onto the path element */
export function draw(f: number, start: number, dur = 14) {
  return { pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - prog(f, start, dur, ease.inOut) };
}

/** true from one frame onward, and optionally until another */
export const on = (f: number, from: number, to = Infinity) => f >= from && f < to;
