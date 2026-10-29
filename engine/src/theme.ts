// All a reel can adjust while staying in the format. The engine/ grammar itself is fixed, not a setting.
// Values are in pixels of a 1080x1920 frame and in 60 fps frames.

export type GroundName = "dark" | "light";

export type Ground = {
  bg: string;
  grid: string; // 1 px grid line colour
  ink: string; // the word being said, and main text
  spoken: string; // caption words already spoken
  card: string;
  hairline: string;
  dim: string; // muted text
};

export type Theme = {
  fps: number;
  font: { caption: string; ui: string; mono: string };
  caption: {
    size: number;
    lineHeight: number;
    wrap: number; // widest a line may get
    top: number; // top slot: y of the first line box of a block
    bottom: number; // bottom slot, same measure
    leadMs: number; // each word shows this much early so it is crisp when its syllable lands
    blurInFrames: number;
    blurPx: number;
    clearFrames: number;
    maxLines: number;
  };
  marker: {
    style: "select" | "pill" | "none";
    color: string;
    fill: number; // opacity of the box fill
    stroke: number;
    handle: number;
    delayFrames: number; // the box arrives just after its word, so one token reads in two beats
    drawFrames: number;
    pillPad?: number; // for the pill style: how far the pill extends beyond its word, with the word spaced by this + 8 (if unset: 26 / 10 as before)
  };
  grounds: Record<GroundName, Ground>;
  gridPitch: number;
  roles: { ok: string; alarm: string; positive: string; brand: string; link: string };
  stage: { width: number; top: number; bottom: number };
  /** "continuous": no transition; each scene takes over on its first frame and continuity is the scenes' job */
  handover: "rise" | "scroll" | "push" | "flow" | "continuous";
  /** "blur": the default entrance, sharpening as it rises; "snap": a quick scale-in without blur; "glide": a slow soft slide, no blur */
  entrance?: "blur" | "snap" | "glide";
  /** "v1" is the original grammar. "measured" keeps it but uses softer curves and caption timing. */
  motion: "v1" | "measured";
  minType: number; // smallest size allowed for text that makes a claim
};

export const theme: Theme = {
  fps: 60,
  font: {
    caption: "Inter, sans-serif",
    ui: "Inter, sans-serif",
    mono: "'JetBrains Mono', monospace",
  },
  caption: {
    size: 74,
    lineHeight: 82,
    wrap: 740,
    top: 318,
    bottom: 1372,
    leadMs: 40,
    blurInFrames: 4,
    blurPx: 10,
    clearFrames: 3,
    maxLines: 2,
  },
  marker: { style: "select", color: "#4C8DFF", fill: 0.18, stroke: 3, handle: 22, delayFrames: 5, drawFrames: 5 },
  grounds: {
    dark: {
      bg: "#111214",
      grid: "rgba(255,255,255,0)", // grid off
      ink: "#FFFFFF",
      spoken: "#6B6B6B",
      card: "#161618",
      hairline: "#2A2A2C",
      dim: "#8C8C8C",
    },
    light: {
      bg: "#FAFAFA",
      grid: "rgba(0,0,0,0)",
      ink: "#0B0B0B",
      spoken: "#8E8E8E",
      card: "#FFFFFF",
      hairline: "#E6E6E6",
      dim: "#6B7280",
    },
  },
  gridPitch: 60,
  roles: { ok: "#3DDC97", alarm: "#E5484D", positive: "#30A46C", brand: "#4C8DFF", link: "#4C8DFF" },
  stage: { width: 900, top: 520, bottom: 1450 },
  handover: "flow",
  entrance: "glide",
  motion: "v1",
  minType: 32,
};

export const W = 1080;
export const H = 1920;

export function withOverrides(base: Theme, o?: DeepPartial<Theme>): Theme {
  if (!o) return base;
  return merge(base, o) as Theme;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function merge(a: unknown, b: unknown): unknown {
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return b ?? a;
  const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
  for (const [k, v] of Object.entries(b as Record<string, unknown>)) out[k] = merge(out[k], v);
  return out;
}
