export const meta = {
  name: 'showhow-express',
  description: 'Showhow Express: one reel from an approved script. Voice and caption, a plan, two builders in parallel, a moving DRAFT, then one review and the checked render',
  whenToUse: 'After the script is approved. Args: {slug, root} where root is the Showhow folder and engine/reels/<slug>/script.txt holds the approved script',
  phases: [
    { title: 'Prepare', detail: 'voice, caption, timing, the plan and scene stubs' },
    { title: 'Build', detail: 'two builders draw the scenes in parallel, each checking its own motion' },
    { title: 'Draft', detail: 'the drawn, moving video at half size, stamped DRAFT' },
    { title: 'Deliver', detail: 'a fresh-eyes review of the whole reel, the render and every check' },
  ],
}

// Copy this file to .claude/workflows/ in your project to run it from Claude Code.
const A = args || {}
if (!A.slug || !A.root) throw new Error('args: {slug, root}')
const SLUG = A.slug
const ENGINE = `${A.root}/engine`
const REEL = `${ENGINE}/reels/${SLUG}`
const GUIDE = `${A.root}/skill/SKILL.md`

const ROLE = `You are working on one Showhow reel. It lives in ${REEL}. The engine is ${ENGINE}; run every command from inside it.
Read ${GUIDE} in full first, then ${REEL}/plan.md if it exists. Draw on a canvas through the pinhole camera
(src/engine/camera.ts): no 3D library and no 3D models. Look at half-size stills (render.mjs --stills ... --half), one per word cue
that changes the picture, never at a fixed interval.`

const SENSE = `First, does it make sense three ways. Physical: gravity holds, nothing floats, vanishes or appears from nowhere,
whatever loses its support falls the full distance. Story: one chain of cause then effect on objects already seen, that a
stranger could retell from the pictures alone. Visual: one change at a time where the eye already is, what the voice names is
centred and whole, no label over a number. Then the motion: every camera move slow and eased, every new picture readable
for about 2 s, no cut, fade or snap inside a world, the subject filling the frame.`

const MOTION = `Render your stretch as a draft (node render.mjs ${SLUG} --draft --from a --to b --out /tmp/${SLUG}-part.mp4) and run
python3 scripts/motion.py /tmp/${SLUG}-part.mp4 --words reels/${SLUG}/words.json --keep <keep scene ids from plan.md> --offset a.
Fix every FAIL by spreading the move over more frames, keeping the energy.`

const SCENES = {
  type: 'object',
  properties: {
    world: { type: 'string' },
    scenes: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, component: { type: 'string' }, words: { type: 'string' }, picture: { type: 'string' },
    }, required: ['id', 'component', 'words', 'picture'] } },
  },
  required: ['world', 'scenes'],
}

const quiet = (p) => p.then(() => true, (e) => { log(`failed: ${e && e.message}`); return false })

phase('Prepare')
const prep = await agent(`${ROLE}

1. script.txt is approved: do not change a word. Voice it in one take: python3 scripts/voice.py ${SLUG}, then python3 scripts/tighten.py ${SLUG}.
   If it stops for a missing key or voice id, stop and return that: keys live only in .env.local, never in chat.
2. Write caption.txt (the guide, "caption.txt"): one scene per group of sentences, the first with id "hook" holding only the
   first sentence. Run python3 scripts/align.py ${SLUG}, then python3 scripts/check.py plan ${SLUG} until it returns 0.
3. Write plan.md: the one or two worlds the reel happens in, every scene that carries on in the same world marked keep, then per
   scene its words, the real thing it shows and word -> what changes. Read it once against the three ways it must make sense
   and fix it in place.
4. A stub per scene in scenes/, and scenes/index.tsx mapping every scene id. Done when node ../node_modules/typescript/bin/tsc --noEmit -p .
   passes and one still renders.
Return the world in one line and every scene with a PascalCase component name.`,
  { label: 'prepare', phase: 'Prepare', schema: SCENES, model: 'sonnet' })

phase('Build')
const half = Math.ceil(prep.scenes.length / 2)
const parts = [prep.scenes.slice(0, half), prep.scenes.slice(half)].filter((p) => p.length)
log(`${prep.scenes.length} scenes in ${parts.length} builders`)
const built = await Promise.all(parts.map((part, i) => quiet(agent(`${ROLE}

You build these scenes, in order, so the handovers between them are yours${i ? '' : ' (the hook first: frame one shows the first sentence literally)'}:
${part.map((x) => `- "${x.id}" in ${REEL}/scenes/${x.component}.tsx (prefix helpers with ${x.component}). Words: ${x.words}. Picture: ${x.picture}`).join('\n')}
The world of the reel: ${prep.world}. Another builder is working on the other scenes right now: touch only your files and the
shared world file you both read. Every move starts on cue("word"). When done, check your own work: ${SENSE}
${MOTION} Return what you built and anything still wrong.`,
  { label: `build ${part.map((x) => x.id).join('+')}`, phase: 'Build', model: 'sonnet' }))))
log(`${built.filter(Boolean).length} of ${parts.length} builders finished`)

phase('Draft')
const draftPath = await agent(`From ${ENGINE}, run: node draft.mjs ${SLUG}. If it fails because a scene is mid-edit, wait a minute
and run it once more. Change no file. Return the path it printed, or the error.`,
  { label: 'moving draft', phase: 'Draft', model: 'haiku', effort: 'low' })
log(`DRAFT: ${draftPath}`)

phase('Deliver')
return await agent(`${ROLE}

Nobody built this reel in front of you.
1. Review: one half-size still per word cue across the reel, laid out as one contact sheet. ${SENSE} Fix every note in its scene.
2. Render: node render.mjs ${SLUG} --concurrency 4. Then run on the file it printed:
   python3 scripts/check.py render ${SLUG} <mp4>
   python3 scripts/motion.py <mp4> --words reels/${SLUG}/words.json --keep <keep scene ids>
   python3 scripts/joins.py ${SLUG} <mp4> --sheet reels/${SLUG}/joins-sheet.jpg (look at the sheet)
   python3 scripts/loud.py <mp4> --fix, then replace the render with the .loud.mp4 it wrote
   A FAIL is fixed in its scene and the reel rendered again. A check that could not run counts as a FAIL.
   If less than 2 GB of disk is free, stop and say so.
Return the final path, its length, each check's PASS or FAIL, and anything left unfixed.`,
  { label: 'review + render', phase: 'Deliver', model: 'sonnet' })
