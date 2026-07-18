import { getCurriculumProfile } from "../registry.js";
import { bashShape } from "./bashShape.js";
import { gitShape } from "./gitShape.js";
import { mathShape } from "./mathShape.js";
import { pythonShape } from "./pythonShape.js";
import { sqlShape } from "./sqlShape.js";
import type { SubjectShapePack } from "./types.js";

export function getSubjectShape(profileId: string): SubjectShapePack {
    return getCurriculumProfile(profileId).shape;
}

export { bashShape, gitShape, sqlShape, pythonShape, mathShape };
export type * from "./types.js";
