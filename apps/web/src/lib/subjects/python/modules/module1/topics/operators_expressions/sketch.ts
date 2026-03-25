import { SketchEntry } from "@/components/sketches/subjects";

export const OPERATORS_EXPRESSIONS_SKETCHES: Record<string, SketchEntry> = {
    "py.ops.expressions": {
        kind: "archetype",
        spec: {
            archetype: "paragraph",
            specVersion: 1,
            title: "@:sketches.py.ops.expressions.title",
            bodyMarkdown: "@:sketches.py.ops.expressions.bodyMarkdown",
        },
    },
};