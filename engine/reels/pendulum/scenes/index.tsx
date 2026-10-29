import type React from "react";
import type { SceneMap } from "../../../src/engine/Stage";
import { PendulumWorld } from "./PendulumWorld";

// Both scenes draw the same world from the reel's frame, so the handover is one continuous picture.
const Hook: React.FC = () => <PendulumWorld />;
const Length: React.FC = () => <PendulumWorld />;

export const scenes: SceneMap = { hook: Hook, length: Length };
