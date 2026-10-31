import type React from "react";
import type { SceneMap } from "../../../src/engine/Stage";
import { MapWorld } from "./MapWorld";

// All four scenes draw the same map from the reel's frame, so each handover is one continuous picture.
const Hook: React.FC = () => <MapWorld />;
const Where: React.FC = () => <MapWorld />;
const Who: React.FC = () => <MapWorld />;
const Join: React.FC = () => <MapWorld />;

export const scenes: SceneMap = { hook: Hook, where: Where, who: Who, join: Join };
