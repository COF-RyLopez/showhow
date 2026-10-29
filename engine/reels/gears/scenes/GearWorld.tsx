// The gears demo's one world: a 10-tooth gear on a motor driving a 30-tooth gear, both on axles in a wooden board,
// drawn on a canvas through the pinhole camera as one function of the reel's frame. All three scenes draw this world.
// The gears share one tooth size, so the big one's angle is exactly minus a third of the small one's: they mesh at
// every frame, and turn opposite ways.
//   hook   "ten" / "thirty": the tooth counts; "turn": the motor starts, easing up to speed
//   ratio  from "turn", a marked tooth on the small gear and a marked spoke on the big one each trace their path:
//          one full turn of the small gear is a third of a turn of the big one ("third"); "way": the two directions
//   force  "speed": 3x faster on the small gear; "three": 3x the force on the big one
import React, { useLayoutEffect, useMemo, useRef } from "react";
import { useCurrentFrame } from "remotion";
import { type Cam, type V3, ease, orbit, prog, project, spline, useReel } from "../../../src/engine";

const M = 0.05; // tooth size (module), metres: pitch radius = M x teeth / 2
const SMALL = { z: 10, c: [0, 1.0] as [number, number] };
const BIG = { z: 30, c: [0, 0] as [number, number] };
const THICK = 0.06;
const BOARD_Z = -0.16;

type T = { ten: number; turn: number; thirty: number; full: number; third: number; way: number; speed: number; three: number; end: number };

/** the small gear's angle (radians, counter-clockwise). The motor starts on "turn" and eases up to speed w over 40
 *  frames. From "full turn" to "third" the small gear makes exactly one turn while the motor eases to a stop, so the
 *  marked tooth ends where it began and the big gear has turned exactly a third. Still until "speed", then it starts
 *  again. */
function smallAngle(f: number, t: T) {
  const D = t.third - t.full;
  const w = (4 * Math.PI) / D; // the stop is a quadratic ease-out: it starts at twice the average speed
  const ramp = 40;
  const run = (from: number, x: number) => (x <= from ? 0 : x <= from + ramp ? (w * (x - from) ** 2) / (2 * ramp) : (w * ramp) / 2 + w * (x - from - ramp));
  const atFull = run(t.turn, t.full);
  if (f <= t.full) return run(t.turn, f);
  if (f <= t.third) { const u = (f - t.full) / D; return atFull + 2 * Math.PI * (2 * u - u * u); }
  return atFull + 2 * Math.PI + run(t.speed, f);
}

function outline(z: number, r0: number): [number, number][] {
  const r = (M * z) / 2, ra = r + M, rr = r - 1.25 * M, p = (2 * Math.PI) / z;
  const prof: [number, number][] = [[-0.5, rr], [-0.27, rr], [-0.2, r], [-0.12, ra], [0.12, ra], [0.2, r], [0.27, rr]];
  const pts: [number, number][] = [];
  for (let k = 0; k < z; k++) for (const [a, rad] of prof) pts.push([r0 + k * p + a * p, rad]);
  return pts;
}

function camera(f: number, t: T): Cam {
  const at: V3 = [0, spline(f, [[0, 0.45], [t.full, 0.45], [t.third, 0.4], [t.end, 0.42]]), 0];
  // while the gears rest (from "third" to "speed") the camera keeps a slow push-in and turn, so the picture never stops
  const yaw = spline(f, [[0, -0.22], [t.thirty, -0.16], [t.full, -0.1], [t.third, -0.02], [t.way, 0.08], [t.speed, 0.13], [t.end, 0.18]]);
  const dist = spline(f, [[0, 3.6], [t.thirty, 3.3], [t.full, 3.1], [t.third, 3.08], [t.way, 2.88], [t.speed, 2.95], [t.end, 3.25]]);
  return { eye: orbit(at, yaw, 0.1, dist), at, focal: 1500, cx: 540, cy: 980 };
}

function label(g: CanvasRenderingContext2D, x: number, y: number, text: string, a: number, color: string) {
  if (a <= 0) return;
  g.globalAlpha = a; g.font = "700 50px Inter, sans-serif"; g.textAlign = "center";
  const w = g.measureText(text).width + 40;
  g.fillStyle = "rgba(0,0,0,0.6)"; g.beginPath(); g.roundRect(x - w / 2, y - 44, w, 64, 12); g.fill();
  g.fillStyle = color; g.fillText(text, x, y + 2);
  g.globalAlpha = 1;
}

