// Turns words.json (made by scripts/align.py from caption.txt and the voice) into frame times.
// Scene boundaries are never set by hand: each scene hands over halfway through the silence before its first word.
import type { GroundName, Theme, DeepPartial } from "../theme";

export type Word = { w: string; t: number; e: number; key?: boolean; emoji?: string | null };
export type BlockData = { words: number[]; slot: "top" | "bottom"; scene: number; br?: number };
export type SceneData = { id: string; ground: GroundName; firstWord: number };
export type ReelData = { duration: number; silences: [number, number][]; scenes: SceneData[]; blocks: BlockData[]; words: Word[] };

export type ChromeConfig =
  | { type: "none" }
  | { type: "pill"; label: string; from: number | string; to: number | string }
  | { type: "terminal"; title: string; squares?: number; from?: number | string; to?: number | string; lines: { at: number | string; text: string; tone?: Tone; square?: boolean }[] };
export type Tone = "prompt" | "ok" | "warn" | "alarm" | "dim" | "plain";
export type ReelConfig = { theme?: DeepPartial<Theme>; chrome?: ChromeConfig };

export type Scene = SceneData & { index: number; from: number; to: number; mid: number; lastWord: number };
export type Block = BlockData & { index: number; from: number; to: number };
export type Timeline = {
  fps: number;
  frames: number;
  words: (Word & { f: number; fe: number })[];
  blocks: Block[];
  scenes: Scene[];
  cue: (token: string, nth?: number, scene?: number) => number;
  cueEnd: (token: string, nth?: number, scene?: number) => number;
  at: (ref: number | string) => number;
};

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9$€%]/g, "");

export function buildTimeline(data: ReelData, t: Theme): Timeline {
  const fps = t.fps;
  const frames = Math.ceil(data.duration * fps);
  const lead = t.caption.leadMs / 1000;
  const words = data.words.map((w) => ({ ...w, f: Math.max(0, Math.round((w.t - lead) * fps)), fe: Math.round(w.e * fps) }));

  const scenes: Scene[] = data.scenes.map((s, i) => {
    const next = data.scenes[i + 1];
    const lastWord = (next ? next.firstWord : words.length) - 1;
    return { ...s, index: i, from: 0, to: frames, mid: 0, lastWord };
  });
  for (let i = 1; i < scenes.length; i++) {
    const a = data.words[scenes[i].firstWord - 1].e;
    const b = data.words[scenes[i].firstWord].t;
    const mid = Math.round(((a + b) / 2) * fps);
    scenes[i].from = mid;
    scenes[i].mid = mid;
    scenes[i - 1].to = mid;
  }

  const blocks: Block[] = data.blocks.map((b, i) => {
    const first = words[b.words[0]];
    const last = words[b.words[b.words.length - 1]];
    const next = data.blocks[i + 1];
    const nextStart = next ? words[next.words[0]].f : frames;
    // a block clears just before the next one, or 0.35 s after its phrase ends if that comes first, so no stale line lingers.
    // the final block stays up to the end, since the reel's last frame must make sense by itself.
    const to = next ? Math.min(nextStart - t.caption.clearFrames, last.fe + Math.round(0.35 * fps)) : frames;
    return { ...b, index: i, from: first.f, to: Math.max(to, last.f + 6) };
  });

  const find = (token: string, nth: number, scene?: number) => {
    const key = norm(token);
    const lo = scene === undefined ? 0 : scenes[scene].firstWord;
    const hi = scene === undefined ? words.length - 1 : scenes[scene].lastWord;
    let seen = 0;
    for (let i = lo; i <= hi; i++) if (norm(words[i].w) === key && ++seen === nth) return words[i];
    const where = scene === undefined ? "the reel" : `scene "${scenes[scene].id}"`;
    throw new Error(`cue("${token}"${nth > 1 ? `, ${nth}` : ""}): that word is not spoken in ${where}. A cue must be a word of caption.txt.`);
  };
  const cue = (token: string, nth = 1, scene?: number) => find(token, nth, scene).f;
  const cueEnd = (token: string, nth = 1, scene?: number) => find(token, nth, scene).fe;
  const at = (ref: number | string) => {
    if (typeof ref === "number") return Math.round(ref * fps);
    if (ref.startsWith("scene:")) {
      const s = scenes.find((x) => x.id === ref.slice(6));
      if (!s) throw new Error(`no scene "${ref.slice(6)}" in caption.txt`);
      return s.from;
    }
    const [tok, n] = ref.split("#");
    return cue(tok, n ? parseInt(n, 10) : 1);
  };
  return { fps, frames, words, blocks, scenes, cue, cueEnd, at };
}
