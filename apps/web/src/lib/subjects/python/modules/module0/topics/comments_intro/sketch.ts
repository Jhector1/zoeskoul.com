// import type { SketchEntry } from "@/components/sketches/registryTypes";

import {SketchEntry} from "@/components/sketches/subjects";

export const COMMENTS_INTRO_SKETCHES: Record<string, SketchEntry> = {
    "py.syntax.comments": {
        kind: "archetype",
        spec: {
            archetype: "paragraph",
            specVersion: 1,
            title: "@:sketches.py.syntax.comments.title",
            bodyMarkdown: "@:sketches.py.syntax.comments.bodyMarkdown",
        },
    },
};