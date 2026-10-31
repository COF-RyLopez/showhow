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

  // the stone, then the cube, then the water over them, so what is under water takes its tint
  const sy = level + sd;   // bottom of the stone
  g.fillStyle = "#8b8378";
  g.beginPath(); g.roundRect(STONE.x - STONE.w / 2, sy - STONE.h, STONE.w, STONE.h, 26); g.fill();
  g.fillStyle = "#a59c90";
  g.beginPath(); g.roundRect(STONE.x - STONE.w / 2 + 12, sy - STONE.h + 10, STONE.w * 0.45, STONE.h * 0.3, 12); g.fill();

  const cb = level + cd, ct = cb - CUBE.s, cl = CUBE.x - CUBE.s / 2;
  g.fillStyle = "rgba(226,242,255,0.92)";
  g.beginPath(); g.roundRect(cl, ct, CUBE.s, CUBE.s, 14); g.fill();
  g.fillStyle = "rgba(255,255,255,0.55)";
  g.beginPath(); g.roundRect(cl + 16, ct + 14, CUBE.s * 0.5, 16, 8); g.fill();
  // "tenths": nine rules across the cube, lit from the bottom up; the ninth sits just under the water line
  for (let i = 1; i <= 9; i++) {
    const k = prog(s, t.tenths + (i - 1) * 0.055, 0.25, ease.out);
    if (k <= 0) continue;
    const y = cb - (CUBE.s * i) / 10;
    g.strokeStyle = accent; g.globalAlpha *= k; g.lineWidth = 4;
    g.beginPath(); g.moveTo(cl + 10, y); g.lineTo(cl + 10 + (CUBE.s - 20) * k, y); g.stroke();
    g.globalAlpha /= k;
  }

  g.fillStyle = "rgba(60,130,215,0.55)";
  g.beginPath(); g.moveTo(GL.l, GL.bottom);
  for (let x = GL.l; x <= GL.r; x += 8) g.lineTo(x, surf(x));
  g.lineTo(GL.r, GL.bottom); g.closePath(); g.fill();
  g.strokeStyle = "rgba(170,215,255,0.9)"; g.lineWidth = 3;
  g.beginPath(); for (let x = GL.l; x <= GL.r; x += 8) (x === GL.l ? g.moveTo(x, surf(x)) : g.lineTo(x, surf(x))); g.stroke();

  // the glass
  g.strokeStyle = "rgba(255,255,255,0.7)"; g.lineWidth = 8; g.lineJoin = "round";
  g.beginPath(); g.moveTo(GL.l - 4, GL.top); g.lineTo(GL.l - 4, GL.bottom + 4); g.lineTo(GL.r + 4, GL.bottom + 4); g.lineTo(GL.r + 4, GL.top); g.stroke();
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

