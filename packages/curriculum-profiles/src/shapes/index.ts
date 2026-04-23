import { pythonShape } from "./pythonShape.js";
import { sqlShape } from "./sqlShape.js";
import type { SubjectShapePack } from "./types.js";

const SHAPES = {
    sql: sqlShape,
    python: pythonShape,
} as const satisfies Record<string, SubjectShapePack>;

export function getSubjectShape(profileId: keyof typeof SHAPES): SubjectShapePack {
    return SHAPES[profileId];
}

export { sqlShape, pythonShape };
export type * from "./types.js";