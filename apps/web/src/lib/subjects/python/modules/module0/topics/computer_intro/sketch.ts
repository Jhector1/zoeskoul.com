// src/lib/subjects/python/modules/module0/topics/computer_intro/sketch.ts
import type { SketchEntry } from "@/components/sketches/subjects";

export const COMPUTER_INTRO_SKETCHES: Record<string, SketchEntry> = {
    "py.computer.ipo": {
        kind: "archetype",
        spec: {
            archetype: "paragraph",
            specVersion: 1,
            title: "@:sketches.py.computer.ipo.title",
            bodyMarkdown: "@:sketches.py.computer.ipo.bodyMarkdown",
        },
    },

    "py.computer.instructions": {
        kind: "archetype",
        spec: {
            archetype: "paragraph",
            specVersion: 1,
            title: "@:sketches.py.computer.instructions.title",
            bodyMarkdown: "@:sketches.py.computer.instructions.bodyMarkdown",
        },
    },
};