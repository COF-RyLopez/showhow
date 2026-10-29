// No scene ever cuts. A scene exits as one block within the silence before the next scene's first word, and the next
// scene is already mounted as it exits, so the ground never shows bare. Elements inside a scene enter on their own cues.
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { SceneContext, useReel } from "./context";
import { ease, leaveEase, prog } from "./moves";

export type SceneMap = Record<string, React.FC>;

const OUT = 9; // frames the old scene needs to exit (rise)
const OUT_M = 11; // measured: lift-off lasts 10-12 frames, displacement growing x 1.45 per frame, out through the top
const LIFT = 2000; // measured: the stage exits the frame instead of shrinking or fading where it is
const SCROLL = 13; // frames for a full-stage scroll
const PUSH = 14; // frames for a side push: the new scene enters from the right while the old one exits left
const FLOW = 30; // frames for the camera to fly into the next scene; a reel sets theme.flowFrames (40 to 60) for a longer one
const DRIFT = 0.05; // how far the camera slowly pushes in over a scene's full lifetime
// theme.handoverCalm: the same 30-frame flow, with less travel. A change that is not a match zooms half as far (in
// log terms), never past 0.5x or 2x; a dive starts 1.2x close instead of 1.35x; and a pull-back never shrinks the old
// picture into a small disc in an empty frame. Match changes keep their zoom, since both pictures must line up.
const CALM_MAX = 2;
const calmZoom = (z: number) => Math.min(CALM_MAX, Math.max(1 / CALM_MAX, Math.sqrt(z)));
export const LEAD = 6; // scenes mount this many frames early: begin the first entrance at scene.from - LEAD so the ground never shows bare

