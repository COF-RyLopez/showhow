---
name: showhow
description: Make a narrated, fully animated explainer reel (1080x1920, 60 fps) with Showhow, free version. A voice, every picture drawn in code on a canvas through a pinhole camera, every move on a spoken word, and checks that pass or fail every render. Use for "make a Showhow reel about X", or to edit or re-render a reel in engine/reels/.
---

# Showhow by Sirio, free version

A reel is a voice and a picture. The picture is drawn in code, frame by frame, on a canvas with a hand-written pinhole
camera. Every move starts on a word the voice says. There is no presenter and no cut.

## The order

1. **Script.** Write it, then get the person's approval before anything else. Plain spoken sentences, the first one is the
   hook and says what the reel is about. Save it as `engine/reels/<slug>/script.txt`, a blank line between paragraphs.
2. **Voice.** `python3 scripts/voice.py <slug>` (ElevenLabs, the key in `.env.local`, the voice id in `reel.json`), then
   `python3 scripts/tighten.py <slug>`, which puts every pause inside real silence so no word is ever cut.
   To pick a voice: `python3 scripts/voice.py <slug> --audition id:label,id:label`.
   No ElevenLabs key: `python3 scripts/kokoro.py <slug> [--voice af_heart]` (the `voice_free` tool) voices it with the
   open Kokoro model on this machine instead; run `tighten.py` after it the same way.
3. **Caption and timing.** Write `caption.txt` (below), run `python3 scripts/align.py <slug>`, then
   `python3 scripts/check.py plan <slug>` until it returns 0. Then `python3 scripts/sound.py <slug>` mixes
   `sound.wav`: a click on every `*key*` word, a whoosh and low hit at each scene change, and a pad that ducks
   under the voice, all synthesised. The render plays it instead of the bare voice. Run it again after any new
   voice or caption (the render warns and falls back to the voice when it is stale). `--no-bed` or `--no-sfx`
   leave a part out.
4. **Plan.** `plan.md`: the one or two worlds the reel happens in, which scenes carry on in the same world, and for each
   scene its words, the real thing it shows and word -> what changes.
5. **Scenes.** One component per scene in `scenes/`, mapped by id in `scenes/index.tsx`. Look at half-size stills
   (`node render.mjs <slug> --stills 1.2,3.4 --half`) at the word cues that change the picture.
6. **DRAFT.** `node draft.mjs <slug>`: the real drawn video at half size, stamped DRAFT. Show it before the final render.
7. **Render and check.** `node render.mjs <slug>`, then every check below. Nothing is delivered with a FAIL.

All commands run from `engine/`. The Express workflow in `workflow/` runs steps 2 to 7 with parallel builders, and the MCP
server in `mcp/` exposes each step as a tool.

## It must make sense three ways

- **Physical.** Gravity holds. Nothing floats, vanishes or appears from nowhere. Whatever loses its support falls the full
  distance, starting slowly. Use real sizes and real gravity (9.81 m/s², which is 9.81/3600 m per frame² at 60 fps).
- **Story.** One chain of cause then effect, on objects already seen, that a stranger could retell from the pictures alone.
- **Visual.** One change at a time, where the eye already is. What the voice names is centred and whole. No label over a
  number. Every new picture holds about 2 s before the camera leaves it.

## Craft

What separates a drawn reel from a generic one. Each rule is checked by eye on the stills, not by a script.

- **No linear motion.** Every move eases (`ease.*`, `spline`); a straight `prog(..., (x) => x)` is for typing text only.
- **Entrances move two or three things at once** (fade with a rise, a scale or a draw), and things that arrive
  together are staggered 3 to 6 frames apart (`stagger`). Nothing pops in alone and flat.
- **Exits are faster than entrances**, about half the time.
- **One hero colour.** The accent (`theme.marker.color`) marks the one thing the voice names, at most one element a
  frame; everything else stays in the reel's neutrals.
- **Light and depth, not flat fills.** A soft pool of light behind the subject, a surface it stands on with a contact
  shadow, gradients instead of single colours, a vignette on top. Grain, if any, is a fixed texture: grain that
  changes every frame would hide a frozen picture from the stillness check.
- **No blur filters on a canvas** (`ctx.filter = "blur(...)"`): they make a render about ten times slower. Fake soft
  focus with radial gradients that fade to transparent.
- **Draw icons, never emoji**: emoji render in their own colours and ignore the palette.
- **Type**: weight 600 to 800 for anything that must be read, never under 32 px.

## caption.txt

```
== hook | ground: dark                 opens a scene: its id (its key in scenes/index.tsx) and its ground (dark or light)
This *block*                           each line is one caption block, at most two lines on screen
is drawn with *code,*                  *word* marks the block's key word, which gets the selection box
and the only thing / holding it *up*   " / " breaks the line there
@bottom / @top                         moves the caption slot, from the next block on
# a comment
```

The caption is the script. It is never transcribed from the voice. The word caption is off in renders by default; pass
`--caption` to show it.

## A scene

```tsx
import React from "react";
import { useScene, prog, ease } from "../../../src/engine";

export const Drop: React.FC = () => {
  const { f, cue, ground } = useScene();     // f: the frame; cue("word"): the frame that word starts
  const land = prog(f, cue("lands"), 24, ease.out);   // 0 to 1 over 24 frames from "lands"
  return <div style={{ position: "absolute", inset: 0, background: ground.bg }}>{/* draw here */}</div>;
};
```

Every value is a pure function of the frame, so any frame renders on its own. For a world in depth, draw on a
`<canvas width={1080} height={1920}>` in a `useLayoutEffect`, through the camera in `src/engine/camera.ts`:

- `project(cam, [x, y, z])` gives the screen point, its depth for sorting and its scale.
- `orbit(target, yaw, pitch, distance)` places the camera around a target.
- `spline(f, [[frame, value], ...])` joins keys on word cues with a smooth curve that never jumps and keeps moving through
  the middle keys.

**One continuous world.** When two scenes happen in the same place, draw that world from the reel's frame in one shared
component, and use it in both scenes (see `reels/demo`). With `"handover": "continuous"` in `reel.json` the next scene takes
over on its first frame, so the picture never jumps. List those scenes as keep scenes for the motion check.

`src/engine/moves.ts` has the motion verbs: `prog`, `ease`, `arrive`, `leave`, `blurIn`, `blurOut`, `pop`, `typeOn`,
`countTo`, `draw`, `stagger`, `mix`. `theme.ts` holds every value a reel may override in `reel.json` under `"theme"`.

## The checks

Each prints PASS or FAIL with the reason and exits 1 on a FAIL. A check that could not run counts as a FAIL.

| Command | What fails |
|---|---|
| `check.py plan <slug>` | a caption block over 8 words, two key words in a block, a scene change outside silence (it also warns on type under 32 px) |
| `check.py render <slug> <mp4>` | nothing moving for over 1.2 s, bare ground during a scene change |
| `motion.py <mp4> --words reels/<slug>/words.json --keep a,b` | a move too fast to follow inside a world, a cut or snap, a near-freeze then a jump, a scene under 2 s |
| `joins.py <slug> <mp4> --sheet out.jpg` | a scene change where one frame swaps the picture; the sheet shows every change |
| `speed.py <mp4>` | the camera speed check on its own, for any clip |
| `loud.py <mp4> [--fix]` | sound away from -14 LUFS or peaks above -1.5 dBTP; `--fix` levels it, video untouched |

## Keys

Keys go in `.env.local` at the top of the repo (`ELEVENLABS_API_KEY=...`). Never ask for one in chat and never commit one.
