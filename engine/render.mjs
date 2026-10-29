// Renders a reel to MP4, or renders a few stills to check it before the full render.
//   node render.mjs <slug>                         => full video at output/YYYY-MM-DD/NN-<slug>.mp4
//   node render.mjs <slug> --stills 1.2,3.45,9     => PNG frames at those seconds: reels/<slug>/stills/t_001.20.png and so on
//   node render.mjs <slug> --guides --stills 3     => the same, with the layout bands and Instagram's overlay zones on top
//   node render.mjs <slug> --from 4 --to 9         => renders just that time range, in seconds
//   node render.mjs <slug> --public-only shared    => bundles just public/<slug> and public/shared (low disk space)
//   (by default only the public/ folders the reel refers to are bundled; --full-public takes all of public/)
//   node render.mjs <slug> --caption               => shows the top word caption, which is off by default
//   node render.mjs <slug> --stills 3,9 --half     => half-size stills (540x960): a quarter of the image tokens when an agent reads them
//   node render.mjs <slug> --draft --out x.mp4     => a quick half-size render for a first look (scripts/draft.mjs stamps it DRAFT)
// Needs the sandbox turned off, since Remotion launches its own Chrome.
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const slug = args[0];
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const reelDir = path.join(dir, "reels", slug ?? "");
if (!slug || !fs.existsSync(path.join(reelDir, "words.json"))) {
  console.error("usage: node render.mjs <slug> [--stills s,s,s] [--guides] [--from s --to s] [--out path]\n(this needs reels/<slug>/words.json, made by scripts/align.py <slug>)");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(path.join(reelDir, "words.json"), "utf-8"));
const configPath = path.join(reelDir, "reel.json");
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf-8")) : {};

// public/ is copied by the bundler, which skips symlinks, so the voice and assets go in as real files
const voice = fs.readdirSync(reelDir).find((f) => /^voice\.(mp3|wav|m4a)$/.test(f));
const pub = path.join(dir, "public", slug);
fs.mkdirSync(pub, { recursive: true });
if (voice) fs.copyFileSync(path.join(reelDir, voice), path.join(pub, voice));
for (const f of fs.existsSync(path.join(reelDir, "assets")) ? fs.readdirSync(path.join(reelDir, "assets")) : [])
  if (fs.statSync(path.join(reelDir, "assets", f)).isFile()) fs.copyFileSync(path.join(reelDir, "assets", f), path.join(pub, f));

// --draft renders at 30 fps through the reel's own theme setting, half the frames of a final render
const draftConfig = args.includes("--draft") ? { ...config, theme: { ...(config.theme || {}), fps: 30 } } : config;
const inputProps = { slug, data, config: draftConfig, audio: voice ? `${slug}/${voice}` : null, guides: args.includes("--guides"), noCaption: !args.includes("--caption") }; // the word caption is off by default; pass --caption to show it
const browserExecutable = process.env.CHROME || undefined;   // when unset, Remotion downloads a browser that fits this system

function outputPath() {
  if (opt("--out")) return path.resolve(opt("--out"));
  const day = new Date().toLocaleDateString("en-CA");
  const outDir = path.join(dir, "output", day);
  fs.mkdirSync(outDir, { recursive: true });
  const mine = fs.readdirSync(outDir).find((f) => f.replace(/^\d+-/, "") === `${slug}.mp4`);
  if (mine) return path.join(outDir, mine);
  const n = new Set(fs.readdirSync(outDir).map((f) => f.slice(0, 2))).size + 1;
  return path.join(outDir, `${String(n).padStart(2, "0")}-${slug}.mp4`);
}

// Only SH_RENDER_SLOTS renders run together on this machine. Each is a webpack bundle (about 1.1 GB of node) plus
// Chrome, so many at once can run a 16 GB machine out of memory. Extra renders wait their turn.
const slotDir = path.join((await import("os")).tmpdir(), "showhow-render-slots");
fs.mkdirSync(slotDir, { recursive: true });
// Defaults to 1: parallel workflows, with their agents and tsc runs, already use most of the 16 GB.
const slots = Math.max(1, Number(process.env.SH_RENDER_SLOTS ?? 1));
let slot = null;
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };
for (let waited = 0; !slot; waited++) {
  for (let i = 0; i < slots && !slot; i++) {
    const f = path.join(slotDir, `${i}.lock`);
    try { fs.writeFileSync(f, String(process.pid), { flag: "wx" }); slot = f; } catch {
      // if the process holding a lock is gone (it crashed or got kill -9), the lock is released
      try { if (!alive(Number(fs.readFileSync(f, "utf-8")))) fs.rmSync(f, { force: true }); } catch {}
    }
  }
  if (!slot) {
    if (waited === 0) console.error(`waiting for a render slot (${slots} at once)...`);
    await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1000));
  }
}
process.on("exit", () => { try { fs.rmSync(slot, { force: true }); } catch {} });

