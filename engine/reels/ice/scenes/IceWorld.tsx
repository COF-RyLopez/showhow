// The ice reel's one world, drawn on a 2D canvas as one function of the reel's time. All three scenes draw it, so every
// scene change is one continuous picture; the views hand over by a slow zoom and crossfade, never a cut.
//   hook     a glass of water. A stone falls in under real gravity and sinks ("sinks"); an ice cube falls in, bobs on a
//            damped spring and settles with 91.7% under (ice 0.917 g/cm³). "tenths" rules the cube into ten.
//   lattice  the camera zooms into the water: molecules jostle, then on "freezes" lock into the honeycomb of ice, each
//            hydrogen-bonded to three in the plane and one in the layer behind ("four"); a ring of six and its open middle.
//   weight   two measuring cylinders on scales hold 1.00 L of water each. One freezes and rises to 1.09 L, still 1.00 kg
//            ("room"); its top 0.09 L is lifted away and the scale counts down to 0.92 kg ("less"). Then a lake in cross
//            section freezes from its surface down while a fish swims underneath.
import React, { useLayoutEffect, useMemo, useRef } from "react";
import { useCurrentFrame } from "remotion";
import { ease, prog, spline, useReel } from "../../../src/engine";

const W = 1080, H = 1920;
const PX = 1867;                // pixels a metre in the glass: the glass is 0.3 m wide
const G = 9.81 * PX;            // gravity, px/s²
const rnd = (i: number) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
type RGB = [number, number, number];
const rgb = (c: RGB, k = 1, a = 1) => `rgba(${c.map((v) => Math.round(Math.min(255, v * k))).join(",")},${a})`;

/** a sphere lit from up and to the left: a highlight, the colour, then a dark rim */
function ball(g: CanvasRenderingContext2D, x: number, y: number, r: number, c: RGB) {
  const gr = g.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.08, x, y, r);
  gr.addColorStop(0, rgb(c, 1.45)); gr.addColorStop(0.5, rgb(c)); gr.addColorStop(1, rgb(c, 0.42));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
}

/** a soft pool of light behind the subject, so the dark ground is not flat */
function backlight(g: CanvasRenderingContext2D, x: number, y: number, r: number, c: RGB, a: number) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgb(c, 1, a)); gr.addColorStop(1, rgb(c, 1, 0));
  g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
}

/** a tabletop from y down: a lit front edge fading into shadow */
function table(g: CanvasRenderingContext2D, y: number) {
  const gr = g.createLinearGradient(0, y, 0, y + 600);
  gr.addColorStop(0, "#3b342d"); gr.addColorStop(0.08, "#2a251f"); gr.addColorStop(1, "#141210");
  g.fillStyle = gr; g.fillRect(-600, y, W + 1200, 1400);
  g.fillStyle = "rgba(255,240,220,0.10)"; g.fillRect(-600, y, W + 1200, 3);
}

/** a contact shadow: a soft dark ellipse where something stands */
function shadow(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a = 0.55) {
  g.save(); g.translate(x, y); g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, 7); g.fill(); g.restore();
}

/** ice in a rectangle: clear at the rim, a cloudy white core (trapped air), a few bubbles, a bright top-left edge */
function iceBlock(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rad: number, seed: number) {
  g.save();
  g.beginPath(); g.roundRect(x, y, w, h, rad); g.clip();
  const body = g.createLinearGradient(x, y, x + w, y + h);
  body.addColorStop(0, "rgba(236,247,255,0.95)"); body.addColorStop(0.5, "rgba(196,226,248,0.88)"); body.addColorStop(1, "rgba(150,196,232,0.9)");
  g.fillStyle = body; g.fillRect(x, y, w, h);
  const core = g.createRadialGradient(x + w * 0.5, y + h * 0.55, 0, x + w * 0.5, y + h * 0.55, Math.min(w, h) * 0.55);
  core.addColorStop(0, "rgba(255,255,255,0.65)"); core.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = core; g.fillRect(x, y, w, h);
  for (let i = 0; i < Math.max(4, (w * h) / 2500); i++) {
    const bx = x + w * (0.15 + 0.7 * rnd(seed + i * 1.7)), by = y + h * (0.15 + 0.7 * rnd(seed + i * 2.3)), br = 2 + 4 * rnd(seed + i * 3.1);
    g.fillStyle = "rgba(255,255,255,0.7)"; g.beginPath(); g.arc(bx, by, br, 0, 7); g.fill();
  }
  g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 2;   // a hairline crack
  g.beginPath(); g.moveTo(x + w * 0.2, y + h * 0.75); g.lineTo(x + w * 0.42, y + h * 0.6); g.lineTo(x + w * 0.5, y + h * 0.68); g.stroke();
  g.restore();
  g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = 3;
  g.beginPath(); g.moveTo(x + rad, y + 1.5); g.lineTo(x + w - rad, y + 1.5); g.moveTo(x + 1.5, y + rad); g.lineTo(x + 1.5, y + h - rad); g.stroke();
  g.strokeStyle = "rgba(90,140,190,0.6)";
  g.beginPath(); g.moveTo(x + w - 1.5, y + rad); g.lineTo(x + w - 1.5, y + h - rad); g.moveTo(x + rad, y + h - 1.5); g.lineTo(x + w - rad, y + h - 1.5); g.stroke();
}

