#!/usr/bin/env node
// Showhow MCP server, free version. It runs on your own machine over stdio and gives an agent (Claude Code, or any
// MCP client) the deterministic steps of a reel: make the folder, voice it, time it, check it, draft it, render it.
// The agent writes the script and draws the scenes; every check here answers PASS or FAIL with the reasons.
// Nothing leaves your machine except the ElevenLabs call in `voice`, with your own key from .env.local
// (`voice_free` voices with Kokoro locally instead, no key).
//   claude mcp add showhow -- node /path/to/showhow/mcp/server.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = path.join(ROOT, "engine");
const REELS = path.join(ENGINE, "reels");
const PY = process.env.SH_PYTHON || "python3";
const VERSION = "0.1.0";
const SLUG = /^[a-z0-9][a-z0-9-]{0,60}$/;

// one step = one command in the engine folder; the result is its exit code and the last of its output
function run(cmd, args, timeoutMs = 30 * 60_000) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: ENGINE, env: process.env });
    let out = "";
    const keep = (d) => { out = (out + d).slice(-12_000); };
    p.stdout.on("data", keep);
    p.stderr.on("data", keep);
    const timer = setTimeout(() => { p.kill("SIGTERM"); out += "\n(timed out)"; }, timeoutMs);
    p.on("close", (code) => { clearTimeout(timer); resolve({ pass: code === 0, out: out.replace(/\r[^\n]*(?=\r)/g, "").trim() }); });
    p.on("error", (e) => { clearTimeout(timer); resolve({ pass: false, out: String(e) }); });
  });
}

const reelDir = (slug) => {
  if (!SLUG.test(slug || "")) throw new Error("slug: lowercase letters, digits and dashes");
  return path.join(REELS, slug);
};
const needReel = (slug) => {
  const d = reelDir(slug);
  if (!fs.existsSync(d)) throw new Error(`no reel "${slug}": call new_reel first`);
  return d;
};
const latestRender = (slug) => {
  const out = path.join(ENGINE, "output");
  if (!fs.existsSync(out)) return null;
  const all = fs.readdirSync(out).flatMap((day) => {
    const d = path.join(out, day);
    return fs.statSync(d).isDirectory() ? fs.readdirSync(d).filter((f) => f.replace(/^\d+-/, "") === `${slug}.mp4`).map((f) => path.join(d, f)) : [];
  });
  return all.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] ?? null;
};
const verdict = (steps) => ({ pass: steps.every((s) => s.pass), steps });

const SCENE_STUB = (name) => `import React from "react";
import { useScene } from "../../../src/engine";

// ${name}: draw what the voice says here, on a canvas or in SVG, as one function of the frame.
// cue("word") is the frame that word starts; every move starts on a cue.
export const ${name}: React.FC = () => {
  const { f, cue, ground } = useScene();
  return <div style={{ position: "absolute", inset: 0, background: ground.bg }} />;
};
`;

