import type React from "react";
import type { SceneMap } from "../../../src/engine/Stage";
import { FresnoMap } from "./FresnoMap";

// The map is one layer over the whole reel (__overlay), so a single MapLibre map lives through every scene change.
// The scenes themselves draw nothing; they only carry the caption and the timing.
const Empty: React.FC = () => null;

export const scenes: SceneMap = { hook: Empty, paula: Empty, willow: Empty, __overlay: FresnoMap };
