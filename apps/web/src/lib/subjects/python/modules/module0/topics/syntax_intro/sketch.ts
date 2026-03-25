import type { SketchEntry } from "@/components/sketches/subjects";

export const SYNTAX_INTRO_SKETCHES: Record<string, SketchEntry> = {
    "py.syntax.intro": {
        kind: "archetype",
        spec: {
            archetype: "paragraph",
            specVersion: 1,
            title: "@:sketches.py.syntax.intro.title",
            bodyMarkdown: "@:sketches.py.syntax.intro.bodyMarkdown",
        },
    },
};