import { SketchEntry } from "@/components/sketches/subjects";

export const DATA_TYPES_INTRO_SKETCHES: Record<string, SketchEntry> = {
    "py.types.basic": {
        kind: "archetype",
        spec: {
            archetype: "paragraph",
            specVersion: 1,
            title: "@:sketches.py.types.basic.title",
            bodyMarkdown: "@:sketches.py.types.basic.bodyMarkdown",
        },
    },

    "py.types.convert": {
        kind: "archetype",
        spec: {
            archetype: "paragraph",
            specVersion: 1,
            title: "@:sketches.py.types.convert.title",
            bodyMarkdown: "@:sketches.py.types.convert.bodyMarkdown",
        },
    },
};