import type { SketchEntry } from "@zoeskoul/learner-workspace/sketches/subjects/registryTypes";
import { ARCHETYPE_GALLERY_SKETCHES } from "@zoeskoul/learner-workspace/sketches/gallery/registry";
import { SUBJECT_SKETCHES } from "@student/subjects";

const ALL: Record<string, SketchEntry> = {
    ...SUBJECT_SKETCHES,
};

export function getSketchEntry(sketchId: string): SketchEntry | null {

    return ALL[sketchId] ?? null;

}
