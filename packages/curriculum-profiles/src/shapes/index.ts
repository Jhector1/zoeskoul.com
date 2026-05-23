import { getCurriculumProfile } from "../registry.js";
import { mathShape } from "./mathShape.js";
import { pythonShape } from "./pythonShape.js";
import { sqlShape } from "./sqlShape.js";
import type { SubjectShapePack } from "./types.js";

export function getSubjectShape(profileId: string): SubjectShapePack {
    return getCurriculumProfile(profileId).shape;
}

export { sqlShape, pythonShape, mathShape };
export type * from "./types.js";
