import type React from "react";
import type { SceneMap } from "../../../src/engine/Stage";
import { BlockWorld } from "./BlockWorld";

// Both scenes draw the same world from the reel's frame, so the handover is one continuous picture.
const Hook: React.FC = () => <BlockWorld />;
const Orbit: React.FC = () => <BlockWorld />;

export const scenes: SceneMap = { hook: Hook, orbit: Orbit };
