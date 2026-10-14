import type { SubjectShapePack } from "./types.js";
import { webShape } from "./webShape.js";

export const apiShape = {
    ...webShape,
    profileId: "api",
} satisfies SubjectShapePack;
