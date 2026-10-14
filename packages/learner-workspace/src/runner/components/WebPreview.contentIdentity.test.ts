import { describe, expect, it } from "vitest";

import { hashWebPreviewContent } from "./WebPreview";

type WebPreviewEntries = Parameters<typeof hashWebPreviewContent>[0];

describe("WebPreview content identity", () => {
    const entries: WebPreviewEntries = [
        {
            kind: "file",
            path: "index.html",
            content: '<script src="script.js"></script>',
        },
        {
            kind: "file",
            path: "script.js",
            content: 'console.log("ready");',
        },
        {
            kind: "file",
            path: "data/events.json",
            content: '[{"name":"Robotics Lab"}]',
        },
    ];

    it("is stable when the same workspace entries arrive in a different order", () => {
        const forward = hashWebPreviewContent(entries, "exercise-a\0index.html");
        const reversed = hashWebPreviewContent(
            [...entries].reverse(),
            "exercise-a\0index.html",
        );

        expect(reversed).toBe(forward);
    });

    it("still changes when actual file content changes", () => {
        const original = hashWebPreviewContent(entries, "exercise-a\0index.html");
        const edited = hashWebPreviewContent(
            entries.map((entry) =>
                entry.path === "script.js"
                    ? { ...entry, content: 'console.log("changed");' }
                    : entry,
            ),
            "exercise-a\0index.html",
        );

        expect(edited).not.toBe(original);
    });

    it("still changes when the owning session or virtual page changes", () => {
        const first = hashWebPreviewContent(entries, "exercise-a\0index.html");
        const otherExercise = hashWebPreviewContent(
            entries,
            "exercise-b\0index.html",
        );
        const otherPage = hashWebPreviewContent(
            entries,
            "exercise-a\0details.html",
        );

        expect(otherExercise).not.toBe(first);
        expect(otherPage).not.toBe(first);
    });
});