const TOOLS = {
  new_reel: {
    description: "Make a reel folder with its script, caption, config and one scene stub per scene. Write the script first: each scene is a line \"== id\" in the caption.",
    input: { slug: "string", script: "string: the words the voice says; a blank line between paragraphs", caption: "string: caption.txt (== id | ground: dark, one caption block a line, *key* word marks)", voice_id: "string, optional: an ElevenLabs voice id" },
    required: ["slug", "script", "caption"],
    async run({ slug, script, caption, voice_id }) {
      const d = reelDir(slug);
      if (fs.existsSync(d)) throw new Error(`reel "${slug}" already exists`);
      fs.mkdirSync(path.join(d, "scenes"), { recursive: true });
      fs.writeFileSync(path.join(d, "script.txt"), script.trim() + "\n");
      fs.writeFileSync(path.join(d, "caption.txt"), caption.trim() + "\n");
      fs.writeFileSync(path.join(d, "reel.json"), JSON.stringify({
        voice: { id: voice_id || "YOUR_VOICE_ID", model: "eleven_multilingual_v2", speed: 1.0, stability: 0.5, similarity: 0.8, style: 0.0 },
        theme: { motion: "measured", handover: "continuous" },
      }, null, 2) + "\n");
      const ids = [...caption.matchAll(/^==\s*([a-z0-9_-]+)/gim)].map((m) => m[1]);
      const name = (id) => id.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase());
      for (const id of ids) fs.writeFileSync(path.join(d, "scenes", `${name(id)}.tsx`), SCENE_STUB(name(id)));
      fs.writeFileSync(path.join(d, "scenes", "index.tsx"),
        `import type { SceneMap } from "../../../src/engine/Stage";\n${ids.map((id) => `import { ${name(id)} } from "./${name(id)}";`).join("\n")}\n\nexport const scenes: SceneMap = { ${ids.map((id) => `${JSON.stringify(id)}: ${name(id)}`).join(", ")} };\n`);
      return { pass: true, folder: d, scenes: ids };
    },
  },
  voice: {
    description: "Voice the script with ElevenLabs (your key in .env.local), check the last line was spoken, then put every pause in real silence so no word is cut.",
    input: { slug: "string" },
    required: ["slug"],
    async run({ slug }) {
      needReel(slug);
      const a = await run(PY, ["scripts/voice.py", slug]);
      if (!a.pass) return verdict([{ step: "voice", ...a }]);
      return verdict([{ step: "voice", ...a }, { step: "tighten", ...(await run(PY, ["scripts/tighten.py", slug])) }]);
    },
  },
  voice_free: {
    description: "Voice the script with Kokoro, the open model that runs on this machine with no key (models/kokoro-v1.0.onnx and voices-v1.0.bin), time it with faster-whisper, then put every pause in real silence. Use instead of voice when there is no ElevenLabs key.",
    input: { slug: "string", voice: "Kokoro voice, e.g. af_heart (the default, or reel.json \"kokoro\"), af_bella, am_michael, bf_emma" },
    required: ["slug"],
    async run({ slug, voice }) {
      needReel(slug);
      const a = await run(PY, ["scripts/kokoro.py", slug, ...(voice ? ["--voice", voice] : [])]);
      if (!a.pass) return verdict([{ step: "voice", ...a }]);
      return verdict([{ step: "voice", ...a }, { step: "tighten", ...(await run(PY, ["scripts/tighten.py", slug])) }]);
    },
  },
  align: {
    description: "Time every caption word to the voice and write words.json. Run after voice, and again after any caption change.",
    input: { slug: "string" },
    required: ["slug"],
    async run({ slug }) {
      needReel(slug);
      return verdict([{ step: "align", ...(await run(PY, ["scripts/align.py", slug])) }]);
    },
  },
  sound: {
    description: "Mix the reel's sound into sound.wav: the voice, a click on every key word, a whoosh and low hit at each scene change, and a pad that ducks under the voice. All synthesised, no downloads. Run after align (and again after any new voice or caption); render then plays it.",
    input: { slug: "string", bed: "string, optional: \"no\" to leave out the pad", sfx: "string, optional: \"no\" to leave out the hits" },
    required: ["slug"],
    async run({ slug, bed, sfx }) {
      needReel(slug);
      const k = [...(bed === "no" ? ["--no-bed"] : []), ...(sfx === "no" ? ["--no-sfx"] : [])];
      return verdict([{ step: "sound", ...(await run(PY, ["scripts/sound.py", slug, ...k])) }]);
    },
  },
  check_plan: {
    description: "Before drawing: caption blocks, key words, scene changes inside silence, pace, and type sizes in the scenes. PASS or FAIL.",
    input: { slug: "string" },
    required: ["slug"],
    async run({ slug }) {
      needReel(slug);
      return verdict([{ step: "check plan", ...(await run(PY, ["scripts/check.py", "plan", slug])) }]);
    },
  },
  typecheck: {
    description: "Type-check the engine and every reel's scenes.",
    input: {},
    required: [],
    async run() {
      return verdict([{ step: "typecheck", ...(await run("node", [path.join(ROOT, "node_modules/typescript/bin/tsc"), "--noEmit", "-p", "."])) }]);
    },
  },
  stills: {
    description: "Render still frames at the given seconds (half size), to look at before any video. Returns the PNG paths.",
    input: { slug: "string", seconds: "array of numbers" },
    required: ["slug", "seconds"],
    async run({ slug, seconds }) {
      needReel(slug);
      const r = await run("node", ["render.mjs", slug, "--stills", seconds.map(Number).join(","), "--half"]);
      return { ...verdict([{ step: "stills", ...r }]), files: r.out.split("\n").filter((l) => l.endsWith(".png")) };
    },
  },
  draft: {
    description: "Render the moving DRAFT: the real drawn video at half size, stamped DRAFT and not checked yet. Show it before the final render.",
    input: { slug: "string" },
    required: ["slug"],
    async run({ slug }) {
      needReel(slug);
      const r = await run("node", ["draft.mjs", slug, "--no-open"]);
      return { ...verdict([{ step: "draft", ...r }]), file: r.out.split("\n").filter((l) => l.endsWith(".mp4")).pop() ?? null };
    },
  },
  render: {
    description: "Render the final reel at 1080x1920, 60 fps, then level its sound to -14 LUFS (the video is copied untouched).",
    input: { slug: "string" },
    required: ["slug"],
    async run({ slug }) {
      needReel(slug);
      const r = await run("node", ["render.mjs", slug, "--concurrency", "4"], 90 * 60_000);
      const file = latestRender(slug);
      if (!r.pass || !file) return { ...verdict([{ step: "render", ...r }]), file };
      const l = await run(PY, ["scripts/loud.py", file, "--fix"]);
      const fixed = file.replace(/\.mp4$/, ".loud.mp4");
      if (fs.existsSync(fixed)) fs.renameSync(fixed, file);
      return { ...verdict([{ step: "render", ...r }, { step: "level sound", ...l }]), file };
    },
  },
  check_render: {
    description: "Every check on the latest render: dead holds and bare handovers, motion too fast to follow, cuts at scene changes, loudness. PASS only when all pass.",
    input: { slug: "string", keep: "array of scene ids, optional: scenes whose next scene carries on in the same world" },
    required: ["slug"],
    async run({ slug, keep = [] }) {
      const d = needReel(slug);
      const mp4 = latestRender(slug);
      if (!mp4) throw new Error(`no render of "${slug}" yet: call render first`);
      const words = path.join(d, "words.json");
      const k = keep.length ? ["--keep", keep.join(",")] : [];
      return { file: mp4, ...verdict([
        { step: "check render", ...(await run(PY, ["scripts/check.py", "render", slug, mp4])) },
        { step: "motion", ...(await run(PY, ["scripts/motion.py", mp4, "--words", words, ...k])) },
        { step: "joins", ...(await run(PY, ["scripts/joins.py", slug, mp4, "--sheet", path.join(d, "joins-sheet.jpg")])) },
        { step: "loudness", ...(await run(PY, ["scripts/loud.py", mp4])) },
      ]) };
    },
  },
  list_reels: {
    description: "List the reels in this folder and how far each has got.",
    input: {},
    required: [],
    async run() {
      if (!fs.existsSync(REELS)) return { reels: [] };
      return {
        reels: fs.readdirSync(REELS).filter((s) => fs.statSync(path.join(REELS, s)).isDirectory()).map((slug) => {
          const has = (f) => fs.existsSync(path.join(REELS, slug, f));
          return { slug, voiced: has("voice.mp3"), aligned: has("words.json"), drafted: has(`draft/${slug}-DRAFT.mp4`), rendered: latestRender(slug) };
        }),
      };
    },
  },
};

