// Layers from back to front: ground, stage, caption, pinned chrome. No camera, no cuts; all timing comes from the voice.
// The audio is the voice, or sound.wav when scripts/sound.py has mixed hits and a bed under it.
import React, { useEffect, useMemo, useState } from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, staticFile } from "remotion";
import { theme as base, withOverrides } from "./theme";
import { fontsReady } from "./fonts";
import { ReelContext } from "./engine/context";
import { setEntrance } from "./engine/moves";
import { buildTimeline, type ReelConfig, type ReelData } from "./engine/timeline";
import { Ground } from "./engine/Ground";
import { Stage } from "./engine/Stage";
import { Caption } from "./engine/Caption";
import { Chrome } from "./engine/Chrome";
import { reels } from "../reels";

export type ReelProps = { slug: string; data: ReelData; config: ReelConfig; audio: string | null; guides?: boolean; noCaption?: boolean };

// Layout bands plus the areas Instagram covers with its own UI. Turned on by --guides, meant for stills.
const Guides: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: "monospace", fontSize: 22, color: "#ff3b7f" }}>
    {[[300, "caption"], [520, "stage"], [1450, "stage ends"], [1600, "chrome"]].map(([y, label]) => (
      <div key={label} style={{ position: "absolute", top: y as number, left: 0, right: 0, borderTop: "2px dashed #ff3b7f" }}>&nbsp;{label} {y}</div>
    ))}
    <div style={{ position: "absolute", top: 1700, bottom: 0, left: 0, right: 0, background: "rgba(255,59,127,0.16)" }}>&nbsp;Instagram caption + buttons</div>
    <div style={{ position: "absolute", top: 1100, bottom: 220, right: 0, width: 130, background: "rgba(255,59,127,0.16)" }} />
  </AbsoluteFill>
);

export const Reel: React.FC<ReelProps> = ({ slug, data, config, audio, guides, noCaption }) => {
  const [handle] = useState(() => delayRender("fonts"));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    fontsReady.then(() => {
      setReady(true);
      continueRender(handle);
    });
  }, [handle]);
  const theme = useMemo(() => withOverrides(base, config.theme), [config.theme]);
  setEntrance(theme.entrance);
  const tl = useMemo(() => buildTimeline(data, theme), [data, theme]);
  if (!ready) return null;
  // an optional layer over every scene for the whole reel ("__overlay" in the scene map), such as a logo in a corner
  const Overlay = reels[slug]?.__overlay;
  return (
    <ReelContext.Provider value={{ theme, tl }}>
      <AbsoluteFill>
        <Ground />
        <Stage scenes={reels[slug] ?? {}} />
        {Overlay && <Overlay />}
        {!noCaption && <Caption />}
        <Chrome config={config.chrome} />
        {guides && <Guides />}
        {audio && <Audio src={staticFile(audio)} />}
      </AbsoluteFill>
    </ReelContext.Provider>
  );
};
