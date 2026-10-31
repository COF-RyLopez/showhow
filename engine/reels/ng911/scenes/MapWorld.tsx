// The NG9-1-1 reel's one world: a county map drawn on a 2D canvas as one function of the reel's time. All four scenes
// draw it, so every scene change is one continuous picture. The map can tilt into a stack of see-through sheets, one
// per GIS layer, the way the NENA data model keeps them (NENA-STA-006.3).
//   hook   a pin drops where the call comes from; a route runs to the call center (PSAP) whose boundary holds it
//   where  address points pop on, road centerlines draw on; one block of Oak St lights up with its address ranges,
//          FromAddr_L/ToAddr_L 101–199 (Parity_L odd) on the left and 100–198 (even) on the right
//   who    the PSAP polygons fill; the map tilts and police, fire and EMS sheets rise; each lights the district
//          that holds the pin
//   join   the road's NGUID types out; the sheets settle back onto one plane in WGS 84; a second county slides up
//          and joins along their shared edge
import React, { useLayoutEffect, useMemo, useRef } from "react";
import { useCurrentFrame } from "remotion";
import { ease, prog, spline, useReel } from "../../../src/engine";

const W = 1080, H = 1920;
type P = [number, number];
type T = Record<"dial" | "next" | "map" | "answers" | "built" | "points" | "centerlines" | "road" | "numbers" | "left" | "right"
  | "boundaries" | "answers2" | "police" | "fire" | "medical" | "comes" | "id" | "layer" | "coordinates" | "counties" | "map2" | "end", number>;

function useTimes(): T {
  const { tl } = useReel();
  return useMemo(() => {
    const c = (w: string, n = 1) => tl.cue(w, n) / tl.fps;
    return {
      dial: c("dial"), next: c("next"), map: c("map"), answers: c("answers"), built: c("built"), points: c("points"), centerlines: c("centerlines"),
      road: c("road", 2), numbers: c("numbers"), left: c("left"), right: c("right"), boundaries: c("boundaries"), answers2: c("answers", 2),
      police: c("police"), fire: c("fire"), medical: c("medical"), comes: c("comes"), id: c("id"), layer: c("layer"),
      coordinates: c("coordinates"), counties: c("counties"), map2: c("map", 3), end: tl.frames / tl.fps,
    };
  }, [tl]);
}

// ---------- the county ----------
const COUNTY: P[] = [[-420, -400], [380, -420], [420, -60], [400, 410], [-380, 420], [-430, 40]];
const SOUTH: P[] = [[400, 410], [-380, 420]];                                   // the edge the next county joins along
const COUNTY_B: P[] = [[400, 410], [-380, 420], [-410, 820], [-360, 1180], [430, 1160], [440, 760]];
const XS = [-260, -20, 220], YS = [-230, 40, 300];                              // the street grid, map px
const XS_B = [-200, 60, 300], YS_B = [600, 860];
const PIN: P = [100, 14];                                                       // 151 Oak St: north side of the y = 40 road
const OAK: [P, P] = [[-20, 40], [220, 40]];                                     // the block of Oak St the reel looks at
const PSAP_E: P = [270, -320], PSAP_W: P = [-270, -300];
// the explainer-diagram look from claude-video-2: a white dot grid, navy ink, one blue accent, cards with hairline borders
const C = { land: "#F4F6FA", block: "#FFFFFF", line: "#E3E6ED", road: "#E4E7EE", cl: "#14213D", pt: "#5B6478", ink: "#14213D", grey: "#5B6478", accent: "#2B7EF9", psap: [43, 126, 249], police: [72, 92, 170], fire: [217, 119, 87], ems: [59, 166, 118] } as const;

