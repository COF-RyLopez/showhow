// The caption engine, the one layer shared unchanged by every reel.
// Each spoken word gets one caption word, and a word not yet spoken is not shown. The word being said is bold in full
// ink; once said it turns regular grey within a frame, the line re-centres within a frame, and each new word sharpens
// out of blur where it stands. One key word per block keeps full ink inside a selection box that arrives a few frames later.
import React, { useMemo } from "react";
import { Easing, interpolateColors, useCurrentFrame } from "remotion";
import { measureText } from "@remotion/layout-utils";
import { useReel } from "./context";
import { useLightness } from "./Ground";
import { prog, ease } from "./moves";
import type { Block, Timeline } from "./timeline";
import type { Theme } from "../theme";

type Laid = { lines: number[][]; space: number };
const EMOJI_W = 1.34; // width of the emoji plus its gap, in ems
const KEY_PAD = 10; // space kept around a key word so its box never touches the next word
// if marker.pillPad is set, the pill extends pillPad beyond the word, and the word is spaced by pillPad + PILL_GAP
const PILL_GAP = 8;
const keyPad = (mk: { style: string; pillPad?: number }) => (mk.style === "pill" && mk.pillPad != null ? mk.pillPad + PILL_GAP : KEY_PAD);

function layout(block: Block, tl: Timeline, t: Theme): Laid {
  const m = (text: string) =>
    measureText({ text, fontFamily: t.font.caption.split(",")[0], fontSize: t.caption.size, fontWeight: "700", validateFontIsLoaded: true }).width;
  const space = m("a a") - m("aa");
  const widths = block.words.map((i) => m(tl.words[i].w) + (tl.words[i].emoji ? t.caption.size * EMOJI_W : 0) + (tl.words[i].key ? 2 * keyPad(t.marker) : 0));
  const span = (a: number, b: number) => widths.slice(a, b).reduce((s, w) => s + w, 0) + space * Math.max(0, b - a - 1);
  const n = widths.length;
  let lines: number[][] = [block.words];
  if (block.br !== undefined) {
    const k = block.words.indexOf(block.br);
    lines = [block.words.slice(0, k), block.words.slice(k)];
    if (Math.max(span(0, k), span(k, n)) > t.caption.wrap) lines.push([]); // a hand-placed break that still overflows fails as well
  } else if (span(0, n) > t.caption.wrap) {
    // split into two balanced lines, like text-wrap: balance, picking the break where the wider line is narrowest
    let best = -1;
    for (let k = 1; k < n; k++) {
      const wide = Math.max(span(0, k), span(k, n));
      if (wide <= t.caption.wrap && (best < 0 || wide < Math.max(span(0, best), span(best, n)))) best = k;
    }
    lines = best < 0 ? [block.words, [], []] : [block.words.slice(0, best), block.words.slice(best)];
  }
  if (lines.length > t.caption.maxLines) {
    const text = block.words.map((i) => tl.words[i].w).join(" ");
    throw new Error(`caption block ${block.index} needs ${lines.length} lines ("${text}"). Break it in caption.txt: two lines is the limit.`);
  }
  return { lines, space };
}

const Marker: React.FC<{ at: number; ink: string }> = ({ at, ink }) => {
  const { theme } = useReel();
  const f = useCurrentFrame();
  const mk = theme.marker;
  const meas = theme.motion === "measured";
  const p = prog(f, at, mk.drawFrames, ease.linear);
  if (mk.style === "none" || f < at) return null;
  const box: React.CSSProperties = meas
    ? { position: "absolute", left: -12, right: -12, top: 0, bottom: -2 }
    : { position: "absolute", left: -12, right: -12, top: 0, bottom: -2, opacity: p, transform: `scale(${0.94 + 0.06 * p})` };
  const fill = (color: string, opacity: number, radius = 0) => <span style={{ position: "absolute", inset: 0, background: color, opacity, borderRadius: radius }} />;
  if (mk.style === "pill") return <span style={{ ...box, opacity: p, left: -(mk.pillPad ?? 26), right: -(mk.pillPad ?? 26) }}>{fill(ink, 0.1, 999)}</span>;
  const dot = (pos: React.CSSProperties, k = 1) => (
    <span style={{ position: "absolute", width: mk.handle, height: mk.handle, borderRadius: 999, background: mk.color, border: "3px solid #fff", boxSizing: "border-box", transform: `scale(${k.toFixed(3)})`, ...pos }} />
  );
  const h = mk.handle / 2 + mk.stroke / 2;
  if (!meas) {
    return (
      <span style={{ ...box, border: `${mk.stroke}px solid ${mk.color}` }}>
        {fill(mk.color, mk.fill)}
        {dot({ left: -h, top: -h })}
        {dot({ right: -h, bottom: -h })}
      </span>
    );
  }
  // measured: four staged beats across 200 ms. The handles pop up from 0.36, the horizontal rules follow with a slight
  // overshoot, the vertical rules come three frames after, and the fill fades in beneath. Drawn this way it reads as a
  // selection; a box that appears all at once reads as a label.
  const hand = prog(f, at, 3, Easing.out(Easing.back(1.2)));
  const horiz = prog(f, at + 2, 5, ease.out);
  const vert = prog(f, at + 5, 5, ease.out);
  const wash = prog(f, at + 3, 11, ease.out);
  const rule = (o: React.CSSProperties, k: number, axis: "x" | "y") => (
    <span style={{ position: "absolute", background: mk.color, transform: axis === "x" ? `scaleX(${k.toFixed(3)})` : `scaleY(${k.toFixed(3)})`, ...o }} />
  );
  return (
    <span style={box}>
      {fill(mk.color, mk.fill * wash)}
      {rule({ left: 0, right: 0, top: 0, height: mk.stroke }, horiz, "x")}
      {rule({ left: 0, right: 0, bottom: 0, height: mk.stroke }, horiz, "x")}
      {rule({ top: 0, bottom: 0, left: 0, width: mk.stroke }, vert, "y")}
      {rule({ top: 0, bottom: 0, right: 0, width: mk.stroke }, vert, "y")}
      {dot({ left: -h, top: -h }, 0.36 + 0.64 * hand)}
      {dot({ right: -h, bottom: -h }, 0.36 + 0.64 * hand)}
    </span>
  );
};