/** a glass wall seen side on: a pale edge with a thin bright line inside it */
function glassWalls(g: CanvasRenderingContext2D, l: number, r: number, top: number, bottom: number) {
  g.fillStyle = "rgba(220,235,255,0.04)"; g.fillRect(l, top, r - l, bottom - top);
  g.fillStyle = "rgba(255,255,255,0.07)"; g.fillRect(l + 22, top + 20, 16, bottom - top - 40);   // reflections on the front
  g.fillStyle = "rgba(255,255,255,0.04)"; g.fillRect(r - 52, top + 20, 9, bottom - top - 40);
  g.fillStyle = "rgba(220,235,255,0.22)"; g.fillRect(l - 4, bottom, r - l + 8, 18);                // the thick base
  g.lineJoin = "round"; g.lineCap = "round";
  g.strokeStyle = "rgba(210,228,250,0.5)"; g.lineWidth = 10;
  g.beginPath(); g.moveTo(l - 5, top); g.lineTo(l - 5, bottom + 18); g.lineTo(r + 5, bottom + 18); g.lineTo(r + 5, top); g.stroke();
  g.strokeStyle = "rgba(255,255,255,0.8)"; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(l - 2, top + 4); g.lineTo(l - 2, bottom); g.moveTo(r + 2, top + 4); g.lineTo(r + 2, bottom); g.stroke();
}

/** water filling a container below a surface line: lighter near the top, deeper below, with drifting caustic light */
function waterBody(g: CanvasRenderingContext2D, l: number, r: number, bottom: number, surf: (x: number) => number, top: number, s: number, a = 1) {
  g.save();
  g.beginPath(); g.moveTo(l, bottom);
  for (let x = l; x <= r; x += 8) g.lineTo(x, surf(x));
  g.lineTo(r, surf(r)); g.lineTo(r, bottom); g.closePath();
  const gr = g.createLinearGradient(0, top, 0, bottom);
  gr.addColorStop(0, `rgba(88,160,235,${0.55 * a})`); gr.addColorStop(1, `rgba(18,58,128,${0.85 * a})`);
  g.fillStyle = gr; g.fill(); g.clip();
  g.globalCompositeOperation = "lighter"; g.lineCap = "round";
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    for (let x = l; x <= r; x += 12) {
      const y = top + 50 + i * ((bottom - top) / 5) + (20 + 9 * i) * Math.sin(x * (0.011 + 0.004 * i) + s * 1.3 + i * 1.7) + 10 * Math.sin(x * 0.037 - s * 0.9 + i * 2.3);
      x === l ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    // ponytail: two wide faint strokes fake a soft edge; a blur filter here made the full render ~10x slower
    g.strokeStyle = `rgba(150,205,255,${0.025 * a})`; g.lineWidth = 30; g.stroke();
    g.strokeStyle = `rgba(150,205,255,${0.03 * a})`; g.lineWidth = 12; g.stroke();
  }
  g.restore();
  g.strokeStyle = `rgba(200,232,255,${0.95 * a})`; g.lineWidth = 3;
  g.beginPath(); for (let x = l; x <= r; x += 8) (x === l ? g.moveTo(x, surf(x)) : g.lineTo(x, surf(x))); g.stroke();
}

type T = Record<"solid" | "sinks" | "ice" | "floats" | "tenths" | "water1" | "as" | "freezes" | "locks" | "four" | "rings"
  | "six" | "space" | "same" | "room" | "litre" | "ice2" | "weighs" | "less" | "water4" | "thats" | "lakes" | "freeze" | "top" | "end", number>;