// --public-only a,b: the bundle gets a public/ with just public/<slug> plus the named folders (saves disk; the whole one is ~0.5 GB)
let publicDir = path.join(dir, "public");
// By default only the public/ folders this reel refers to are bundled: its slug, the base slug of a -hN copy,
// and any public/<folder>/ named in its scenes or in src/. --full-public takes it all.
if (opt("--public-only") === undefined && !args.includes("--full-public")) {
  const base = slug.replace(/-h\d+$/, "");
  const sceneText = [slug, base].flatMap((s) => {
    const sd = path.join(dir, "reels", s, "scenes");
    return fs.existsSync(sd) ? fs.readdirSync(sd).filter((f) => /\.(tsx?|json)$/.test(f)).map((f) => fs.readFileSync(path.join(sd, f), "utf-8")) : [];
  }).join("\n") + fs.readdirSync(path.join(dir, "src"), { recursive: true }).filter((f) => /\.tsx?$/.test(f)).map((f) => fs.readFileSync(path.join(dir, "src", f), "utf-8")).join("\n");
  fs.mkdirSync(path.join(dir, "public"), { recursive: true });
  const keep = fs.readdirSync(path.join(dir, "public")).filter((d) => fs.statSync(path.join(dir, "public", d)).isDirectory()
    && (d === slug || d === base || sceneText.includes(`${d}/`)));
  publicDir = fs.mkdtempSync(path.join((await import("os")).tmpdir(), "showhow-public-"));
  for (const d of keep) fs.cpSync(path.join(dir, "public", d), path.join(publicDir, d), { recursive: true });
  for (const f of fs.readdirSync(path.join(dir, "public"))) // plus the files sitting directly in public/
    if (fs.statSync(path.join(dir, "public", f)).isFile()) fs.copyFileSync(path.join(dir, "public", f), path.join(publicDir, f));
} else if (opt("--public-only") !== undefined) {
  publicDir = fs.mkdtempSync(path.join((await import("os")).tmpdir(), "showhow-public-"));
  for (const d of [slug, ...opt("--public-only").split(",").filter(Boolean)])
    if (fs.existsSync(path.join(dir, "public", d))) fs.cpSync(path.join(dir, "public", d), path.join(publicDir, d), { recursive: true });
}
// every bundle puts a copy of public/ in the temp folder; remove it on exit, failed bundles included, so parallel builds do not fill the disk
let serveUrl = null;
const cleanup = () => {
  for (const p of [serveUrl, publicDir !== path.join(dir, "public") ? publicDir : null])
    if (p) try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
};
process.on("exit", cleanup);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { cleanup(); process.exit(1); });
// set SH_NO_CACHE=1 to turn off webpack's disk cache, which grows by about 1 GB per bundle under node_modules/.cache
serveUrl = await bundle({ entryPoint: path.join(dir, "src/index.ts"), publicDir, enableCaching: !process.env.SH_NO_CACHE });
const composition = await selectComposition({ serveUrl, id: "Showhow", inputProps, browserExecutable });
const fps = composition.fps;

if (opt("--stills")) {
  const out = path.join(reelDir, "stills");
  fs.mkdirSync(out, { recursive: true });
  for (const s of opt("--stills").split(",").map(Number)) {
    const output = path.join(out, `t_${s.toFixed(2).padStart(6, "0")}${inputProps.guides ? "_guides" : ""}.png`);
    await renderStill({ serveUrl, composition, inputProps, browserExecutable, scale: args.includes("--half") ? 0.5 : 1, frame: Math.min(composition.durationInFrames - 1, Math.round(s * fps)), output });
    console.log(output);
  }
} else {
  const outputLocation = outputPath();
  const frameRange = opt("--from") || opt("--to")
    ? [Math.round(Number(opt("--from") ?? 0) * fps), Math.min(composition.durationInFrames - 1, Math.round(Number(opt("--to") ?? 1e9) * fps))]
    : undefined;
  await renderMedia({
    serveUrl, composition, inputProps, browserExecutable, outputLocation, frameRange,
    codec: "h264", pixelFormat: "yuv420p",
    ...(args.includes("--draft") ? { scale: 0.5, crf: 30, x264Preset: "veryfast" } : { crf: 16, x264Preset: "slow" }), // --draft: half size, quick encode, never delivered
    concurrency: Number(opt("--concurrency") ?? 2), // Remotion would use half the cores by default, which opens too many Chrome tabs beside other builds
    onProgress: ({ progress }) => process.stdout.write(`\r${Math.round(progress * 100)}%`),
  });
  console.log(`\n${outputLocation}`);
}
