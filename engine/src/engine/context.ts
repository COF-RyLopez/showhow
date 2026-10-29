import { createContext, useContext } from "react";
import { useCurrentFrame } from "remotion";
import type { Ground, Theme } from "../theme";
import type { Scene, Timeline } from "./timeline";

export type ReelCtx = { theme: Theme; tl: Timeline };
export const ReelContext = createContext<ReelCtx | null>(null);
export const SceneContext = createContext<Scene | null>(null);

export function useReel(): ReelCtx {
  const c = useContext(ReelContext);
  if (!c) throw new Error("useReel outside <Reel>");
  return c;
}

// The toolkit a scene component gets. Frames count from the start of the reel, so a cue compares directly with `f`.
export function useScene() {
  const { theme, tl } = useReel();
  const scene = useContext(SceneContext);
  if (!scene) throw new Error("useScene outside a scene");
  const f = useCurrentFrame();
  const ground: Ground = theme.grounds[scene.ground];
  return {
    f,
    fps: tl.fps,
    theme,
    ground,
    scene,
    /** frame where the word begins to be spoken (looked up in this scene) */
    cue: (token: string, nth = 1) => tl.cue(token, nth, scene.index),
    /** frame where the word has finished being spoken */
    cueEnd: (token: string, nth = 1) => tl.cueEnd(token, nth, scene.index),
    /** first frame of a `dur`-frame build that has to END right as the word begins */
    endsOn: (token: string, dur: number, nth = 1) => tl.cue(token, nth, scene.index) - dur,
  };
}