function useTimes(): T {
  const { tl } = useReel();
  return useMemo(() => {
    const c = (w: string, n = 1) => tl.cue(w, n) / tl.fps;
    return {
      solid: c("solid"), sinks: c("sinks"), ice: c("ice"), floats: c("floats"), tenths: c("tenths"), water1: c("water"),
      as: c("as"), freezes: c("freezes"), locks: c("locks"), four: c("four"), rings: c("rings"), six: c("six"), space: c("space"),
      same: c("same"), room: c("room"), litre: c("litre"), ice2: c("ice", 2), weighs: c("weighs"), less: c("less"),
      water4: c("water", 4), thats: c("thats"), lakes: c("lakes"), freeze: c("freeze"), top: c("top"), end: tl.frames / tl.fps,
    };
  }, [tl]);
}

// ---------- the glass ----------
const GL = { l: 260, r: 820, top: 560, bottom: 1400, level: 800 };   // inner walls and the still water line, px
const STONE = { x: 420, w: 84, h: 66 };
const CUBE = { x: 620, s: 170, rho: 0.917 };

/** depth of the stone's bottom below the surface: free fall from above the frame, then drag to terminal speed, then rest */
function stoneDepth(s: number, hit: number) {
  if (s < hit) return -0.5 * G * (hit - s) ** 2;
  const v0 = 900, vt = 520, k = 0.12, tau = s - hit;
  return Math.min(vt * tau + (v0 - vt) * k * (1 - Math.exp(-tau / k)), GL.bottom - GL.level);
}

/** how deep the cube's bottom sits below the surface: free fall, then a damped bob about 0.917 of its side */
function cubeDepth(s: number, hit: number) {
  if (s < hit) return -0.5 * G * (hit - s) ** 2;
  const eq = CUBE.rho * CUBE.s, v0 = 900, w = (2 * Math.PI) / 0.75, b = 3.2, tau = s - hit;
  return eq + Math.exp(-b * tau) * (-eq * Math.cos(w * tau) + ((v0 - b * eq) / w) * Math.sin(w * tau));
}

function glass(g: CanvasRenderingContext2D, s: number, t: T, accent: string) {
  const sHit = t.sinks - 0.02, cHit = t.floats - 0.05;
  const sd = stoneDepth(s, sHit), cd = cubeDepth(s, cHit);
  // the water rises by the area pushed aside (in this side view, area over the glass width)
  const level = GL.level - (STONE.w * clamp01(sd / STONE.h) * STONE.h + CUBE.s * Math.max(0, Math.min(cd, CUBE.s))) / (GL.r - GL.l);
  const surf = (x: number) => {
    let y = level + 2.5 * Math.sin(x * 0.013 + s * 1.7) + 1.5 * Math.sin(x * 0.031 - s * 2.3);
    for (const [x0, t0, a] of [[STONE.x, sHit, 12], [CUBE.x, cHit, 20]]) {
      const tau = s - t0;
      if (tau > 0) y += a * Math.exp(-2.4 * tau) * Math.sin(0.045 * Math.abs(x - x0) - 13 * tau) * Math.exp(-Math.abs(x - x0) / 500);
    }
    return y;
  };

  // the room: a cool light behind the glass, the table it stands on, its shadow
  backlight(g, 540, 820, 900, [70, 120, 190], 0.28);
  table(g, GL.bottom + 22);
  shadow(g, 540, GL.bottom + 26, 380, 34, 0.6);

  // the stone, then the cube, then the water over them, so what is under water takes its tint
  const sy = level + sd;   // bottom of the stone
  const st = g.createRadialGradient(STONE.x - 18, sy - STONE.h + 16, 4, STONE.x, sy - STONE.h / 2, STONE.w * 0.62);
  st.addColorStop(0, "#c2b8aa"); st.addColorStop(0.55, "#857c70"); st.addColorStop(1, "#3e3934");
  g.fillStyle = st;
  g.beginPath(); g.roundRect(STONE.x - STONE.w / 2, sy - STONE.h, STONE.w, STONE.h, 28); g.fill();
  if (sd >= GL.bottom - GL.level - 1) shadow(g, STONE.x, GL.bottom - 2, 50, 7, 0.45);

  const cb = level + cd, ct = cb - CUBE.s, cl = CUBE.x - CUBE.s / 2;
  iceBlock(g, cl, ct, CUBE.s, CUBE.s, 16, 11);
  // "tenths": nine rules across the cube, lit from the bottom up; the ninth sits just under the water line
  for (let i = 1; i <= 9; i++) {
    const k = prog(s, t.tenths + (i - 1) * 0.055, 0.25, ease.out);
    if (k <= 0) continue;
    const y = cb - (CUBE.s * i) / 10;
    g.strokeStyle = accent; g.globalAlpha *= k; g.lineWidth = 4;
    g.beginPath(); g.moveTo(cl + 10, y); g.lineTo(cl + 10 + (CUBE.s - 20) * k, y); g.stroke();
    g.globalAlpha /= k;
  }

  waterBody(g, GL.l, GL.r, GL.bottom, surf, level, s);
  glassWalls(g, GL.l, GL.r, GL.top, GL.bottom);
}

