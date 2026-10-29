// A hand-written pinhole camera for canvas 2D scenes: world points in, screen points out. No 3D library.
// Units are whatever the scene picks (millimetres, metres); the focal length is in pixels of the 1080x1920 frame.
// Every value is a pure function of the frame, so a camera path is keys on word cues joined by a smooth curve.

export type V3 = [number, number, number];
export type Cam = { eye: V3; at: V3; focal: number; cx: number; cy: number };
export type Projected = { x: number; y: number; z: number; s: number };

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

/** world to screen. y is up in the world and down on screen. z is the depth (for sorting); s the pixels per unit there. */
export function project(c: Cam, p: V3): Projected {
  const fwd = unit(sub(c.at, c.eye));
  const right = unit(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const d = sub(p, c.eye);
  const z = Math.max(1e-3, dot(d, fwd));
  const s = c.focal / z;
  return { x: c.cx + dot(d, right) * s, y: c.cy - dot(d, up) * s, z, s };
}

/** an orbit around a target: yaw and pitch in radians, distance in world units */
export const orbit = (at: V3, yaw: number, pitch: number, dist: number): V3 => [
  at[0] + dist * Math.cos(pitch) * Math.sin(yaw),
  at[1] + dist * Math.sin(pitch),
  at[2] + dist * Math.cos(pitch) * Math.cos(yaw),
];

/** a value held at keys (frame, value) and joined by a Catmull-Rom curve: it passes through every key, never jumps,
 *  and keeps moving through the middle keys instead of stopping on each one */
export function spline(f: number, keys: [number, number][]): number {
  if (f <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (f >= last[0]) return last[1];
  let i = 0;
  while (f > keys[i + 1][0]) i++;
  const [f0, v0] = keys[Math.max(0, i - 1)], [f1, v1] = keys[i], [f2, v2] = keys[i + 1], [f3, v3] = keys[Math.min(keys.length - 1, i + 2)];
  const t = (f - f1) / (f2 - f1);
  // tangents scaled to the real frame gaps, so uneven key spacing does not make the speed jump at a key
  const m1 = i === 0 ? 0 : ((v2 - v0) / (f2 - f0)) * (f2 - f1);
  const m2 = i + 2 >= keys.length ? 0 : ((v3 - v1) / (f3 - f1)) * (f2 - f1);
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * v1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * v2 + (t3 - t2) * m2;
}
