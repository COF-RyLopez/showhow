// The pendulum demo's one world: three pendulums on a wooden frame, drawn on a canvas through the pinhole camera as
// one function of the reel's frame. Both scenes draw this world, so the change between them is one continuous picture.
// The swings are the real equation (theta'' = -g/L sin theta), integrated step by step from rest at the start, so the
// big swing really is a hair slower than the small one, as a real pendulum is.
//   A  1 m string, big swing (24 degrees)       B  1 m string, small swing (8 degrees)
//   C  0.25 m string, a quarter as long, just outside the first shot, revealed on "length"
//   "same": both 1 m periods are marked, 2.0 s. "twice": C's period is marked, 1.0 s.
import React, { useLayoutEffect, useMemo, useRef } from "react";
import { useCurrentFrame } from "remotion";
import { type Cam, type V3, ease, orbit, prog, project, spline, useReel } from "../../../src/engine";

const G = 9.81;
const BEAM_Y = 1.6; // height of the bar the strings hang from, metres
const BOB = 0.075; // bob radius, metres

type Pend = { x: number; len: number; amp: number };
const PENDS: Pend[] = [
  { x: -0.3, len: 1.0, amp: (24 * Math.PI) / 180 },
  { x: 0.3, len: 1.0, amp: (8 * Math.PI) / 180 },
  { x: 0.95, len: 0.25, amp: (12 * Math.PI) / 180 },
];

/** angle of every pendulum at every 60 fps frame: RK4 with 8 steps a frame, from rest at its amplitude */
function swings(frames: number): number[][] {
  return PENDS.map((p) => {
    const out: number[] = [];
    let th = p.amp, w = 0;
    const h = 1 / 60 / 8, k = G / p.len;
    const acc = (t: number) => -k * Math.sin(t);
    for (let f = 0; f <= frames; f++) {
      out.push(th);
      for (let s = 0; s < 8; s++) {
        const k1t = w, k1w = acc(th);
        const k2t = w + (h / 2) * k1w, k2w = acc(th + (h / 2) * k1t);
        const k3t = w + (h / 2) * k2w, k3w = acc(th + (h / 2) * k2t);
        const k4t = w + h * k3w, k4w = acc(th + h * k3t);
        th += (h / 6) * (k1t + 2 * k2t + 2 * k3t + k4t);
        w += (h / 6) * (k1w + 2 * k2w + 2 * k3w + k4w);
      }
    }
    return out;
  });
}

type T = { same: number; length: number; quarter: number; twice: number; end: number };

function camera(f: number, t: T): Cam {
  const tx = spline(f, [[0, 0], [t.length, 0], [t.quarter, 0.32], [t.end, 0.33]]);
  const at: V3 = [tx, 1.05, 0];
  const yaw = spline(f, [[0, 0.18], [t.same, 0.22], [t.length, 0.26], [t.quarter, 0.2], [t.end, 0.16]]);
  const dist = spline(f, [[0, 2.55], [t.same, 2.45], [t.length, 2.5], [t.quarter, 3.25], [t.end, 3.2]]);
  return { eye: orbit(at, yaw, 0.12, dist), at, focal: 1500, cx: 540, cy: 960 };
}

function box(g: CanvasRenderingContext2D, c: Cam, lo: V3, hi: V3, rgb: number[]) {
  const P = (p: V3) => project(c, p);
  const v: V3[] = [[lo[0], lo[1], lo[2]], [hi[0], lo[1], lo[2]], [hi[0], lo[1], hi[2]], [lo[0], lo[1], hi[2]],
    [lo[0], hi[1], lo[2]], [hi[0], hi[1], lo[2]], [hi[0], hi[1], hi[2]], [lo[0], hi[1], hi[2]]];
  const faces: [number[], V3][] = [[[4, 5, 6, 7], [0, 1, 0]], [[2, 3, 7, 6], [0, 0, 1]], [[1, 2, 6, 5], [1, 0, 0]], [[3, 0, 4, 7], [-1, 0, 0]], [[0, 1, 5, 4], [0, 0, -1]]];
  const mid: V3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  for (const [idx, n] of faces) {
    const toEye = [c.eye[0] - mid[0], c.eye[1] - mid[1], c.eye[2] - mid[2]];
    if (n[0] * toEye[0] + n[1] * toEye[1] + n[2] * toEye[2] <= 0) continue;
    const k = 0.6 + 0.4 * Math.max(0, n[0] * 0.4 + n[1] * 0.8 + n[2] * 0.45);
    g.fillStyle = `rgb(${rgb.map((x) => Math.round(x * k)).join(",")})`;
    g.beginPath();
    idx.forEach((i, j) => { const p = P(v[i]); if (j) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); });
    g.closePath(); g.fill();
  }
}

