// Elements that move across the frame. Blur tracks velocity along the direction of travel, which is how an object
// can cover 300 px in a fifth of a second and stay readable. No overshoot anywhere: ease-out coming in, ease-in going out.
import React, { useId } from "react";
import { useCurrentFrame } from "remotion";
import { arriveEase, blurHold, ease, leaveEase, prog } from "./moves";

type Dir = "top" | "bottom" | "left" | "right";
const vec: Record<Dir, [number, number]> = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };

type Props = {
  at: number; // frame where the entrance begins
  from?: Dir;
  dist?: number;
  dur?: number;
  out?: number; // frame where the exit begins (optional)
  to?: Dir;
  outDist?: number;
  outDur?: number;
  /** "measured" replaces the cubic curves with the per-frame laws in moves.ts, and keeps the blur going past
   *  the landing rather than letting it fade with the speed. */
  curve?: "cubic" | "measured";
  style?: React.CSSProperties;
  children: React.ReactNode;
};

function offset(f: number, p: Props): [number, number, number] {
  const m = p.curve === "measured";
  const dur = p.dur ?? 12;
  const outDur = p.outDur ?? 9;
  const [ix, iy] = vec[p.from ?? "bottom"];
  const a = 1 - prog(f, p.at, dur, m ? arriveEase(dur) : ease.out);
  let x = ix * a * (p.dist ?? 260);
  let y = iy * a * (p.dist ?? 260);
  // measured: entrances do not fade in, they arrive. Opacity only ramps over the first two frames, to start the blur.
  let o = prog(f, p.at, m ? 2 : Math.min(6, dur), ease.linear);
  if (p.out !== undefined) {
    const [ox, oy] = vec[p.to ?? "top"];
    const b = prog(f, p.out, outDur, m ? leaveEase(outDur) : ease.in);
    x += ox * b * (p.outDist ?? 200);
    y += oy * b * (p.outDist ?? 200);
    // measured: exits stay fully opaque and move off frame instead of dissolving where they are
    o *= m ? 1 - prog(f, p.out + outDur - 2, 3, ease.linear) : 1 - b;
  }
  return [x, y, o];
}

export const Travel: React.FC<Props> = (p) => {
  const f = useCurrentFrame();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (f < p.at) return null;
  if (p.out !== undefined && f > p.out + (p.outDur ?? 9)) return null;
  const [x, y, o] = offset(f, p);
  const [px, py] = offset(f - 1, p);
  let bx = Math.min(40, Math.abs(x - px) * 0.45);
  let by = Math.min(40, Math.abs(y - py) * 0.45);
  if (p.curve === "measured") {
    // blur gets its own timeline along the travel axis, clearing roughly 120 ms after the object stops
    const peak = Math.min(46, (p.dist ?? 260) * 0.06);
    const k = blurHold(f, p.at, 11, (p.dur ?? 12) + 8) + (p.out !== undefined ? blurHold(f, p.out, 4, 6) : 0);
    const axis = (p.from ?? "bottom") === "left" || (p.from ?? "bottom") === "right";
    const b = peak * Math.min(1, k); // once clear it stays clear: a parked object never stays soft
    bx = k <= 0 ? 0 : axis ? b : Math.min(1.5, b);
    by = k <= 0 ? 0 : axis ? Math.min(1.5, b) : b;
  }
  const moving = bx > 0.3 || by > 0.3;
  return (
    <>
      {moving && (
        <svg width="0" height="0" style={{ position: "absolute" }}>
          <filter id={id} x="-30%" y="-60%" width="160%" height="220%">
            <feGaussianBlur stdDeviation={`${bx.toFixed(2)} ${by.toFixed(2)}`} />
          </filter>
        </svg>
      )}
      <div
        style={{
          ...p.style,
          opacity: o,
          transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`,
          filter: moving ? `url(#${id})` : undefined,
        }}
      >
        {p.children}
      </div>
    </>
  );
};

/** a macOS pointer. Points are in absolute stage coordinates; it eases from one to the next and pauses before a click. */
export const Cursor: React.FC<{ path: { f: number; x: number; y: number }[]; until?: number }> = ({ path, until }) => {
  const f = useCurrentFrame();
  if (f < path[0].f - 6 || (until !== undefined && f > until)) return null;
  let i = 0;
  while (i < path.length - 2 && f > path[i + 1].f) i++;
  const a = path[i];
  const b = path[Math.min(i + 1, path.length - 1)];
  const k = prog(f, a.f, Math.max(1, b.f - a.f), ease.inOut);
  const x = a.x + (b.x - a.x) * k;
  const y = a.y + (b.y - a.y) * k - Math.sin(k * Math.PI) * 18; // a gentle arc, never a ruler-straight line
  return (
    <svg width={58} height={58} viewBox="0 0 24 24" style={{ position: "absolute", left: x, top: y, opacity: prog(f, path[0].f - 6, 6), zIndex: 50 }}>
      <path d="M5 3l13 8.2-5.6 1.2 3.5 6.6-2.4 1.2-3.4-6.7L5 17.6z" fill="#fff" stroke="#111" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
};
