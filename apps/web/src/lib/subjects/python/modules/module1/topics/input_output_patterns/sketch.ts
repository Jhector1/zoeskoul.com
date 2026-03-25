import { SketchEntry } from "@/components/sketches/subjects";

export const INPUT_OUTPUT_PATTERNS_SKETCHES: Record<string, SketchEntry> = {
    "py.io.patterns": {
        kind: "archetype",
        spec: {
            archetype: "paragraph",
            specVersion: 1,
            title: "@:sketches.py.io.patterns.title",
            bodyMarkdown: "@:sketches.py.io.patterns.bodyMarkdown",
        },
    },
};