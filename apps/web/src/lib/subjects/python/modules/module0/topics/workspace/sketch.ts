import { SketchEntry } from "@/components/sketches/subjects";

export const WORKSPACE_SKETCHES: Record<string, SketchEntry> = {
    "py.workspace.intro": {
        kind: "archetype",
        spec: {
            archetype: "image",
            specVersion: 1,
            title: "@:sketches.py.workspace.intro.title",
            src: "/assets/editor.png",
            alt: "@:sketches.py.workspace.intro.alt",
            aspectRatio: 16 / 9,

            caption: "@:sketches.py.workspace.intro.caption",

            markers: [
                {
                    id: "sidebar",
                    x: 0.12,
                    y: 0.2,
                    label: "@:sketches.py.workspace.intro.markers.sidebar",
                },
                {
                    id: "editor",
                    x: 0.55,
                    y: 0.38,
                    label: "@:sketches.py.workspace.intro.markers.editor",
                },
                {
                    id: "run",
                    x: 0.92,
                    y: 0.1,
                    label: "@:sketches.py.workspace.intro.markers.run",
                },
                {
                    id: "terminal",
                    x: 0.55,
                    y: 0.88,
                    label: "@:sketches.py.workspace.intro.markers.terminal",
                },
            ],

            initialZoom: 1,
            minZoom: 1,
            maxZoom: 4,
            zoomStep: 0.15,
            allowPan: true,
            allowWheelZoom: true,
            allowDoubleClickReset: true,
            showControls: true,
        },
    },

    "py.workspace.instructions.intro": {
        kind: "archetype",
        spec: {
            archetype: "paragraph",
            specVersion: 1,
            title: "@:sketches.py.workspace.instructions_intro.title",
            bodyMarkdown: "@:sketches.py.workspace.instructions_intro.bodyMarkdown",
        },
    },
};