const poly = (g: CanvasRenderingContext2D, pts: P[]) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
const rgba = (c: readonly number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** address points: every 64 px along each side of each grid street, clear of the crossings */
function addressPoints(xs: number[], ys: number[], lo: number, hi: number, dv = 0): P[] {
  const out: P[] = [];
  for (const y of ys) for (let x = -390; x <= 390; x += 64) if (xs.every((v) => Math.abs(v - x) > 44)) out.push([x, y - 26 + dv], [x, y + 26 + dv]);
  for (const x of xs) for (let y = lo; y <= hi; y += 64) if (ys.every((v) => Math.abs(v - y) > 44)) out.push([x - 26, y + dv], [x + 26, y + dv]);
  return out;
}

// districts, each a rectangle-ish shape clipped to the county; the second list says which holds the pin
const PSAPS: P[][] = [[[-600, -600], [40, -600], [80, -100], [30, 600], [-600, 600]], [[40, -600], [600, -600], [600, 600], [30, 600], [80, -100]]];
const POLICE: P[][] = [[[-600, -600], [-150, -600], [-130, 600], [-600, 600]], [[-150, -600], [160, -600], [140, 600], [-130, 600]], [[160, -600], [600, -600], [600, 600], [140, 600]]];
const FIRE: P[][] = [[[-600, -600], [600, -600], [600, -130], [-600, -110]], [[-600, -110], [600, -130], [600, 190], [-600, 170]], [[-600, 170], [600, 190], [600, 600], [-600, 600]]];
const EMS: P[][] = [[[-600, -600], [600, -600], [-600, 600]], [[600, -600], [600, 600], [-600, 600]]];

// ---------- the camera: zoom and pan, plus a tilt that lays the map back so its sheets can stack ----------
type Cam = { z: number; cx: number; cy: number; tilt: number; lift: number };
const GAP = 200;   // screen px between stacked sheets

function view(g: CanvasRenderingContext2D, c: Cam, sheet: number, dv = 0) {
  const th = -0.62 * c.tilt, sy = 1 - 0.46 * c.tilt;
  const a = c.z * Math.cos(th), b = c.z * sy * Math.sin(th), cc = -c.z * Math.sin(th), d = c.z * sy * Math.cos(th);
  const lift = c.lift * GAP * (sheet - 1.5);   // the stack stays centred on the screen
  g.setTransform(a, b, cc, d, W / 2 - (a * c.cx + cc * (c.cy - dv)), H / 2 - (b * c.cx + d * (c.cy - dv)) - lift);
}

function shade(g: CanvasRenderingContext2D, regions: P[][], col: readonly number[], a: number, hot: number, lit: number) {
  g.save(); poly(g, COUNTY); g.clip();
  regions.forEach((r, i) => {
    const on = i === hot ? lit : 0;
    poly(g, r); g.fillStyle = rgba(col, a * (0.22 + 0.4 * on)); g.fill();
    g.strokeStyle = rgba(col, a * (0.75 + 0.25 * on)); g.lineWidth = 5 + 4 * on; g.stroke();
  });
  g.restore();
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, col: string, a: number, size = 44) {
  if (a <= 0) return;
  g.save(); g.globalAlpha *= a; g.fillStyle = col; g.font = `800 ${size}px Inter, sans-serif`; g.textAlign = "left"; g.textBaseline = "top";
  g.fillText(text, x, y); g.restore();
}

function streets(g: CanvasRenderingContext2D, xs: number[], ys: number[], lo: number, hi: number, draw: number, dv = 0) {
  g.lineCap = "round";
  const lines: [P, P][] = [...ys.map((y): [P, P] => [[-430, y + dv], [430, y + dv]]), ...xs.map((x): [P, P] => [[x, lo + dv], [x, hi + dv]])];
  // the basemap street, then the centerline drawing on over it
  for (const [p, q] of lines) { g.strokeStyle = C.road; g.lineWidth = 30; g.beginPath(); g.moveTo(...p); g.lineTo(...q); g.stroke(); }
  if (draw > 0) {
    g.strokeStyle = C.cl; g.lineWidth = 5;
    lines.forEach(([p, q], i) => {
      const k = Math.max(0, Math.min(1, draw * (lines.length + 2) - i));
      if (k > 0) { g.beginPath(); g.moveTo(...p); g.lineTo(p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k); g.stroke(); }
    });
  }
}

function county(g: CanvasRenderingContext2D, s: number, t: T, pts: P[], dv: number, b: boolean) {
  const shape = b ? COUNTY_B.map(([x, y]): P => [x, y + dv]) : COUNTY;
  // a soft shadow under the card
  g.save(); g.fillStyle = "rgba(20,33,61,0.06)"; g.translate(0, 22); poly(g, shape); g.fill(); g.translate(0, -12); poly(g, shape); g.fill(); g.restore();
  g.save(); poly(g, shape);
  g.fillStyle = C.land; g.fill(); g.clip();
  // blocks between the streets
  const xs = b ? XS_B : XS, ys = b ? YS_B : YS, lo = b ? 420 : -430, hi = b ? 1190 : 430;
  const ex = [-460, ...xs, 460], ey = [lo, ...ys, hi];
  g.fillStyle = C.block;
  for (let i = 0; i < ex.length - 1; i++) for (let j = 0; j < ey.length - 1; j++)
    { g.beginPath(); g.roundRect(ex[i] + 22, ey[j] + 22 + dv, ex[i + 1] - ex[i] - 44, ey[j + 1] - ey[j] - 44, 14); g.fill(); g.strokeStyle = C.line; g.lineWidth = 2; g.stroke(); }
  if (!b) {   // a highway across the county
    g.strokeStyle = C.road; g.lineWidth = 40; g.beginPath(); g.moveTo(-450, -150); g.bezierCurveTo(-150, -60, 150, 260, 450, 170); g.stroke();
  }
  const draw = b ? 1 : prog(s, t.centerlines - 0.15, 1.1, ease.inOut);
  streets(g, xs, ys, lo, hi, draw, dv);
  if (!b && draw > 0) {
    g.strokeStyle = C.cl; g.lineWidth = 6; g.setLineDash([]);
    const k = Math.min(1, draw * 1.3);
    g.beginPath(); g.moveTo(-450, -150); g.bezierCurveTo(-150, -60, 150, 260, 450, 170);
    g.globalAlpha *= k; g.stroke(); g.globalAlpha /= k;
  }
  // address points, popping on in order
  pts.forEach(([x, y], i) => {
    const k = b ? 1 : prog(s, t.points - 0.1 + (i / pts.length) * 0.9, 0.25, ease.out);
    if (k <= 0) return;
    g.fillStyle = C.pt; g.beginPath(); g.arc(x, y, 7 * k, 0, 7); g.fill();
  });
  g.restore();
  g.strokeStyle = "#CDD2DC"; g.lineWidth = 3; poly(g, shape); g.stroke();
}

function routeIcon(g: CanvasRenderingContext2D, [x, y]: P, on: number) {
  const ink = on > 0.5 ? "#ffffff" : C.ink;
  g.fillStyle = on > 0.5 ? C.accent : "#ffffff"; g.beginPath(); g.arc(x, y, 38, 0, 7); g.fill();
  g.strokeStyle = on > 0.5 ? C.accent : "#CDD2DC"; g.lineWidth = 3; g.stroke();
  g.strokeStyle = ink; g.lineWidth = 6; g.lineCap = "round";   // a headset
  g.beginPath(); g.arc(x, y + 2, 18, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
  g.fillStyle = ink; g.beginPath(); g.roundRect(x - 22, y - 2, 9, 16, 4); g.roundRect(x + 13, y - 2, 9, 16, 4); g.fill();
}

function paint(g: CanvasRenderingContext2D, s: number, t: T, ptsA: P[], ptsB: P[], bg: string, accent: string) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = "rgb(226,226,232)"; g.beginPath();   // the dot grid, 38 px
  for (let y = 19; y < H; y += 38) for (let x = 19; x < W; x += 38) { g.moveTo(x + 2.4, y); g.arc(x, y, 2.4, 0, 7); }
  g.fill();

  const cam: Cam = {
    z: spline(s, [[0, 1.0], [t.built + 0.5, 1.24], [t.road - 1.1, 1.16], [t.road + 0.3, 1.8], [t.right + 0.4, 1.82], [t.boundaries + 0.2, 1.1], [t.police - 0.2, 1.05], [t.fire + 0.4, 0.8], [t.layer, 0.8], [t.coordinates - 0.1, 0.92], [t.counties - 0.5, 0.92], [t.map2 + 0.3, 1.04], [t.end, 1.06]]),
    cx: spline(s, [[0, 0], [t.road - 1.1, 0], [t.road + 0.3, 100], [t.right + 0.4, 100], [t.boundaries + 0.2, 0], [t.end, 0]]),
    cy: spline(s, [[0, 60], [t.built + 0.5, -20], [t.road - 1.1, 0], [t.road + 0.3, 40], [t.right + 0.4, 40], [t.boundaries + 0.2, 0], [t.counties - 0.5, 0], [t.map2 + 0.3, 385], [t.end, 390]]),
    tilt: spline(s, [[0, 0], [t.police - 1.6, 0], [t.police - 0.6, 0], [t.fire + 0.3, 1], [t.layer, 1], [t.coordinates, 0], [t.coordinates + 1, 0], [t.end, 0]]),
    lift: spline(s, [[0, 0], [t.police - 1.4, 0], [t.police - 0.4, 0], [t.fire + 0.5, 1], [t.layer, 1], [t.coordinates, 0], [t.coordinates + 1, 0], [t.end, 0]]),
  };

  // the next county, waiting below until "counties", then sliding up to join
  const slide = 1 - prog(s, t.counties - 0.3, Math.max(1.0, t.map2 - t.counties + 0.2), ease.inOut);
  const dv = slide * 1300;
  view(g, cam, 0);
  if (s > t.counties - 0.6) county(g, s, t, ptsB, dv, true);

  // the base sheet: roads, address points, the PSAP polygons
  county(g, s, t, ptsA, 0, false);
  const psap = prog(s, t.boundaries - 0.2, 0.6, ease.out) * (1 - 0.6 * prog(s, t.police - 0.3, 0.6, ease.inOut));
  if (psap > 0) shade(g, PSAPS, C.psap, psap, 1, prog(s, t.answers2 - 0.2, 0.5, ease.out));
  label(g, "PSAP", -400, -380, rgba(C.psap, 1), psap * (1 - prog(s, t.police - 0.3, 0.5, ease.inOut)));

  // Oak St: the block lights up, with the direction it was drawn in, and its ranges left and right
  const oak = prog(s, t.road - 0.1, 0.5, ease.out) * (1 - prog(s, t.boundaries - 0.4, 0.5, ease.inOut)) + prog(s, t.id - 0.3, 0.5, ease.out) * (1 - prog(s, t.coordinates - 0.4, 0.6, ease.inOut));
  if (oak > 0) {
    g.save(); g.globalAlpha *= oak;
    g.strokeStyle = accent; g.lineWidth = 14; g.lineCap = "round";
    g.beginPath(); g.moveTo(...OAK[0]); g.lineTo(...OAK[1]); g.stroke();
    g.fillStyle = accent; g.beginPath(); g.moveTo(232, 40); g.lineTo(204, 24); g.lineTo(204, 56); g.closePath(); g.fill();
    g.restore();
  }
  const range = (txt: string, y: number, k: number) => {
    if (k <= 0) return;
    g.save(); g.globalAlpha *= k * (1 - prog(s, t.boundaries - 0.4, 0.5, ease.inOut));
    g.fillStyle = "#ffffff"; g.strokeStyle = C.line; g.lineWidth = 3;
    g.beginPath(); g.roundRect(-60, y, 320, 48, 10); g.fill(); g.stroke();
    g.fillStyle = C.ink; g.font = "700 26px 'JetBrains Mono', monospace"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(txt, 100, y + 25); g.restore();
  };
  range("L 101–199 odd", -112, prog(s, t.left - 0.15, 0.4, ease.out));
  range("R 100–198 even", 82, prog(s, t.right - 0.15, 0.4, ease.out));

  // the route from the pin to the call center that answers
  const route = prog(s, t.answers - 0.3, 0.8, ease.inOut) * (1 - prog(s, t.points - 0.4, 0.6, ease.inOut));
  if (route > 0) {
    g.save(); g.globalAlpha *= Math.min(1, route * 3);
    g.strokeStyle = rgba(C.psap, 1); g.lineWidth = 8; g.setLineDash([22, 14]); g.lineDashOffset = -s * 60;
    g.beginPath(); g.moveTo(...PIN); g.lineTo(PIN[0] + (PSAP_E[0] - PIN[0]) * route, PIN[1] + (PSAP_E[1] - PIN[1]) * route); g.stroke();
    g.restore();
  }
  const icons = 1 - prog(s, t.police - 0.4, 0.5, ease.inOut);
  if (icons > 0) {
    g.save(); g.globalAlpha *= icons * prog(s, t.map - 0.3, 0.5, ease.out);
    routeIcon(g, PSAP_W, 0); routeIcon(g, PSAP_E, prog(s, t.answers + 0.3, 0.3, ease.out));
    g.restore();
  }

  // the responder sheets, rising one by one; each lights the district that holds the pin
  const pinOn: P[] = [];
  const sheets: [P[][], readonly number[], number, string, number][] = [[POLICE, C.police, t.police, "POLICE", 1], [FIRE, C.fire, t.fire, "FIRE", 1], [EMS, C.ems, t.medical, "EMS", 1]];
  view(g, cam, 0); { const m = g.getTransform().transformPoint(new DOMPoint(...PIN)); pinOn.push([m.x, m.y]); }
  sheets.forEach(([regions, col, at, name, hot], i) => {
    const a = prog(s, at - 0.15, 0.5, ease.out) * (1 - 0.6 * prog(s, t.coordinates - 0.6, 0.8, ease.inOut)) * (1 - prog(s, t.counties - 0.3, 0.9, ease.inOut));
    if (a <= 0) return;
    view(g, cam, i + 1);
    g.save(); g.globalAlpha *= a;
    poly(g, COUNTY); g.fillStyle = "rgba(255,255,255,0.82)"; g.fill(); g.strokeStyle = "#CDD2DC"; g.lineWidth = 3; g.stroke();
    shade(g, regions, col, 1, hot, prog(s, t.comes - 0.25 + i * 0.12, 0.4, ease.out));
    label(g, name, -400, -380, rgba(col, 1), 1 - prog(s, t.layer, 0.8, ease.inOut), 52);
    g.restore();
    const m = g.getTransform().transformPoint(new DOMPoint(...PIN));
    pinOn.push([m.x, m.y]);
  });

  // the coordinate grid all the layers share
  const grid = prog(s, t.coordinates - 0.3, 0.6, ease.out) * (1 - prog(s, t.counties, 0.8, ease.inOut));
  view(g, cam, 0);
  if (grid > 0) {
    g.save(); g.globalAlpha *= grid; g.strokeStyle = "rgba(43,126,249,0.3)"; g.lineWidth = 2;
    for (let v = -480; v <= 480; v += 160) { g.beginPath(); g.moveTo(v, -480); g.lineTo(v, 480); g.moveTo(-480, v); g.lineTo(480, v); g.stroke(); }
    g.restore();
  }
  // the shared edge glows as the counties meet
  const seam = prog(s, t.map2 - 0.25, 0.4, ease.out) * (1 - 0.6 * prog(s, t.map2 + 0.6, 0.6, ease.inOut));
  if (seam > 0) { g.save(); g.globalAlpha *= seam; g.strokeStyle = accent; g.lineWidth = 12; g.lineCap = "round"; g.beginPath(); g.moveTo(...SOUTH[0]); g.lineTo(...SOUTH[1]); g.stroke(); g.restore(); }

  // ---- screen space: the pin, the line through the sheets, the NGUID, the CRS ----
  g.setTransform(1, 0, 0, 1, 0, 0);
  const base = { x: pinOn[0][0], y: pinOn[0][1] };
  if (pinOn.length > 1 && cam.lift > 0.04) {
    const top = pinOn[pinOn.length - 1];
    g.strokeStyle = "rgba(20,33,61,0.55)"; g.lineWidth = 3; g.setLineDash([8, 8]);
    g.beginPath(); g.moveTo(base.x, base.y); g.lineTo(top[0], top[1]); g.stroke(); g.setLineDash([]);
    pinOn.slice(1).forEach(([x, y]) => { g.fillStyle = C.ink; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); });
  }
  // the pin: falls in on "dial", then keeps a slow ripple
  const land = t.dial + 0.35, fall = 0.42;
  const py = s < land ? base.y - (base.y + 120) * ((land - s) / fall) ** 2 : base.y;
  if (s > land - fall) {
    for (let k = 0; k < 2; k++) {
      const r = ((s - land + k * 0.7) % 1.4) / 1.4;
      if (s > land) { g.strokeStyle = `rgba(43,126,249,${0.6 * (1 - r)})`; g.lineWidth = 4; g.beginPath(); g.arc(base.x, base.y, 16 + 60 * r, 0, 7); g.stroke(); }
    }
    g.fillStyle = C.ink;
    g.beginPath(); g.arc(base.x, py - 52, 26, Math.PI * 0.8, Math.PI * 2.2); g.lineTo(base.x, py); g.closePath(); g.fill();
    g.fillStyle = "#ffffff"; g.beginPath(); g.arc(base.x, py - 54, 10, 0, 7); g.fill();
  }

  // the NGUID of the Oak St block, typed out, tied to the road it names
  const idA = prog(s, t.id - 0.5, 0.4, ease.out) * (1 - prog(s, t.counties - 0.6, 0.5, ease.inOut));
  if (idA > 0) {
    view(g, cam, 0);
    const o = g.getTransform().transformPoint(new DOMPoint(100, 40));
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.save(); g.globalAlpha *= idA;
    g.strokeStyle = accent; g.lineWidth = 3; g.beginPath(); g.moveTo(540, 470); g.lineTo(o.x, o.y); g.stroke();
    g.fillStyle = C.ink; g.beginPath(); g.roundRect(70, 200, 940, 270, 22); g.fill(); g.stroke();
    g.fillStyle = "#8A93A8"; g.font = "700 34px Inter, sans-serif"; g.textAlign = "left"; g.textBaseline = "top";
    g.fillText("NGUID · road centerline", 110, 228);
    const lines: [string, string][] = [["urn:emergency:uid:gis:", "#ffffff"], ["RCL:1047:", "#8FB8FF"], ["examplecounty.gov", "#C9CED9"]];
    const total = lines.reduce((n, [l]) => n + l.length, 0);
    let left = Math.floor(total * prog(s, t.id - 0.4, 1.3, (x) => x));
    g.font = "700 44px 'JetBrains Mono', monospace";
    lines.forEach(([l, col], i) => { g.fillStyle = col; g.fillText(l.slice(0, Math.max(0, left)), 110, 286 + i * 58); left -= l.length; });
    g.restore();
  }
  // the title, on "Next generation"
  const title = prog(s, t.next - 0.2, 0.6, ease.out) * (1 - prog(s, t.points - 0.5, 0.5, ease.inOut));
  if (title > 0) {
    g.save(); g.globalAlpha *= title; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = C.ink; g.font = "800 64px Inter, sans-serif"; g.fillText("NG9-1-1 GIS Data Model", 540, 250 - 20 * (1 - title));
    g.fillStyle = C.grey; g.font = "700 40px 'JetBrains Mono', monospace"; g.fillText("NENA-STA-006.3", 540, 330 - 20 * (1 - title));
    g.restore();
  }
  const crs = prog(s, t.coordinates - 0.2, 0.5, ease.out) * (1 - prog(s, t.counties, 0.6, ease.inOut));
  if (crs > 0) {
    g.save(); g.globalAlpha *= crs; g.fillStyle = "#ffffff"; g.strokeStyle = C.line; g.lineWidth = 3; g.beginPath(); g.roundRect(250, 1640, 580, 84, 18); g.fill(); g.stroke();
    g.fillStyle = C.ink; g.font = "700 40px 'JetBrains Mono', monospace"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("WGS 84 · EPSG:4326", 540, 1683); g.restore();
  }

}

export const MapWorld: React.FC = () => {
  const { tl } = useReel();
  const t = useTimes();
  const ptsA = useMemo(() => addressPoints(XS, YS, -400, 400), []);
  const ptsB = useMemo(() => addressPoints(XS_B, YS_B, 440, 1160).filter(([, y]) => y > 450), []);
  const ref = useRef<HTMLCanvasElement>(null);
  const f = useCurrentFrame();
  useLayoutEffect(() => {
    const g = ref.current?.getContext("2d");
    if (g) paint(g, f / tl.fps, t, ptsA, ptsB, "#FFFFFF", C.accent);
  });
  return <canvas ref={ref} width={W} height={H} style={{ position: "absolute", inset: 0, width: W, height: H }} />;
};