const schema = (t) => ({
  type: "object",
  properties: Object.fromEntries(Object.entries(t.input).map(([k, d]) => [k, d.startsWith("array")
    ? { type: "array", items: { type: d.includes("numbers") ? "number" : "string" }, description: d }
    : { type: "string", description: d }])),
  required: t.required,
});

async function handle(msg) {
  const { id, method, params } = msg;
  const ok = (result) => ({ jsonrpc: "2.0", id, result });
  if (method === "initialize")
    return ok({ protocolVersion: params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "showhow", version: VERSION },
      instructions: "Showhow by Sirio, free version. Order: new_reel, voice (or voice_free with no ElevenLabs key), align, sound, check_plan, draw the scenes, typecheck, stills, draft (show it), render, check_render. Fix every FAIL before delivering." });
  if (method === "tools/list")
    return ok({ tools: Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, inputSchema: schema(t) })) });
  if (method === "tools/call") {
    const t = TOOLS[params?.name];
    if (!t) return { jsonrpc: "2.0", id, error: { code: -32602, message: `unknown tool ${params?.name}` } };
    try {
      const r = await t.run(params.arguments ?? {});
      return ok({ content: [{ type: "text", text: JSON.stringify(r, null, 2) }], isError: r.pass === false });
    } catch (e) {
      return ok({ content: [{ type: "text", text: String(e.message ?? e) }], isError: true });
    }
  }
  if (method === "ping") return ok({});
  if (id === undefined) return null; // a notification
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `no method ${method}` } };
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const reply = await handle(msg);
  if (reply) process.stdout.write(JSON.stringify(reply) + "\n");
});
