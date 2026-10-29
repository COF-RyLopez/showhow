<p align="center"><img src="docs/banner.png" alt="showhow, from tein" width="100%"></p>

# showhow

**Explainer reels drawn in code.** You write the script. An agent draws the scenes. Showhow voices it, times every move to
a spoken word, renders it at 1080×1920 and 60 fps, and checks it before anyone sees it. No presenter, no stock footage,
no cuts.

Free and open source, from [tein](https://tein.ai): one cheap API, MCP and workflows for every AI model provider.

<p><a href="https://tein.ai/waitlist"><img src="docs/join-tein.png" alt="Join tein" height="52"></a></p>

## Watch

Two full reels, with voice and music, made with the same engine and checks. Click one to watch it with sound.

<table>
<tr>
<td align="center" width="50%"><a href="https://sirioberati.github.io/showhow/#airplanes"><img src="docs/airplanes.gif" alt="How a wing really makes lift" width="300"></a><br><b>How a wing really makes lift</b> · 65 s · <a href="https://sirioberati.github.io/showhow/#airplanes">watch ▶</a></td>
<td align="center" width="50%"><a href="https://sirioberati.github.io/showhow/#world"><img src="docs/world.gif" alt="What if the Earth were flat?" width="300"></a><br><b>What if the Earth were flat?</b> · 58 s · <a href="https://sirioberati.github.io/showhow/#world">watch ▶</a></td>
</tr>
<tr>
<td valign="top">The myth, the Cambridge smoke test, pressure, speed and flaps. A Boeing 737 drawn in code, every part on its word.</td>
<td valign="top">On a disc built from Earth's own rock, gravity pulls toward the pole: balls roll, oceans pool, and the walk to the edge is all uphill.</td>
</tr>
</table>

## The demos

Three reels ship in this repo, voiced and timed, so each one renders with no key. Every one passes every check below.
Click one to watch it with sound.

<table>
<tr>
<td align="center" width="33%"><a href="https://sirioberati.github.io/showhow/#demo"><img src="docs/demo.gif" alt="A block falls and the camera circles it" width="240"></a><br><b>demo</b> · 8 s · <a href="https://sirioberati.github.io/showhow/#demo">watch ▶</a></td>
<td align="center" width="33%"><a href="https://sirioberati.github.io/showhow/#pendulum"><img src="docs/pendulum.gif" alt="Three pendulums keep time" width="240"></a><br><b>pendulum</b> · 12 s · <a href="https://sirioberati.github.io/showhow/#pendulum">watch ▶</a></td>
<td align="center" width="33%"><a href="https://sirioberati.github.io/showhow/#gears"><img src="docs/gears.gif" alt="A small gear turns a big one" width="240"></a><br><b>gears</b> · 14 s · <a href="https://sirioberati.github.io/showhow/#gears">watch ▶</a></td>
</tr>
<tr>
<td valign="top">A block falls under real gravity, lands on its word, and the camera circles it. The smallest possible reel.</td>
<td valign="top">Big and small swings keep the same time, and a string a quarter as long swings twice as fast. The swing is the real pendulum equation, solved frame by frame.</td>
<td valign="top">A 10-tooth gear turns a 30-tooth gear a third of a turn, the other way, with three times the force. The teeth mesh at every frame.</td>
</tr>
</table>

The demo voices are Matilda, an ElevenLabs stock voice.

## How it works

<p align="center"><img src="docs/architecture.png" alt="Architecture: script, voice, tighten, align, then scenes, camera, engine, render, then the checks" width="100%"></p>

1. **Sound.** The script is voiced by ElevenLabs in one take, with the time of every character. Pauses are shortened
   inside real silence, so no word is clipped. Then every caption word gets its frame in `words.json`.
2. **Picture.** Each scene is a React component drawing on a canvas through a small pinhole camera. Every move starts on
   `cue("word")`, and every value is a pure function of the frame, so any frame renders on its own.
3. **Checks.** The render is measured: too fast to follow, a cut, a freeze, a bad scene change, the wrong loudness. Each
   check prints PASS or FAIL with the reason. A FAIL goes back to its scene.

## Quick start

Needs Node 22.12+, Python 3 with `numpy` and `Pillow`, and `ffmpeg`.

```bash
npm install
pip3 install numpy Pillow
cd engine
node render.mjs pendulum
```

The render lands in `engine/output/<date>/`. For a quick look first, `node draft.mjs pendulum` makes a half-size draft
stamped DRAFT, and `node render.mjs pendulum --stills 2.6,9.6 --half` saves single frames.

## Make your own reel

You need an [ElevenLabs](https://elevenlabs.io) key for the voice, and
[whisper.cpp](https://github.com/ggerganov/whisper.cpp) (`brew install whisper-cpp`) with `ggml-small.en.bin` in
`models/`, which confirms the last line of each take was really spoken.

```bash
cp .env.example .env.local     # then put your ElevenLabs key in it
```

The key stays on your machine. It is only sent to ElevenLabs.

### From Claude Code

```bash
claude mcp add showhow -- node "$(pwd)/mcp/server.mjs"
```

Then ask: *"make a showhow reel about why ice floats"*. The agent reads `skill/SKILL.md`, writes the script, waits for
your approval, and works through the tools:

| Tool | What it does |
|---|---|
| `new_reel` | makes the folder: script, caption, config and a stub per scene |
| `voice` | voices the script with ElevenLabs and puts every pause in real silence |
| `align` | times every caption word and writes `words.json` |
| `check_plan` | checks the caption and timing before anything is drawn |
| `typecheck` | type-checks the engine and every scene |
| `stills` | renders single frames at the seconds you pick |
| `draft` | renders the half-size DRAFT to watch before the final |
| `render` | renders the final reel and levels its sound |
| `check_render` | runs every check on the final render |
| `list_reels` | lists the reels and how far each has got |

For bigger reels, copy `workflow/express.workflow.js` into `.claude/workflows/`. It runs two builders in parallel, makes
the DRAFT, then reviews the whole reel and renders it.

### By hand

```bash
cd engine
python3 scripts/voice.py my-reel        # ElevenLabs, voice id in reels/my-reel/reel.json
python3 scripts/tighten.py my-reel
python3 scripts/align.py my-reel
python3 scripts/check.py plan my-reel
node draft.mjs my-reel
node render.mjs my-reel
```

## The checks

| Check | Fails when |
|---|---|
| `check.py plan` | a caption block runs over 8 words, or a scene change falls outside silence |
| `check.py render` | nothing moves for over 1.2 s, or the ground shows bare at a scene change |
| `motion.py` | a move is too fast to follow, a cut or snap, a freeze then a jump, or a scene under 2 s |
| `joins.py` | one frame swaps the picture at a scene change (it also writes a sheet of every change) |
| `loud.py` | the sound is off −14 LUFS, or peaks above −1.5 dBTP (`--fix` levels it) |

A check that could not run counts as a FAIL.

## What's inside

```
engine/
  src/engine/        the engine: timeline, stage, caption, motion verbs, pinhole camera
  scripts/           voice, tighten, align, and the five checks
  reels/             demo, pendulum, gears: script, caption, voice, timing, scenes
  render.mjs         renders stills, a time range, or the whole reel
  draft.mjs          the half-size DRAFT
mcp/server.mjs       the local MCP server (stdio, no dependencies)
workflow/            the Express workflow for Claude Code
skill/SKILL.md       the guide an agent reads first
```

Built on [Remotion](https://www.remotion.dev), React and canvas 2D. Voice by [ElevenLabs](https://elevenlabs.io).

## Join tein

tein is one API for AI image, video, audio and language models, priced below market. One key and one bill across the
model providers: Seedance, Kling, Nano Banana, GPT Image, Claude, Wan, Qwen and more.

- **A cheap API.** Every model through one endpoint, for less than going direct. [Pricing](https://tein.ai/pricing)
- **MCP.** Plug tein into Claude Code or any MCP client and call every model from your agent. [MCPs](https://tein.ai/mcps)
- **Workflows.** Ready-made pipelines that chain models into one result. [Workflows](https://tein.ai/workflows)
- **Open source.** Free projects like this one, to run and change yourself. [Open source](https://tein.ai/open-source)

<p><a href="https://tein.ai/waitlist"><img src="docs/join-tein.png" alt="Join tein" height="52"></a></p>

## License

MIT, by Sirio Berati.