export const Stage: React.FC<{ scenes: SceneMap }> = ({ scenes }) => {
  const { theme, tl } = useReel();
  const f = useCurrentFrame();
  // the handover length: new reels set theme.flowFrames to 40-60 so a change is spread out, never packed into 10 frames
  const FLOWN = Math.max(FLOW, Number((theme as { flowFrames?: number }).flowFrames) || FLOW);
  // theme.pushFrames: a slower side push for a reel that wants no fades and no cuts (the default 14 frames is a whip)
  const PUSHN = Math.max(PUSH, Number((theme as { pushFrames?: number }).pushFrames) || PUSH);
  return (
    <AbsoluteFill>
      {tl.scenes.map((s) => {
        const Comp = scenes[s.id];
        const last = s.index === tl.scenes.length - 1;
        const meas = theme.motion === "measured" && theme.handover !== "scroll";
        const outDur = meas ? OUT_M : OUT;
        const push = theme.handover === "push";
        const flow = theme.handover === "flow";
        const leaveAt = s.to - (theme.handover === "scroll" ? Math.floor(SCROLL / 2) : push ? Math.floor(PUSHN / 2) : flow ? Math.floor(FLOWN / 2) : outDur - 4);
        const gone = last ? Infinity : leaveAt + (theme.handover === "scroll" ? SCROLL : push ? PUSHN : flow ? FLOWN : outDur);
        const mountAt = s.index === 0 ? 0 : s.from - (theme.handover === "scroll" ? Math.floor(SCROLL / 2) : push ? Math.floor(PUSHN / 2) : flow ? Math.floor(FLOWN / 2) : LEAD);
        // a scene component marked `keep = true` hands over in place: the next scene begins on that exact picture
        // (one continuous world), so it is not lifted away; it just stops rendering once the next scene has mounted
        const keep = !!(Comp as unknown as { keep?: boolean } | undefined)?.keep && !last;
        // handover "continuous": no transition at all. Each scene owns its frames exactly and the next one takes over on
        // its first frame; continuity is the scenes' job (the incoming scene opens on the outgoing one's last picture
        // and keeps the camera moving). No fade, push, dissolve or lift.
        if ((theme.handover as string) === "continuous") {
          // theme.morph { frames, joins: [incoming scene ids] }: where the two sides of a join don't line up exactly,
          // the old shot keeps playing underneath and the new one melts in on an ease-in/ease-out (a match dissolve)
          const morph = (theme as { morph?: { frames?: number; joins?: string[] } }).morph;
          const mf = Math.max(1, morph?.frames ?? 18);
          const next = tl.scenes[s.index + 1];
          const morphIn = s.index > 0 && !!morph?.joins?.includes(s.id);
          const morphOut = !last && !!next && !!morph?.joins?.includes(next.id);
          // the incoming scene mounts a few frames early, invisible, so its world is ready on its first frame
          const PRE = 8;
          if (!Comp || f < s.from - (s.index > 0 ? PRE : 0) || (!last && f >= s.to + (morphOut ? mf : 0))) return null;
          if (f < s.from) {
            return (
              <SceneContext.Provider key={s.id} value={s}>
                <AbsoluteFill style={{ opacity: 0 }}><Comp /></AbsoluteFill>
              </SceneContext.Provider>
            );
          }
          // theme.whiteJoins: a quick dip to white at these joins (the old shot brightens to white, the new rises out of it)
          const wj = (theme as { whiteJoins?: string[]; whiteFrames?: number }).whiteJoins ?? [];
          const wf = Math.max(1, (theme as { whiteFrames?: number }).whiteFrames ?? 12);
          const whiteIn = s.index > 0 && wj.includes(s.id) ? 1 - Math.min(1, Math.max(0, (f - s.from) / wf)) : 0;
          const whiteOut = !last && !!next && wj.includes(next.id) ? Math.min(1, Math.max(0, (f - (s.to - wf)) / wf)) : 0;
          const white = Math.max(whiteIn, whiteOut);
          const wS = white * white * (3 - 2 * white);
          const sm = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
          // incoming: melts in while settling from slightly close; outgoing: keeps drifting forward underneath
          const op = morphIn ? sm((f - s.from + 1) / mf) : 1;
          const outK = morphOut ? sm((f - s.to + 1) / mf) : 0;
          const push = (morph as { push?: number } | undefined)?.push ?? 0.05;
          const scale = morphIn && op < 1 ? 1 + push * (1 - op) : 1 + push * outK;
          const style: React.CSSProperties | undefined = op < 1 || outK > 0
            ? { opacity: op, transform: `scale(${scale.toFixed(4)})`, transformOrigin: "540px 960px" }
            : undefined;
          return (
            <SceneContext.Provider key={s.id} value={s}>
              <AbsoluteFill style={style}><Comp /></AbsoluteFill>
              {wS > 0.001 && <AbsoluteFill style={{ background: "#FFFFFF", opacity: wS }} />}
            </SceneContext.Provider>
          );
        }
        if (!Comp || f < mountAt || f >= (keep ? s.to - LEAD : gone)) return null;
        let style: React.CSSProperties = {};
        let smear = 0;
        if (keep) {
          style = {};
        } else if (flow) {
          // flow handover: the camera keeps moving. It drifts forward through every scene, and at each change it
          // travels from a point in the old picture to the matching point in the new one (diving into a detail, or
          // pulling back out of it), zooming all the way, while the new picture fades in along that path.
          // Set per change in theme.joins[<incoming scene id>] = { from: [x, y] on the old picture, to: [x, y] on the new, zoom, match? }
          const end = last ? tl.frames : gone;
          const drift = 1 + DRIFT * Math.min(1, Math.max(0, (f - mountAt) / Math.max(1, end - mountAt)));
          const joins = (theme as { joins?: Record<string, { from: [number, number]; to: [number, number]; zoom: number; match?: boolean }> }).joins ?? {};
          const dflt = { from: [540, 960] as [number, number], to: [540, 960] as [number, number], zoom: 1.35, match: false };
          const next = tl.scenes[s.index + 1];
          const calm = !!(theme as { handoverCalm?: boolean }).handoverCalm;
          type Join = { from: [number, number]; to: [number, number]; zoom: number; match?: boolean };
          const soften = (j: Join): Join => (calm && !j.match ? { ...j, zoom: calmZoom(j.zoom) } : j);
          const jIn = soften(joins[s.id] ?? dflt);
          const jOut = soften((next && joins[next.id]) ?? dflt);
          // t goes from 0 to 1 over the move; zoom is exponential so the camera's speed feels constant
          const tIn = s.index === 0 ? 1 : prog(f, mountAt, FLOWN, ease.inOut);
          const tOut = last ? 0 : prog(f, leaveAt, FLOWN, ease.inOut);
          let ox = 540, oy = 960, dx = 0, dy = 0, k = 1;
          let mask: string | undefined;
          let fade = 1;
          // a picture smaller than the frame never shows its edges: it becomes a soft disc around the focus point,
          // opening to fill the frame (diving in) or shrinking onto the focus as the camera pulls back
          const disc = (x: number, y: number, r: number) =>
            `radial-gradient(circle at ${x}px ${y}px, #000 ${(r * 0.55).toFixed(0)}px, transparent ${r.toFixed(0)}px)`;
          if (tOut > 0) {
            [ox, oy] = jOut.from;
            k = Math.pow(jOut.zoom, tOut);
            dx = (jOut.to[0] - jOut.from[0]) * tOut; dy = (jOut.to[1] - jOut.from[1]) * tOut;
            if (jOut.zoom < 1 && !jOut.match) mask = disc(ox, oy, 2400 - (calm ? 1100 : 2000) * Math.pow(tOut, 0.6));
          } else if (tIn < 1) {
            [ox, oy] = jIn.to;
            if (jIn.match) {
              // the same object on both sides: the camera keeps zooming into it, both pictures align exactly,
              // and the new one just dissolves in where they overlap
              k = Math.pow(jIn.zoom, tIn - 1);
              dx = (jIn.from[0] - jIn.to[0]) * (1 - tIn); dy = (jIn.from[1] - jIn.to[1]) * (1 - tIn);
              // theme.joinFade "even": a steady fade over the middle 70% of the move, so two very different pictures
              // never swap inside a few frames (the default eased fade packs most of the change into its middle)
              fade = (theme as { joinFade?: string }).joinFade === "even"
                ? prog(f, mountAt + FLOWN * 0.15, FLOWN * 0.7, ease.linear)
                : prog(f, mountAt + FLOWN * 0.25, FLOWN * 0.5, ease.inOut);
            } else if (jIn.zoom > 1) {
              // a dive: the new picture never gets smaller than the frame; it opens from the focus as a soft disc,
              // easing in from slightly too close, while the old one keeps zooming into the same point beneath it
              k = 1 + (calm ? 0.2 : 0.35) * (1 - tIn);
              mask = disc(ox, oy, 120 + 2600 * Math.pow(tIn, 1.6));
              // theme.joinFade "portal": no see-through crossfade; the new picture is solid inside its opening disc,
              // so the camera reads as flying through a hole into the next place rather than two pictures overlapping
              fade = (theme as { joinFade?: string }).joinFade === "portal" ? 1 : prog(f, mountAt, FLOWN * 0.3, ease.out);
            } else {
              k = Math.pow(jIn.zoom, tIn - 1);
              dx = (jIn.from[0] - jIn.to[0]) * (1 - tIn); dy = (jIn.from[1] - jIn.to[1]) * (1 - tIn);
              fade = prog(f, mountAt + FLOWN * 0.15, FLOWN * 0.55, ease.inOut);
            }
          }
          if (s.index === 0) fade = 1;
          style = {
            transformOrigin: `${ox}px ${oy}px`,
            transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${(k * drift).toFixed(4)})`,
            opacity: fade,
            WebkitMaskImage: mask,
            maskImage: mask,
          };
        } else if (push) {
          // push handover: a sharp sideways push with both scenes moving together and no blur
          const xAt = (fr: number) =>
            (s.index === 0 ? 0 : (1 - prog(fr, mountAt, PUSHN, ease.inOut)) * 1080) - (last ? 0 : prog(fr, leaveAt, PUSHN, ease.inOut) * 1080);
          style = { transform: `translateX(${xAt(f).toFixed(1)}px)` };
        } else if (theme.handover === "scroll") {
          // the old card exits through the top while the new one rises from below, in a single 220 ms move
          const yAt = (fr: number) =>
            (s.index === 0 ? 0 : (1 - prog(fr, mountAt, SCROLL, ease.inOut)) * 1500) - (last ? 0 : prog(fr, leaveAt, SCROLL, ease.inOut) * 1500);
          const y = yAt(f);
          const v = Math.abs(y - yAt(f - 1));
          style = { transform: `translateY(${y.toFixed(1)}px)`, filter: v > 2 ? `blur(${Math.min(18, v * 0.12).toFixed(1)}px)` : undefined };
        } else if (meas && !last) {
          // the measured lift-off: it pauses, then snaps up out of the top with a vertical smear, fully opaque.
          // It does not scale or fade in place, so the frame never holds a half-faded scene.
          // The smear must be an SVG filter: CSS blur() is uniform with a single radius, so a one-direction blur
          // cannot be written as blur(0px Npx) (that is invalid and gets dropped without warning).
          const p = prog(f, leaveAt, outDur, leaveEase(outDur));
          const q = prog(f - 1, leaveAt, outDur, leaveEase(outDur));
          smear = Math.min(46, ((p - q) * LIFT) * 0.16);
          style = {
            transform: `translateY(${(-LIFT * p).toFixed(1)}px)`,
            // it fades out while moving fastest and most smeared, so no legible ghost stays over the caption
            opacity: 1 - prog(f, leaveAt + outDur - 5, 5, ease.linear),
            filter: smear > 0.5 ? `url(#lift-${s.id})` : undefined,
          };
        } else if (!last) {
          const p = prog(f, leaveAt, OUT, ease.in);
          style = { transform: `translateY(${(-140 * p).toFixed(1)}px) scale(${1 - 0.04 * p})`, opacity: 1 - p, filter: p > 0 ? `blur(${(p * 16).toFixed(1)}px)` : undefined };
        }
        return (
          <SceneContext.Provider key={s.id} value={s}>
            {smear > 0.5 && (
              <svg width="0" height="0" style={{ position: "absolute" }}>
                <filter id={`lift-${s.id}`} x="-10%" y="-60%" width="120%" height="220%">
                  <feGaussianBlur stdDeviation={`0 ${smear.toFixed(2)}`} />
                </filter>
              </svg>
            )}
            <AbsoluteFill style={style}>
              <Comp />
            </AbsoluteFill>
          </SceneContext.Provider>
        );
      })}
    </AbsoluteFill>
  );
};

/** the centred column that every scene is built in */
export const Column: React.FC<{ children: React.ReactNode; width?: number }> = ({ children, width }) => {
  const { theme } = useReel();
  const w = width ?? theme.stage.width;
  return <div style={{ position: "absolute", left: (1080 - w) / 2, width: w, top: 0, height: 1920 }}>{children}</div>;
};
