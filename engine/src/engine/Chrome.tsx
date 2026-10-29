// The single element allowed to stay up for the entire reel. Choose one per reel, or none.
// pill: a promise with a countdown (e.g. "the answer · at the end"), appearing with the promise and leaving once it is kept.
// terminal: holds still and sharp while on screen, adds a line for each claim; its squares quietly act as a progress bar.
import React from "react";
import { interpolateColors, useCurrentFrame } from "remotion";
import { useReel } from "./context";
import { useLightness } from "./Ground";
import { blurIn, prog, ease, typeOn } from "./moves";
import type { ChromeConfig, Tone } from "./timeline";

const Pill: React.FC<{ c: Extract<ChromeConfig, { type: "pill" }> }> = ({ c }) => {
  const { theme, tl } = useReel();
  const f = useCurrentFrame();
  const k = useLightness();
  const from = tl.at(c.from);
  const to = tl.at(c.to);
  if (f < from || f > to + 10) return null;
  const left = Math.max(0, Math.ceil((to - f) / tl.fps));
  const fill = prog(f, from, to - from, ease.linear);
  const leave = prog(f, to, 10, ease.in);
  const track = interpolateColors(k, [0, 1], ["#1B1B1B", "#FFFFFF"]);
  const ink = interpolateColors(k, [0, 1], ["#FFFFFF", "#0B0B0B"]);
  return (
    <div style={{ position: "absolute", left: 230, top: 1622, width: 620, height: 58, ...blurIn(f, from, { dur: 8, rise: 16 }) }}>
      <div
        style={{
          position: "absolute", inset: 0, borderRadius: 29, overflow: "hidden", background: track, opacity: 1 - leave,
          transform: `translateY(${leave * 60}px)`, boxShadow: k > 0.5 ? "0 8px 28px rgba(30,40,60,0.10)" : "none",
          display: "flex", alignItems: "center", fontFamily: theme.font.ui, fontSize: 28, color: ink,
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${fill * 100}%`, background: theme.roles.brand, opacity: 0.22 + 0.06 * (1 - k) }} />
        <span style={{ position: "relative", marginLeft: 24, color: theme.roles.brand, fontSize: 30 }}>✳</span>
        <span style={{ position: "relative", marginLeft: 12, fontWeight: 600 }}>{c.label}</span>
        <span style={{ position: "relative", marginLeft: "auto", marginRight: 24, fontWeight: 600, fontSize: 30, opacity: 0.72, fontVariantNumeric: "tabular-nums" }}>{left}s</span>
      </div>
    </div>
  );
};

const tones: Record<Tone, string> = { prompt: "#E06C5A", ok: "#3DD66B", warn: "#EAB648", alarm: "#F35C6B", dim: "#8A8A8C", plain: "#D6D6D8" };

const Terminal: React.FC<{ c: Extract<ChromeConfig, { type: "terminal" }> }> = ({ c }) => {
  const { theme, tl } = useReel();
  const f = useCurrentFrame();
  const lines = c.lines.map((l) => ({ ...l, f: tl.at(l.at) })).filter((l) => f >= l.f);
  const squares = c.squares ?? 0;
  const filled = lines.filter((l) => l.square).length;
  const done = c.lines.length ? lines.length / c.lines.length : 0;
  // a log covering only part of the reel enters and exits inside a silence, the way a scene does
  const from = c.from !== undefined ? tl.at(c.from) : 8;
  const to = c.to !== undefined ? tl.at(c.to) : Infinity;
  if (f < from || f > to + 9) return null;
  const leave = prog(f, to, 9, ease.in);
  return (
    <div style={{ position: "absolute", left: 90, top: 1290, width: 850, height: 300, borderRadius: 15, overflow: "hidden", background: "#141416", border: "1px solid #2F2F2F", boxShadow: "0 30px 60px rgba(0,0,0,0.45)", ...blurIn(f, from, { dur: 10, rise: 24 }), ...(leave > 0 ? { opacity: 1 - leave, filter: `blur(${(leave * 14).toFixed(1)}px)`, transform: `translateY(${(leave * 40).toFixed(1)}px)` } : {}) }}>
      <div style={{ height: 46, background: "#2A2A2C", display: "flex", alignItems: "center", padding: "0 18px", gap: 9 }}>
        {["#F05155", "#F5C034", "#39DC41"].map((col) => <span key={col} style={{ width: 15, height: 15, borderRadius: 99, background: col }} />)}
        <span style={{ flex: 1, textAlign: "center", fontFamily: theme.font.ui, fontSize: 22, color: "#A2A2A4" }}>{c.title}</span>
        {Array.from({ length: squares }).map((_, i) => <span key={i} style={{ width: 13, height: 13, borderRadius: 3, background: i < filled ? tones.ok : "#47474A" }} />)}
      </div>
      <div style={{ padding: "16px 28px", fontFamily: theme.font.mono, fontSize: 32, lineHeight: "40px", whiteSpace: "nowrap" }}>
        {lines.slice(-4).map((l) => (
          <div key={l.f + l.text} style={{ color: tones[l.tone ?? "plain"] }}>{typeOn(l.text, f, l.f, tl.fps, l.tone === "prompt" ? 33 : 8).text}</div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 28, right: 28, bottom: 18, height: 8, borderRadius: 4, background: "#252527" }}>
        <div style={{ width: `${done * 100}%`, height: "100%", borderRadius: 4, background: done >= 1 ? tones.ok : tones.warn }} />
      </div>
    </div>
  );
};

export const Chrome: React.FC<{ config?: ChromeConfig }> = ({ config }) => {
  if (!config || config.type === "none") return null;
  return config.type === "pill" ? <Pill c={config} /> : <Terminal c={config} />;
};