// ---------- the molecules ----------
const B = 120;                                  // O–O distance on screen, px
const HC: [number, number] = [540, 940];        // centre of the ring the reel looks at
type Mol = { x: number; y: number; nb: number[]; th: number };

function lattice(): { mols: Mol[]; ring: number[]; four: number } {
  const r3 = Math.sqrt(3), mols: Mol[] = [];
  // honeycomb: sites A = i a1 + j a2 and B = A + (0, B); (√3B/2, B/2) is the centre of a ring
  const ox = HC[0] - (r3 * B) / 2, oy = HC[1] - B / 2;
  for (let j = -12; j <= 12; j++) for (let i = -12; i <= 12; i++) for (const dy of [0, B]) {
    const x = ox + i * r3 * B + j * (r3 * B) / 2, y = oy + j * 1.5 * B + dy;
    if (Math.hypot(x - HC[0], y - HC[1]) < 1250) mols.push({ x, y, nb: [], th: 0 });
  }
  mols.forEach((m, a) => mols.forEach((n, b) => { if (a !== b && Math.abs(Math.hypot(m.x - n.x, m.y - n.y) - B) < 1) m.nb.push(b); }));
  // each molecule points its two hydrogens at two of its neighbours
  mols.forEach((m, a) => {
    const pick = m.nb.length ? m.nb : [a];
    const k = Math.floor(rnd(a * 3.1) * pick.length);
    const n1 = mols[pick[k]], n2 = mols[pick[(k + 1) % pick.length]];
    m.th = Math.atan2(n1.y + n2.y - 2 * m.y, n1.x + n2.x - 2 * m.x);
  });
  const ring = mols.map((m, i) => [i, Math.hypot(m.x - HC[0], m.y - HC[1])] as const).filter(([, d]) => Math.abs(d - B) < 1)
    .sort((a, b) => Math.atan2(mols[a[0]].y - HC[1], mols[a[0]].x - HC[0]) - Math.atan2(mols[b[0]].y - HC[1], mols[b[0]].x - HC[0])).map(([i]) => i);
  const four = ring.reduce((best, i) => (mols[i].x < mols[best].x ? i : best), ring[0]);
  return { mols, ring, four };
}

const BACK: [number, number] = [26, -22];   // the layer behind sits a little up and to the right, smaller and dimmer

/** an out-of-focus sphere: its colour fading to nothing past its edge (cheap stand-in for a blur filter) */
function blob(g: CanvasRenderingContext2D, x: number, y: number, r: number, c: RGB) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r * 1.5);
  gr.addColorStop(0, rgb(c, 0.9)); gr.addColorStop(0.5, rgb(c, 0.8, 0.8)); gr.addColorStop(1, rgb(c, 0.6, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 1.5, 0, 7); g.fill();
}

function molecule(g: CanvasRenderingContext2D, x: number, y: number, th: number, k: number, soft = false) {
  const draw = soft ? blob : ball;
  for (const d of [-0.91, 0.91])   // H–O–H is 104.5°
    draw(g, x + Math.cos(th + d) * 0.36 * B * k, y + Math.sin(th + d) * 0.36 * B * k, 0.14 * B * k, [228, 232, 238]);
  draw(g, x, y, 0.24 * B * k, [222, 74, 60]);
}