const WordSpan: React.FC<{ i: number; active: boolean; ink: string; spoken: string; space: number; last: boolean }> = ({ i, active, ink, spoken, space, last }) => {
  const { theme, tl } = useReel();
  const f = useCurrentFrame();
  const w = tl.words[i];
  const c = theme.caption;
  const m = theme.motion === "measured";
  // measured: ease-out instead of linear. It goes 0.28 / 0.70 / 0.87 / 0.94 / 1.00 across five frames,
  // and the word settles down the final 13 px instead of appearing already in place.
  const p = prog(f, w.f, c.blurInFrames + (m ? 1 : 0), m ? ease.out : ease.linear);
  const dy = m ? (1 - p) * 13 : 0;
  const strong = active || !!w.key;
  const e = prog(f, w.f, 5, ease.back); // the line opens up as the emoji grows
  return (
    <span data-word-id={(w as any).edit?.id} style={{ display: "inline-flex", alignItems: "center", marginRight: last ? 0 : space, ...(w as any).edit?.css }}>
      {w.emoji && (
        // measured: the emoji's width is reserved during layout, so its growth never shifts the line
        <span style={{ display: "inline-block", width: c.size * EMOJI_W * (m ? 1 : Math.min(1, e)), fontSize: c.size * 1.1, transform: `scale(${e})`, transformOrigin: m ? "center" : "left center", lineHeight: 1, opacity: m ? Math.min(1, e) : 1 }}>
          {w.emoji}
        </span>
      )}
      <span style={{ position: "relative", display: "inline-block", margin: w.key ? `0 ${keyPad(theme.marker)}px` : undefined, fontWeight: strong ? 700 : 400, color: (w as any).edit?.css?.color ?? (strong ? ink : spoken), opacity: p, filter: p < 1 ? `blur(${(1 - p) * c.blurPx}px)` : undefined, transform: dy ? `translateY(${dy.toFixed(2)}px)` : undefined }}>
        {w.key && <Marker at={w.f + theme.marker.delayFrames} ink={ink} />}
        <span style={{ position: "relative" }}>{w.w}</span>
      </span>
    </span>
  );
};

export const Caption: React.FC = () => {
  const { theme, tl } = useReel();
  const f = useCurrentFrame();
  const k = useLightness();
  const laid = useMemo(() => tl.blocks.map((b) => layout(b, tl, theme)), [tl, theme]);
  const block = tl.blocks.find((b) => f >= b.from && f < b.to);
  if (!block) return null;
  const c = theme.caption;
  const { dark, light } = theme.grounds;
  const ink = interpolateColors(k, [0, 1], [dark.ink, light.ink]);
  const spoken = interpolateColors(k, [0, 1], [dark.spoken, light.spoken]);
  const { lines, space } = laid[block.index];
  const shown = block.words.filter((i) => f >= tl.words[i].f);
  const activeIdx = shown[shown.length - 1];
  // each block clears before the next begins; the final one stays, so the last frame still reads
  const last = block.index === tl.blocks.length - 1;
  // measured: a block clears by opacity only, ease-in, with no blur or movement, followed by one empty frame
  const meas = theme.motion === "measured";
  const out = last ? 0 : prog(f, block.to - c.clearFrames, c.clearFrames, meas ? ease.in : ease.linear);
  return (
    <div
      style={{
        position: "absolute", left: 0, width: 1080, top: block.slot === "top" ? c.top : c.bottom,
        fontFamily: theme.font.caption, fontSize: c.size, lineHeight: `${c.lineHeight}px`, letterSpacing: "-0.01em",
        opacity: 1 - out, filter: !meas && out > 0 ? `blur(${out * 8}px)` : undefined,
      }}
    >
      {lines.map((line, li) => {
        const vis = line.filter((i) => shown.includes(i));
        return (
          <div key={li} style={{ display: "flex", justifyContent: "center", height: c.lineHeight, whiteSpace: "nowrap" }}>
            {vis.map((i, n) => (
              <WordSpan key={i} i={i} active={i === activeIdx} ink={ink} spoken={spoken} space={space} last={n === vis.length - 1} />
            ))}
          </div>
        );
      })}
    </div>
  );
};