function label(g: CanvasRenderingContext2D, x: number, y: number, text: string, a: number, color: string) {
  if (a <= 0) return;
  g.globalAlpha = a; g.font = "700 46px Inter, sans-serif"; g.textAlign = "center";
  const w = g.measureText(text).width + 36;
  g.fillStyle = "rgba(0,0,0,0.55)"; g.beginPath(); g.roundRect(x - w / 2, y - 40, w, 58, 10); g.fill();
  g.fillStyle = color; g.fillText(text, x, y + 2);
  g.globalAlpha = 1;
}

function paint(g: CanvasRenderingContext2D, f: number, t: T, th: number[][], bg: string, ink: string, accent: string) {
  g.fillStyle = bg; g.fillRect(0, 0, 1080, 1920);
  const c = camera(f, t);
  const P = (p: V3) => project(c, p);
  const i = Math.max(0, Math.min(th[0].length - 1, Math.round(f)));

  // floor grid
  g.lineWidth = 2;
  for (let k = -5; k <= 6; k++) {
    for (const [a, b] of [[[k, 0, -4], [k, 0, 4]], [[-5, 0, k - 1], [6, 0, k - 1]]] as [V3, V3][]) {
      const p = P(a), q = P(b);
      g.strokeStyle = "rgba(255,255,255,0.08)"; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
    }
  }
  // the frame: two posts on the floor and the bar across them
  const wood = [176, 132, 86];
  box(g, c, [-0.9, 0, -0.05], [-0.8, BEAM_Y, 0.05], wood);
  box(g, c, [1.2, 0, -0.05], [1.3, BEAM_Y, 0.05], wood);
  box(g, c, [-0.9, BEAM_Y, -0.05], [1.3, BEAM_Y + 0.08, 0.05], wood);

  // the pendulums: a string from the bar, a brass bob, a soft shadow on the floor under each bob
  PENDS.forEach((p, n) => {
    const a = th[n][i];
    const pivot: V3 = [p.x, BEAM_Y, 0];
    const bob: V3 = [p.x + p.len * Math.sin(a), BEAM_Y - p.len * Math.cos(a), 0];
    const sh = P([bob[0], 0, 0]);
    g.fillStyle = "rgba(0,0,0,0.35)"; g.beginPath(); g.ellipse(sh.x, sh.y, BOB * sh.s * 1.4, BOB * sh.s * 0.4, 0, 0, Math.PI * 2); g.fill();
    const a0 = P(pivot), b0 = P(bob);
    g.strokeStyle = "rgba(235,235,235,0.9)"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(a0.x, a0.y); g.lineTo(b0.x, b0.y); g.stroke();
    const r = BOB * b0.s;
    const grad = g.createRadialGradient(b0.x - r * 0.35, b0.y - r * 0.35, r * 0.1, b0.x, b0.y, r);
    grad.addColorStop(0, "#FFE7A3"); grad.addColorStop(0.5, "#D9A441"); grad.addColorStop(1, "#7A5418");
    g.fillStyle = grad; g.beginPath(); g.arc(b0.x, b0.y, r, 0, Math.PI * 2); g.fill();
  });

  // the periods, each on its word: under the bob's lowest point
  const under = (n: number) => P([PENDS[n].x, BEAM_Y - PENDS[n].len - 0.2, 0]);
  const same = prog(f, t.same, 18, ease.out);
  label(g, under(0).x, under(0).y + 30, "2.0 s", same, ink);
  label(g, under(1).x, under(1).y + 30, "2.0 s", same, ink);
  const tw = prog(f, t.twice, 18, ease.out);
  label(g, under(2).x, under(2).y + 30, "1.0 s", tw, accent);
  const len = prog(f, t.quarter, 18, ease.out);
  label(g, under(2).x, under(2).y - 330, "¼ the length", len, accent);
}

export const PendulumWorld: React.FC = () => {
  const { tl, theme } = useReel();
  const f = useCurrentFrame();
  const k = 60 / tl.fps; // the swings and the camera are written in 60 fps frames; a 30 fps draft plays the same
  const t = useMemo<T>(() => ({
    same: tl.cue("same", 1, 0) * k,
    length: tl.cue("length", 1, 1) * k,
    quarter: tl.cue("quarter", 1, 1) * k,
    twice: tl.cue("twice", 1, 1) * k,
    end: tl.frames * k,
  }), [tl, k]);
  const th = useMemo(() => swings(Math.ceil(tl.frames * k) + 2), [tl, k]);
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const g = ref.current?.getContext("2d");
    if (g) paint(g, f * k, t, th, theme.grounds.dark.bg, theme.grounds.dark.ink, theme.marker.color);
  });
  return <canvas ref={ref} width={1080} height={1920} style={{ position: "absolute", inset: 0, width: 1080, height: 1920 }} />;
};