function molecules(g: CanvasRenderingContext2D, s: number, t: T, L: ReturnType<typeof lattice>, accent: string) {
  const frz = prog(s, t.freezes, Math.max(0.8, t.locks + 0.3 - t.freezes), ease.inOut);
  const pos = (i: number, back = 0) => {
    const m = L.mols[i], r = (q: number) => rnd(i * 7.7 + q + back * 31);
    // liquid: packed a little closer (water is denser than ice), scattered and jostling
    const lx = HC[0] + (m.x - HC[0]) * 0.91 + (r(1) - 0.5) * 0.9 * B + 22 * Math.sin(s * (1.3 + r(2)) + r(3) * 6);
    const ly = HC[1] + (m.y - HC[1]) * 0.91 + (r(4) - 0.5) * 0.9 * B + 22 * Math.cos(s * (1.1 + r(5)) + r(6) * 6);
    const sx = m.x + 3 * Math.sin(s * 9 + r(7) * 6), sy = m.y + 3 * Math.cos(s * 8 + r(8) * 6);   // ice still shivers
    let lth = r(9) * 7 + s * (0.6 + r(10)), d = ((m.th - lth + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    lth += d * frz;
    return { x: lx + (sx - lx) * frz, y: ly + (sy - ly) * frz, th: lth };
  };

  // deep water behind it all, then the layer behind, out of focus
  backlight(g, HC[0], HC[1], 1500, [30, 70, 130], 0.55);
  g.save();
  g.globalAlpha *= 0.45;
  L.mols.forEach((_, i) => { const p = pos(i, 1); molecule(g, p.x + BACK[0], p.y + BACK[1], p.th + 0.5, 0.72, true); });
  g.restore();

  // hydrogen bonds once frozen
  const bonds = prog(s, t.locks - 0.1, 0.6, ease.out);
  if (bonds > 0) {
    g.strokeStyle = "rgba(150,200,255,0.5)"; g.lineWidth = 3; g.setLineDash([10, 10]);
    g.globalAlpha *= bonds;
    g.beginPath();
    L.mols.forEach((m, a) => m.nb.forEach((b) => { if (b > a) { const p = pos(a), q = pos(b); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); } }));
    g.stroke(); g.setLineDash([]); g.globalAlpha /= bonds;
  }

  // "space": the open middle of the ring glows
  const sp = prog(s, t.space, 0.6, ease.out);
  if (sp > 0) {
    const gr = g.createRadialGradient(HC[0], HC[1], 0, HC[0], HC[1], 0.9 * B * sp);
    gr.addColorStop(0, accent); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.globalAlpha *= 0.5 * sp; g.fillStyle = gr;
    g.beginPath(); g.arc(HC[0], HC[1], 0.9 * B * sp, 0, 7); g.fill(); g.globalAlpha /= 0.5 * sp;
  }

  L.mols.forEach((_, i) => { const p = pos(i); molecule(g, p.x, p.y, p.th, 1); });

  // "four": one molecule and its four bonds, three in the plane and one to the layer behind
  const f4 = prog(s, t.four - 0.15, 0.4, ease.out);
  if (f4 > 0) {
    const m = pos(L.four);
    const ends = [...L.mols[L.four].nb.map((b) => pos(b)), { x: m.x + BACK[0], y: m.y + BACK[1] }];
    g.strokeStyle = accent; g.lineWidth = 7; g.lineCap = "round";
    ends.forEach((q, i) => {
      const k = prog(s, t.four - 0.1 + i * 0.12, 0.3, ease.out);
      if (k > 0) { g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(m.x + (q.x - m.x) * k, m.y + (q.y - m.y) * k); g.stroke(); }
    });
    g.globalAlpha *= f4; g.lineWidth = 6;
    g.beginPath(); g.arc(m.x, m.y, 0.36 * B, 0, 7); g.stroke(); g.globalAlpha /= f4;
  }

  // "rings": the ring of six traces on; "six": its molecules ring one by one
  const rg = prog(s, t.rings - 0.05, 0.55, ease.inOut);
  if (rg > 0) {
    const pts = L.ring.map((i) => pos(i));
    g.strokeStyle = accent; g.lineWidth = 8; g.lineJoin = "round";
    g.beginPath();
    const n = rg * pts.length;
    for (let k = 0; k <= Math.floor(n) && k <= pts.length; k++) {
      const p = pts[k % pts.length];
      if (k === 0) g.moveTo(p.x, p.y);
      else if (k <= n) g.lineTo(p.x, p.y);
    }
    const k0 = Math.floor(n);
    if (k0 < pts.length) { const a = pts[k0 % pts.length], b = pts[(k0 + 1) % pts.length], u = n - k0; g.lineTo(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u); }
    g.stroke();
    pts.forEach((p, i) => {
      const k = prog(s, t.six - 0.1 + i * 0.07, 0.3, ease.out);
      if (k > 0) { g.globalAlpha *= k; g.lineWidth = 5; g.beginPath(); g.arc(p.x, p.y, 0.3 * B + 6 * (1 - k), 0, 7); g.stroke(); g.globalAlpha /= k; }
    });
  }
}

// ---------- the cylinders ----------
const CY = { w: 250, bottom: 1290, litre: 500, xs: [320, 760] };   // 1 L is 500 px of height

function cylinders(g: CanvasRenderingContext2D, s: number, t: T, ink: string, accent: string) {
  const frost = prog(s, t.room - 0.9, 0.9, ease.inOut);
  const grow = prog(s, t.room - 0.6, 0.9, ease.inOut);
  const cut = prog(s, t.ice2 - 0.25, 0.7, ease.inOut);         // the top 0.09 L lifts away
  const kg = 1 - 0.083 * prog(s, t.less - 0.15, 0.6, ease.out); // 1.09 L of ice is 1 kg, so 1 L of it is 0.917 kg
  const top = CY.bottom - CY.litre * (1 + 0.09 * grow);
  const oneL = CY.bottom - CY.litre;

  backlight(g, 540, 900, 950, [70, 120, 190], 0.25);
  table(g, CY.bottom + 164);
  CY.xs.forEach((cx, side) => {
    const l = cx - CY.w / 2, r = cx + CY.w / 2, frozen = side === 1;
    // scale: a brushed metal body, a dark display whose digits glow
    shadow(g, cx, CY.bottom + 166, 230, 22, 0.65);
    const body = g.createLinearGradient(0, CY.bottom + 14, 0, CY.bottom + 164);
    body.addColorStop(0, "#4a515c"); body.addColorStop(0.12, "#363c45"); body.addColorStop(1, "#1d2127");
    g.fillStyle = body; g.beginPath(); g.roundRect(cx - 190, CY.bottom + 14, 380, 150, 22); g.fill();
    g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(cx - 170, CY.bottom + 16, 340, 3);
    g.fillStyle = "#0b0e12"; g.beginPath(); g.roundRect(cx - 130, CY.bottom + 56, 260, 80, 12); g.fill();
    const reading = frozen ? kg : 1;
    const pulse = !frozen ? prog(s, t.water4 - 0.1, 0.4, ease.out) : prog(s, t.less - 0.1, 0.4, ease.out);
    g.save();
    g.fillStyle = pulse > 0 ? accent : "#9fe3c0"; g.shadowColor = g.fillStyle; g.shadowBlur = 14;
    g.font = "700 54px 'JetBrains Mono', monospace"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(`${reading.toFixed(2)} kg`, cx, CY.bottom + 97);
    g.restore();

    // contents: water with a meniscus that curves up at the walls
    if (!frozen || frost < 1) {
      waterBody(g, l, r, CY.bottom, (x) => oneL + 3 * Math.sin(x * 0.03 + s * 2.2 + side) - 9 * ((x - cx) / (CY.w / 2)) ** 6, oneL, s + side,
        frozen ? 1 - frost : 1);
    }
    if (frozen && frost > 0) {
      g.save(); g.globalAlpha *= frost;
      // one block until the cut; then the slice above 1 L lifts up and away to the right, never vanishing
      const lift = cut * 260, slide = cut * cut * 900;
      if (cut <= 0) iceBlock(g, l, top, CY.w, CY.bottom - top, 4, 23);
      else { iceBlock(g, l, oneL, CY.w, CY.bottom - oneL, 4, 23); iceBlock(g, l + slide, top - lift, CY.w, oneL - top, 4, 41); }
      g.restore();
      if (grow > 0) {   // a bracket on the extra 0.09 L
        g.save(); g.strokeStyle = accent; g.lineWidth = 5; g.globalAlpha *= grow * (1 - cut);
        g.beginPath(); g.moveTo(r + 24, oneL); g.lineTo(r + 40, oneL); g.lineTo(r + 40, top); g.lineTo(r + 24, top); g.stroke();
        g.restore();
      }
    }
    // the 1 L line, marked on "litre"
    const ml = prog(s, t.litre - 0.1, 0.4, ease.out);
    if (frozen && ml > 0) {
      g.strokeStyle = accent; g.lineWidth = 5; g.setLineDash([16, 12]);
      g.beginPath(); g.moveTo(l - 20, oneL); g.lineTo(l - 20 + (CY.w + 40) * ml, oneL); g.stroke(); g.setLineDash([]);
    }

    // the cylinder and its marks
    glassWalls(g, l, r, CY.bottom - CY.litre * 1.3, CY.bottom - 14);
    for (let i = 1; i <= 12; i++) {
      const y = CY.bottom - (CY.litre * i) / 10;
      g.strokeStyle = "rgba(255,255,255,0.45)"; g.lineWidth = 3;
      g.beginPath(); g.moveTo(l, y); g.lineTo(l + (i % 5 ? 26 : 50), y); g.stroke();
    }
    g.fillStyle = ink; g.font = "600 36px 'JetBrains Mono', monospace"; g.textAlign = "left";
    if (side === 0) g.fillText("1 L", r + 26, oneL);
  });
}

// ---------- the lake ----------
function lake(g: CanvasRenderingContext2D, s: number, t: T, accent: string) {
  const sy = 860;
  const thick = 90 * prog(s, t.freeze - 0.2, Math.max(1.4, t.end - t.freeze - 0.4), ease.out);
  // a winter sky at dusk, and far hills
  const sky = g.createLinearGradient(0, 0, 0, sy);
  sky.addColorStop(0, "#0a1322"); sky.addColorStop(0.7, "#22354f"); sky.addColorStop(1, "#4a6280");
  g.fillStyle = sky; g.fillRect(-600, -400, W + 1200, sy + 400);
  g.fillStyle = "#1a2638";
  g.beginPath(); g.moveTo(-600, sy - 40);
  for (let x = -600; x <= W + 600; x += 30) g.lineTo(x, sy - 120 - 60 * Math.sin(x * 0.006 + 1) - 30 * Math.sin(x * 0.017));
  g.lineTo(W + 600, sy); g.lineTo(-600, sy); g.closePath(); g.fill();
  // the ground, cut through: banks with snow on top
  const earth = g.createLinearGradient(0, sy - 40, 0, 1500);
  earth.addColorStop(0, "#4a3d30"); earth.addColorStop(1, "#1e1813");
  g.fillStyle = earth;
  g.beginPath(); g.moveTo(-600, sy - 40); g.lineTo(120, sy - 40); g.bezierCurveTo(260, 1400, 820, 1400, 960, sy - 40);
  g.lineTo(W + 600, sy - 40); g.lineTo(W + 600, H + 400); g.lineTo(-600, H + 400); g.closePath(); g.fill();
  g.fillStyle = "#e8eef5";
  for (const [a, b] of [[-600, 128], [952, W + 600]]) { g.beginPath(); g.roundRect(a, sy - 52, b - a, 18, 9); g.fill(); }
  // the water: lit from above, dark below, with soft shafts of light that the ice dims as it thickens
  g.save();
  g.beginPath(); g.moveTo(132, sy); g.bezierCurveTo(270, 1360, 810, 1360, 948, sy); g.closePath();
  const deep = g.createLinearGradient(0, sy, 0, 1340);
  deep.addColorStop(0, "#3a86d0"); deep.addColorStop(1, "#0c2a55");
  g.fillStyle = deep; g.fill(); g.clip();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 5; i++) {
    const x0 = 230 + i * 160 + 20 * Math.sin(s * 0.7 + i);
    const ray = g.createLinearGradient(0, sy, 0, sy + 420);
    ray.addColorStop(0, `rgba(150,200,255,${0.16 * (1 - thick / 140)})`); ray.addColorStop(1, "rgba(150,200,255,0)");
    g.fillStyle = ray; g.beginPath(); g.moveTo(x0, sy); g.lineTo(x0 + 50, sy); g.lineTo(x0 + 110, sy + 420); g.lineTo(x0 + 30, sy + 420); g.closePath(); g.fill();
  }
  g.globalCompositeOperation = "source-over";
  for (let i = 0; i < 14; i++) ball(g, 300 + 480 * rnd(i * 5.1), 1270 + 60 * rnd(i * 2.9) - 30, 8 + 10 * rnd(i * 4.3), [96, 88, 80]);   // pebbles
  g.restore();
  // a fish, swimming back and forth under the ice
  const fx = 540 + 250 * Math.sin(s * 0.9), dir = Math.cos(s * 0.9) >= 0 ? 1 : -1, fy = 1080 + 14 * Math.sin(s * 2.1);
  const wag = 4 * Math.sin(s * 8);
  g.fillStyle = "#d9823c";
  g.beginPath(); g.moveTo(fx - dir * 40, fy); g.lineTo(fx - dir * 80, fy - 26 + wag); g.lineTo(fx - dir * 80, fy + 26 + wag); g.closePath(); g.fill();
  const fb = g.createLinearGradient(fx, fy - 24, fx, fy + 24);
  fb.addColorStop(0, "#ffc27a"); fb.addColorStop(0.6, "#f0963f"); fb.addColorStop(1, "#b9622a");
  g.fillStyle = fb; g.beginPath(); g.ellipse(fx, fy, 50, 23, 0, 0, 7); g.fill();
  g.fillStyle = "#c46f2e"; g.beginPath(); g.moveTo(fx - dir * 6, fy - 20); g.lineTo(fx - dir * 24, fy - 38); g.lineTo(fx - dir * 30, fy - 18); g.closePath(); g.fill();
  g.fillStyle = "#0b0e12"; g.beginPath(); g.arc(fx + dir * 28, fy - 5, 5.5, 0, 7); g.fill();
  g.fillStyle = "#ffffff"; g.beginPath(); g.arc(fx + dir * 29.5, fy - 6.5, 1.8, 0, 7); g.fill();
  // snow falling on the lake
  for (let i = 0; i < 70; i++) {
    const x = ((rnd(i) * (W + 400) + 40 * Math.sin(s * 0.8 + i)) % (W + 400)) - 200;
    const y = ((rnd(i * 1.9) * 1100 + s * (40 + 50 * rnd(i * 3.7))) % 1100) - 250;
    if (y < sy - 50) { g.fillStyle = `rgba(255,255,255,${0.5 + 0.4 * rnd(i * 2.1)})`; g.beginPath(); g.arc(x, y, 2 + 3 * rnd(i * 4.4), 0, 7); g.fill(); }
  }
  // the ice, growing down from the surface
  if (thick > 0.5) {
    iceBlock(g, 126, sy - 6, 828, thick + 6, 3, 57);
    g.save(); g.strokeStyle = accent; g.lineWidth = 5;
    g.globalAlpha *= prog(s, t.top - 0.1, 0.4, ease.out);
    g.beginPath(); g.moveTo(1000, sy - 6); g.lineTo(1000, sy + thick); g.lineTo(988, sy + thick - 16); g.moveTo(1000, sy + thick); g.lineTo(1012, sy + thick - 16); g.stroke();
    g.restore();
  } else {
    g.strokeStyle = "rgba(170,215,255,0.9)"; g.lineWidth = 3;
    g.beginPath(); for (let x = 132; x <= 948; x += 8) (x === 132 ? g.moveTo(x, sy + 2 * Math.sin(x * 0.02 + s * 2)) : g.lineTo(x, sy + 2 * Math.sin(x * 0.02 + s * 2))); g.stroke();
  }
}

