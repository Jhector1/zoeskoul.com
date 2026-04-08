import type { SketchEntry } from "./registryTypes";
import { ARCHETYPE_GALLERY_SKETCHES } from "@/components/sketches/gallery/registry";
import { SUBJECT_SKETCHES } from "@/lib/subjects";

const ALL: Record<string, SketchEntry> = {
    ...SUBJECT_SKETCHES,
};

export function getSketchEntry(sketchId: string): SketchEntry | null {
    return ALL[sketchId] ?? null;
}


