#!/usr/bin/env node
// Makes a quick draft of a reel so it can be watched before the checks and the final render. It is the real drawn,
// animated video at half size and 30 fps, stamped DRAFT across the middle and "not checked yet" along the top.
// It is never delivered.
//   node draft.mjs <slug> [--concurrency n] [--no-open]
// Writes reels/<slug>/draft/<slug>-DRAFT.mp4 and prints its path.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const slug = args[0];
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const reelDir = path.join(dir, "reels", slug ?? "");
if (!slug || !fs.existsSync(path.join(reelDir, "words.json"))) {
  console.error("usage: node draft.mjs <slug> [--concurrency n] [--no-open]");
  process.exit(1);
}
const outDir = path.join(reelDir, "draft");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `${slug}-DRAFT.mp4`);
const W = 540, H = 960;
const run = (cmd, a) => {
  const r = spawnSync(cmd, a, { cwd: dir, stdio: ["ignore", "inherit", "inherit"] });
  if (r.status !== 0) { console.error(`draft: ${cmd} failed`); process.exit(1); }
};

// The stamp: a big DRAFT across the middle and a band along the top, drawn once as a transparent PNG.
const stamp = path.join(outDir, "stamp.png");
run(process.env.SH_PYTHON || "python3", ["-c", `
from PIL import Image, ImageDraw, ImageFont
W, H = ${W}, ${H}
im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
def font(n):
    for f in ["/System/Library/Fonts/Supplemental/Arial Black.ttf", "/System/Library/Fonts/Supplemental/Impact.ttf", "DejaVuSans-Bold.ttf"]:
        try: return ImageFont.truetype(f, n)
        except Exception: pass
    return ImageFont.load_default()
big = font(118)
b = d.textbbox((0, 0), "DRAFT", font=big)
d.text(((W - (b[2] - b[0])) / 2 - b[0], (H - (b[3] - b[1])) / 2 - b[1]), "DRAFT", font=big, fill=(255, 255, 255, 120), stroke_width=5, stroke_fill=(220, 30, 30, 170))
d.rectangle([0, 0, W, 54], fill=(220, 30, 30, 215))
small = font(19)
t = "DRAFT  ·  not checked yet"
b = d.textbbox((0, 0), t, font=small)
d.text(((W - (b[2] - b[0])) / 2 - b[0], (54 - (b[3] - b[1])) / 2 - b[1]), t, font=small, fill=(255, 255, 255, 255))
im.save(r"${stamp}")
`]);

const raw = path.join(outDir, "raw.mp4");
run("node", ["render.mjs", slug, "--draft", "--out", raw, "--concurrency", opt("--concurrency") ?? "4"]);
run("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-i", stamp, "-filter_complex", `[0:v]scale=${W}:${H}[v];[v][1:v]overlay=0:0`,
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-c:a", "copy", out]);
fs.rmSync(raw, { force: true });
fs.rmSync(stamp, { force: true });
console.log(out);
if (process.platform === "darwin" && !args.includes("--no-open")) spawnSync("open", [out]);
