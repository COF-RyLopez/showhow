// The demo's one world: a wooden block on a floor, drawn on a canvas through the pinhole camera, as one function of
// the reel's frame. Both scenes draw this same world, so the change from "hook" to "orbit" is one continuous picture.
//   "block"  the block falls in from above the frame, under real gravity, and lands on "code" (it never floats)
//   "code"   once it has landed, its edges trace on in the accent colour, as if being drawn
//   "frame"  a frame counter ticks in the corner
//   "camera" the camera starts circling the block, one smooth move on a spline through the word cues
//   "move"   it rises to look down on the top face
//   "word"   the top face lights up, and the camera settles
import React, { useLayoutEffect, useMemo, useRef } from "react";
import { useCurrentFrame } from "remotion";
import { type Cam, type V3, ease, orbit, prog, project, spline, useReel } from "../../../src/engine";

const S = 1.0; // block edge, in metres
const G = 9.81 / 3600; // gravity in metres per frame squared at 60 fps
const START = 4; // the fall starts on this frame, from rest, high above the top of the frame

type T = { block: number; code: number; frame: number; camera: number; move: number; word: number; end: number };

function useTimes(): T {
  const { tl } = useReel();
  return useMemo(() => ({
    block: tl.cue("block", 1, 0),
    code: tl.cue("code", 1, 0),
    frame: tl.cue("frame", 1, 0),
    camera: tl.cue("camera", 1, 1),
    move: tl.cue("move", 1, 1),
    word: tl.cue("word", 1, 1),
    end: tl.frames,
  }), [tl]);
}

/** how high the block starts: the height a free fall from rest covers between START and "code" (about 6 m here,
 *  so it is above the frame at first and comes into view around "block") */
const dropOf = (t: T) => 0.5 * G * (t.code - START) ** 2;

/** the block's height above the floor: a free fall from rest, landing exactly on "code" */
function lift(f: number, t: T) {
  const drop = dropOf(t);
  if (f <= START) return drop;
  if (f >= t.code) return 0;
  return drop - 0.5 * G * (f - START) ** 2;
}

function camera(f: number, t: T): Cam {
  const at: V3 = [0, S * 0.5, 0];
  const yaw = spline(f, [[0, 0.62], [t.camera, 0.66], [t.move, 1.5], [t.word, 2.3], [t.end, 2.42]]);
  const pitch = spline(f, [[0, 0.3], [t.move, 0.34], [t.word, 0.78], [t.end, 0.8]]);
  const dist = spline(f, [[0, 7.4], [t.block, 7.0], [t.camera, 6.6], [t.word, 6.0], [t.end, 5.9]]);
  return { eye: orbit(at, yaw, pitch, dist), at, focal: 1500, cx: 540, cy: 980 };
}

