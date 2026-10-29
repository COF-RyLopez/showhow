import type React from "react";
import type { SceneMap } from "../../../src/engine/Stage";
import { GearWorld } from "./GearWorld";

// All three scenes draw the same world from the reel's frame, so every handover is one continuous picture.
const Hook: React.FC = () => <GearWorld />;
const Ratio: React.FC = () => <GearWorld />;
const Force: React.FC = () => <GearWorld />;

export const scenes: SceneMap = { hook: Hook, ratio: Ratio, force: Force };
