// Reels register on their own: the bundler picks up every reels/<slug>/scenes/index.tsx and names it after its folder.
// Each reel lives in its own folder; this file only collects them, so adding a reel never means editing it.
import type { SceneMap } from "../src/engine/Stage";

// @ts-ignore: require.context comes from the bundler; plain Node does not have it
const found = require.context("./", true, /^\.\/[^/]+\/scenes\/index\.tsx$/);
export const reels: Record<string, SceneMap> = Object.fromEntries(
  (found.keys() as string[]).map((k) => [k.split("/")[1], (found(k) as { scenes: SceneMap }).scenes]),
);