function molecule(g: CanvasRenderingContext2D, x: number, y: number, th: number, k: number) {
  for (const d of [-0.91, 0.91]) {   // H–O–H is 104.5°
    g.fillStyle = "#eef1f4";
    g.beginPath(); g.arc(x + Math.cos(th + d) * 0.36 * B * k, y + Math.sin(th + d) * 0.36 * B * k, 0.14 * B * k, 0, 7); g.fill();
  }
  g.fillStyle = "#e5594a";
  g.beginPath(); g.arc(x, y, 0.24 * B * k, 0, 7); g.fill();
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

  // the layer behind
  g.globalAlpha *= 0.32;
  L.mols.forEach((_, i) => { const p = pos(i, 1); molecule(g, p.x + BACK[0], p.y + BACK[1], p.th + 0.5, 0.72); });
  g.globalAlpha /= 0.32;

  // hydrogen bonds once frozen
  const bonds = prog(s, t.locks - 0.1, 0.6, ease.out);
  if (bonds > 0) {
    g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 3; g.setLineDash([10, 10]);
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

  CY.xs.forEach((cx, side) => {
    const l = cx - CY.w / 2, r = cx + CY.w / 2, frozen = side === 1;
    // scale
    g.fillStyle = "#2b3038"; g.beginPath(); g.roundRect(cx - 190, CY.bottom + 14, 380, 150, 22); g.fill();
    g.fillStyle = "#11151a"; g.beginPath(); g.roundRect(cx - 130, CY.bottom + 56, 260, 80, 12); g.fill();
    const reading = frozen ? kg : 1;
    const pulse = !frozen ? prog(s, t.water4 - 0.1, 0.4, ease.out) : prog(s, t.less - 0.1, 0.4, ease.out);
    g.fillStyle = pulse > 0 ? accent : ink;
    g.font = "700 54px 'JetBrains Mono', monospace"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(`${reading.toFixed(2)} kg`, cx, CY.bottom + 97);

    // contents
    if (!frozen || frost < 1) {
      g.fillStyle = "rgba(60,130,215,0.75)";
      g.globalAlpha *= frozen ? 1 - frost : 1;
      g.beginPath(); g.moveTo(l, CY.bottom);
      for (let x = l; x <= r; x += 10) g.lineTo(x, oneL + 3 * Math.sin(x * 0.03 + s * 2.2 + side));
      g.lineTo(r, CY.bottom); g.closePath(); g.fill();
      g.globalAlpha /= frozen ? 1 - frost : 1;
    }
    if (frozen && frost > 0) {
      g.globalAlpha *= frost;
      g.fillStyle = "rgba(226,242,255,0.9)";
      g.fillRect(l, oneL, CY.w, CY.bottom - oneL);
      // the slice above 1 L: lifted up and away to the right, never vanishing
      const lift = cut * 260, slide = cut * cut * 900;
      g.fillRect(l + slide, top - lift, CY.w, oneL - top);
      g.globalAlpha /= frost;
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
    g.strokeStyle = "rgba(255,255,255,0.7)"; g.lineWidth = 7;
    g.beginPath(); g.moveTo(l - 4, CY.bottom - CY.litre * 1.3); g.lineTo(l - 4, CY.bottom + 4); g.lineTo(r + 4, CY.bottom + 4); g.lineTo(r + 4, CY.bottom - CY.litre * 1.3); g.stroke();
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
  // banks and the lake bed
  g.fillStyle = "#3a3229";
  g.beginPath(); g.moveTo(0, sy - 40); g.lineTo(120, sy - 40); g.bezierCurveTo(260, 1400, 820, 1400, 960, sy - 40);
  g.lineTo(W, sy - 40); g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
  // the water
  g.fillStyle = "rgba(40,105,190,0.85)";
  g.beginPath(); g.moveTo(132, sy); g.bezierCurveTo(270, 1360, 810, 1360, 948, sy); g.closePath(); g.fill();
  // a fish, swimming back and forth under the ice
  const fx = 540 + 250 * Math.sin(s * 0.9), dir = Math.cos(s * 0.9) >= 0 ? 1 : -1, fy = 1080 + 14 * Math.sin(s * 2.1);
  g.fillStyle = "#f2a65a";
  g.beginPath(); g.ellipse(fx, fy, 48, 22, 0, 0, 7); g.fill();
  g.beginPath(); g.moveTo(fx - dir * 40, fy); g.lineTo(fx - dir * 78, fy - 24 + 4 * Math.sin(s * 8)); g.lineTo(fx - dir * 78, fy + 24 + 4 * Math.sin(s * 8)); g.closePath(); g.fill();
  g.fillStyle = "#11151a"; g.beginPath(); g.arc(fx + dir * 26, fy - 5, 5, 0, 7); g.fill();
  // the ice, growing down from the surface
  if (thick > 0.5) {
    g.fillStyle = "rgba(226,242,255,0.95)";
    g.fillRect(126, sy - 6, 828, thick + 6);
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