// ---------- the reel ----------
function layer(g: CanvasRenderingContext2D, alpha: number, zoom: number, at: [number, number], draw: () => void) {
  if (alpha <= 0.001) return;
  g.save();
  g.globalAlpha = alpha;
  g.setTransform(zoom, 0, 0, zoom, W / 2 - at[0] * zoom, H / 2 - at[1] * zoom);
  draw();
  g.restore();
}

function paint(g: CanvasRenderingContext2D, s: number, t: T, L: ReturnType<typeof lattice>, bg: string, ink: string, accent: string) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const out1 = prog(s, t.as - 0.1, 0.8, ease.inOut);
  const in2 = prog(s, t.as + 0.1, 0.8, ease.inOut), out2 = prog(s, t.same - 0.45, 0.7, ease.inOut);
  const in3 = prog(s, t.same - 0.3, 0.7, ease.inOut), out3 = prog(s, t.thats - 0.35, 0.7, ease.inOut);
  const in4 = prog(s, t.thats - 0.2, 0.7, ease.inOut);

  layer(g, 1 - out1, spline(s, [[0, 1.42], [t.water1, 1.46], [t.as + 0.7, 3.0]]), [spline(s, [[0, 540], [t.water1, 545], [t.as + 0.7, CUBE.x]]), spline(s, [[0, 990], [t.water1, 985], [t.as + 0.7, 840]])], () => glass(g, s, t, accent));
  layer(g, in2 * (1 - out2), spline(s, [[t.as, 0.62], [t.locks, 0.95], [t.space, 1.08], [t.same, 1.14], [t.same + 0.5, 0.8]]), HC,
    () => molecules(g, s, t, L, accent));
  layer(g, in3 * (1 - out3), spline(s, [[t.same - 0.4, 1.38], [t.room, 1.3], [t.thats, 1.27], [t.thats + 0.6, 1.18]]), [540, 1010],
    () => cylinders(g, s, t, ink, accent));
  layer(g, in4, spline(s, [[t.thats - 0.3, 1.4], [t.lakes + 0.5, 1.3], [t.end, 1.27]]), [540, 1020], () => lake(g, s, t, accent));

  // a vignette, so the eye stays in the middle
  const v = g.createRadialGradient(W / 2, H / 2, 520, W / 2, H / 2, 1250);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.5)");
  g.fillStyle = v; g.fillRect(0, 0, W, H);
}

export const IceWorld: React.FC = () => {
  const { tl, theme } = useReel();
  const t = useTimes();
  const L = useMemo(lattice, []);
  const ref = useRef<HTMLCanvasElement>(null);
  const f = useCurrentFrame();
  useLayoutEffect(() => {
    const g = ref.current?.getContext("2d");
    if (g) paint(g, f / tl.fps, t, L, theme.grounds.dark.bg, theme.grounds.dark.ink, theme.marker.color);
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: "absolute", inset: 0, width: W, height: H }} />;
};
