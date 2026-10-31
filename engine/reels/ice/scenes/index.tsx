import type React from "react";
import type { SceneMap } from "../../../src/engine/Stage";
import { IceWorld } from "./IceWorld";

// All three scenes draw the same world from the reel's frame, so each handover is one continuous picture.
const Hook: React.FC = () => <IceWorld />;
const Lattice: React.FC = () => <IceWorld />;
const Weight: React.FC = () => <IceWorld />;

export const scenes: SceneMap = { hook: Hook, lattice: Lattice, weight: Weight };