function paint(g: CanvasRenderingContext2D, f: number, t: T, bg: string, ink: string, accent: string) {
  g.fillStyle = bg; g.fillRect(0, 0, 1080, 1920);
  const c = camera(f, t);
  const P = (p: V3) => project(c, p);
  const poly = (pts: V3[], fill: string) => {
    g.fillStyle = fill; g.beginPath();
    pts.forEach((q, i) => { const s = P(q); if (i) g.lineTo(s.x, s.y); else g.moveTo(s.x, s.y); });
    g.closePath(); g.fill();
  };

  // the board the axles are set in, standing on the floor, and its shadow
  const yb = -0.95, yt = 1.55;
  poly([[-1.0, yb, BOARD_Z - 0.04], [1.0, yb, BOARD_Z - 0.04], [1.0, yb, 0.3], [-1.0, yb, 0.3]], "rgba(0,0,0,0.3)");
  poly([[-0.95, yb, BOARD_Z], [0.95, yb, BOARD_Z], [0.95, yt, BOARD_Z], [-0.95, yt, BOARD_Z]], "rgb(120,88,58)");
  poly([[0.95, yb, BOARD_Z], [0.95, yb, BOARD_Z - 0.04], [0.95, yt, BOARD_Z - 0.04], [0.95, yt, BOARD_Z]], "rgb(84,60,40)");
  poly([[-0.95, yt, BOARD_Z], [0.95, yt, BOARD_Z], [0.95, yt, BOARD_Z - 0.04], [-0.95, yt, BOARD_Z - 0.04]], "rgb(150,112,76)");

  const a1 = smallAngle(f, t);
  const a2 = -a1 * (SMALL.z / BIG.z);
  // phases that mesh at the contact point straight between the centres: a small tooth points down, a big gap points up
  const gears = [
    { ...BIG, rot: Math.PI / 2 + Math.PI / BIG.z + a2, steel: [150, 158, 168] },
    { ...SMALL, rot: -Math.PI / 2 + a1, steel: [196, 170, 110] },
  ];
  for (const gr of gears) {
    const pts = outline(gr.z, gr.rot);
    const at = (z: number) => pts.map(([a, rad]) => [gr.c[0] + rad * Math.cos(a), gr.c[1] + rad * Math.sin(a), z] as V3);
    // the axle from the board, then the gear's back face, side and front face
    const ax0 = P([gr.c[0], gr.c[1], BOARD_Z]), ax1 = P([gr.c[0], gr.c[1], 0]);
    g.strokeStyle = "rgb(70,70,76)"; g.lineWidth = 0.05 * ax1.s; g.lineCap = "round";
    g.beginPath(); g.moveTo(ax0.x, ax0.y); g.lineTo(ax1.x, ax1.y); g.stroke();
    poly(at(-THICK), `rgb(${gr.steel.map((v) => Math.round(v * 0.45)).join(",")})`);
    for (let z = -THICK + 0.01; z < 0; z += 0.01) poly(at(z), `rgb(${gr.steel.map((v) => Math.round(v * 0.55)).join(",")})`);
    poly(at(0), `rgb(${gr.steel.join(",")})`);
    // a ring of lightening holes on the big gear, which also makes its turning easy to see
    if (gr.z === BIG.z) for (let k = 0; k < 6; k++) {
      const a = gr.rot + (k * Math.PI) / 3, q = P([gr.c[0] + 0.42 * Math.cos(a), gr.c[1] + 0.42 * Math.sin(a), 0.001]);
      g.fillStyle = "rgb(92,98,106)"; g.beginPath(); g.arc(q.x, q.y, 0.1 * q.s, 0, Math.PI * 2); g.fill();
    }
  }
  // the motor on the small gear's axle
  const mc = P([SMALL.c[0], SMALL.c[1], 0.05]);
  g.fillStyle = "rgb(40,42,48)"; g.beginPath(); g.arc(mc.x, mc.y, 0.11 * mc.s, 0, Math.PI * 2); g.fill();
  g.fillStyle = "rgb(90,94,104)"; g.beginPath(); g.arc(mc.x, mc.y, 0.04 * mc.s, 0, Math.PI * 2); g.fill();
  const bc = P([BIG.c[0], BIG.c[1], 0.01]);
  g.fillStyle = "rgb(70,70,76)"; g.beginPath(); g.arc(bc.x, bc.y, 0.06 * bc.s, 0, Math.PI * 2); g.fill();

  // "full turn": a marked tooth on the small gear and a marked spoke on the big one, each tracing its path to "third"
  const mark = prog(f, t.full - 8, 12, ease.out);
  if (mark > 0) {
    const r1 = (M * SMALL.z) / 2 + M, r2 = (M * BIG.z) / 2;
    const s0 = -Math.PI / 2 + smallAngle(t.full, t), s1 = -Math.PI / 2 + Math.min(a1, smallAngle(t.third, t));
    const b0 = Math.PI / 2 - smallAngle(t.full, t) / 3, b1 = Math.PI / 2 - Math.min(a1, smallAngle(t.third, t)) / 3;
    const arc = (cx: number, cy: number, r: number, from: number, to: number) => {
      g.beginPath();
      for (let i = 0; i <= 64; i++) {
        const a = from + ((to - from) * i) / 64, q = P([cx + r * Math.cos(a), cy + r * Math.sin(a), 0.02]);
        if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y);
      }
      g.stroke();
    };
    // the traced paths stay while the gears rest, then fade as they start again on "speed"
    const keepArc = 1 - prog(f, t.speed, 20, ease.inOut);
    g.globalAlpha = mark * keepArc; g.strokeStyle = accent; g.lineWidth = 9; g.lineCap = "round";
    if (f > t.full) {
      arc(SMALL.c[0], SMALL.c[1], r1 + 0.07, s0, s1);
      arc(BIG.c[0], BIG.c[1], r2 + 0.12, b0, b1);
    }
    g.globalAlpha = mark;
    // the marks themselves: on the small gear's tooth tip, and a spoke on the big gear (both ride with their gear)
    const tip = P([SMALL.c[0] + r1 * Math.cos(-Math.PI / 2 + a1), SMALL.c[1] + r1 * Math.sin(-Math.PI / 2 + a1), 0.02]);
    g.fillStyle = accent; g.beginPath(); g.arc(tip.x, tip.y, 14, 0, Math.PI * 2); g.fill();
    const sp0 = P([BIG.c[0], BIG.c[1], 0.02]), sp1 = P([BIG.c[0] + r2 * Math.cos(Math.PI / 2 + a2), BIG.c[1] + r2 * Math.sin(Math.PI / 2 + a2), 0.02]);
    g.lineWidth = 10; g.beginPath(); g.moveTo(sp0.x, sp0.y); g.lineTo(sp1.x, sp1.y); g.stroke();
    g.globalAlpha = 1;
  }

  // "way": a curved arrow beside each gear for its direction (small counter-clockwise, big clockwise)
  const way = prog(f, t.way - 4, 16, ease.out);
  const arrow = (cx: number, cy: number, r: number, from: number, sweep: number) => {
    g.globalAlpha = way; g.strokeStyle = ink; g.lineWidth = 8; g.lineCap = "round";
    let last = P([0, 0, 0]), prev = last;
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = from + (sweep * way * i) / 40, q = P([cx + r * Math.cos(a), cy + r * Math.sin(a), 0.03]);
      if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y);
      prev = last; last = q;
    }
    g.stroke();
    const ang = Math.atan2(last.y - prev.y, last.x - prev.x);
    g.fillStyle = ink; g.beginPath();
    g.moveTo(last.x + 24 * Math.cos(ang), last.y + 24 * Math.sin(ang));
    g.lineTo(last.x + 18 * Math.cos(ang + 2.3), last.y + 18 * Math.sin(ang + 2.3));
    g.lineTo(last.x + 18 * Math.cos(ang - 2.3), last.y + 18 * Math.sin(ang - 2.3));
    g.closePath(); g.fill(); g.globalAlpha = 1;
  };
  if (way > 0) {
    arrow(SMALL.c[0], SMALL.c[1], 0.42, Math.PI * 0.15, Math.PI * 0.7);
    arrow(BIG.c[0], BIG.c[1], 0.96, Math.PI * 1.15, -Math.PI * 0.4);
  }

  // the words on the picture, each on its word
  const sL = P([SMALL.c[0] + 0.62, SMALL.c[1] + 0.12, 0]), bL = P([BIG.c[0], BIG.c[1] - 1.2, 0]);
  const teeth = prog(f, t.ten, 14, ease.out) * (1 - prog(f, t.full - 20, 14, ease.inOut));
  label(g, sL.x, sL.y, "10 teeth", teeth, ink);
  label(g, bL.x, bL.y, "30 teeth", prog(f, t.thirty, 14, ease.out) * (1 - prog(f, t.full - 20, 14, ease.inOut)), ink);
  const done = prog(f, t.third, 14, ease.out) * (1 - prog(f, t.speed - 16, 14, ease.inOut));
  label(g, sL.x, sL.y, "1 turn", done, accent);
  label(g, bL.x, bL.y, "⅓ turn", done, accent);
  label(g, sL.x, sL.y, "3× faster", prog(f, t.speed, 14, ease.out), ink);
  label(g, bL.x, bL.y, "3× the force", prog(f, t.three, 14, ease.out), accent);
}

export const GearWorld: React.FC = () => {
  const { tl, theme } = useReel();
  const f = useCurrentFrame();
  const k = 60 / tl.fps; // the motion is written in 60 fps frames; a 30 fps draft plays the same
  const t = useMemo<T>(() => ({
    ten: tl.cue("ten", 1, 0) * k,
    turn: tl.cue("turn", 1, 0) * k,
    thirty: tl.cue("thirty.", 1, 0) * k,
    full: tl.cue("full", 1, 1) * k,
    third: tl.cue("third", 1, 1) * k,
    way: tl.cue("way.", 1, 1) * k,
    speed: tl.cue("speed", 1, 2) * k,
    three: tl.cue("three", 1, 2) * k,
    end: tl.frames * k,
  }), [tl, k]);
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const g = ref.current?.getContext("2d");
    if (g) paint(g, f * k, t, theme.grounds.dark.bg, theme.grounds.dark.ink, theme.marker.color);
  });
  return <canvas ref={ref} width={1080} height={1920} style={{ position: "absolute", inset: 0, width: 1080, height: 1920 }} />;
};