function paint(g: CanvasRenderingContext2D, f: number, t: T, bg: string, ink: string, accent: string) {
  g.clearRect(0, 0, 1080, 1920);
  g.fillStyle = bg;
  g.fillRect(0, 0, 1080, 1920);
  const c = camera(f, t);
  const P = (p: V3) => project(c, p);

  // the floor: a grid of 1 m squares, fading with distance
  g.lineWidth = 2;
  for (let i = -6; i <= 6; i++) {
    for (const [a, b] of [[[i, 0, -6], [i, 0, 6]], [[-6, 0, i], [6, 0, i]]] as [V3, V3][]) {
      const p = P(a), q = P(b);
      g.strokeStyle = `rgba(255,255,255,${(0.16 - Math.abs(i) * 0.018).toFixed(3)})`;
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
    }
  }

  const y = lift(f, t);
  // the contact shadow grows and darkens as the block nears the floor
  const near = 1 - Math.min(1, y / dropOf(t));
  const sh = [[-0.6, 0, -0.6], [0.6, 0, -0.6], [0.6, 0, 0.6], [-0.6, 0, 0.6]].map((v) => P(v as V3));
  g.fillStyle = `rgba(0,0,0,${(0.15 + 0.35 * near).toFixed(3)})`;
  g.beginPath(); sh.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.fill();

  // the block: eight corners, six faces, drawn back to front, each shaded by how squarely it faces the light
  const h = S / 2;
  const v: V3[] = [[-h, y, -h], [h, y, -h], [h, y, h], [-h, y, h], [-h, y + S, -h], [h, y + S, -h], [h, y + S, h], [-h, y + S, h]];
  const faces: { idx: number[]; n: V3; top?: boolean }[] = [
    { idx: [0, 1, 2, 3], n: [0, -1, 0] }, { idx: [4, 5, 6, 7], n: [0, 1, 0], top: true },
    { idx: [0, 1, 5, 4], n: [0, 0, -1] }, { idx: [2, 3, 7, 6], n: [0, 0, 1] },
    { idx: [1, 2, 6, 5], n: [1, 0, 0] }, { idx: [3, 0, 4, 7], n: [-1, 0, 0] },
  ];
  const light: V3 = [0.45, 0.8, 0.4];
  const scr = v.map(P);
  const lit = prog(f, t.word, 24, ease.out);
  const seen = faces
    .filter((fc) => {
      const centre = fc.idx.reduce<V3>((s, i) => [s[0] + v[i][0] / 4, s[1] + v[i][1] / 4, s[2] + v[i][2] / 4], [0, 0, 0]);
      const toEye: V3 = [c.eye[0] - centre[0], c.eye[1] - centre[1], c.eye[2] - centre[2]];
      return fc.n[0] * toEye[0] + fc.n[1] * toEye[1] + fc.n[2] * toEye[2] > 0;
    })
    .sort((a, b) => Math.max(...b.idx.map((i) => scr[i].z)) - Math.max(...a.idx.map((i) => scr[i].z)));
  for (const fc of seen) {
    const k = 0.55 + 0.45 * Math.max(0, fc.n[0] * light[0] + fc.n[1] * light[1] + fc.n[2] * light[2]);
    const wood = [196, 150, 98].map((x) => Math.round(x * k));
    g.fillStyle = `rgb(${wood.join(",")})`;
    g.beginPath(); fc.idx.forEach((i, j) => (j ? g.lineTo(scr[i].x, scr[i].y) : g.moveTo(scr[i].x, scr[i].y))); g.closePath(); g.fill();
    if (fc.top && lit > 0) {
      g.fillStyle = accent; g.globalAlpha = 0.55 * lit; g.fill(); g.globalAlpha = 1;
    }
  }

  // "code": the visible edges trace on, one after another
  const trace = prog(f, t.code + 2, 40, ease.inOut);
  if (trace > 0) {
    const edges = new Map<string, [number, number]>();
    for (const fc of seen) fc.idx.forEach((a, j) => {
      const b = fc.idx[(j + 1) % 4];
      edges.set([a, b].sort().join("-"), [a, b]);
    });
    const list = [...edges.values()];
    g.strokeStyle = accent; g.lineWidth = 5; g.lineCap = "round";
    list.forEach(([a, b], i) => {
      const k = Math.max(0, Math.min(1, trace * list.length - i));
      if (!k) return;
      g.beginPath(); g.moveTo(scr[a].x, scr[a].y);
      g.lineTo(scr[a].x + (scr[b].x - scr[a].x) * k, scr[a].y + (scr[b].y - scr[a].y) * k); g.stroke();
    });
  }

  // "frame": the frame number, ticking
  const show = prog(f, t.frame - 4, 14, ease.out);
  if (show > 0) {
    g.globalAlpha = show; g.fillStyle = ink;
    g.font = "700 44px 'JetBrains Mono', monospace"; g.textAlign = "center";
    g.fillText(`FRAME ${String(Math.round(f)).padStart(4, "0")}`, 540, 1560);
    g.globalAlpha = 1;
  }
}

export const BlockWorld: React.FC = () => {
  const { tl, theme } = useReel();
  const t = useTimes();
  const ref = useRef<HTMLCanvasElement>(null);
  const f = useCurrentFrame();
  useLayoutEffect(() => {
    const g = ref.current?.getContext("2d");
    if (g) paint(g, f * (60 / tl.fps), { ...t, ...scale(t, 60 / tl.fps) }, theme.grounds.dark.bg, theme.grounds.dark.ink, theme.marker.color);
  });
  return <canvas ref={ref} width={1080} height={1920} style={{ position: "absolute", inset: 0, width: 1080, height: 1920 }} />;
};

// the physics and camera are written in 60 fps frames; a 30 fps draft scales the times so it plays the same
const scale = (t: T, k: number): T => Object.fromEntries(Object.entries(t).map(([n, v]) => [n, v * k])) as T;
