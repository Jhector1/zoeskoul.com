import { describe, expect, it } from "vitest";

import type { WorkspaceLanguage } from "@/lib/practice/types";

import { makeCodeInputOut, normalizePracticePurpose } from "./utils";

describe("normalizePracticePurpose", () => {
    it("keeps authored practice distinct while preserving project-like Try It and capstone behavior", () => {
        expect(normalizePracticePurpose("quiz")).toBe("quiz");
        expect(normalizePracticePurpose("practice")).toBe("practice");
        expect(normalizePracticePurpose("project")).toBe("project");
        expect(normalizePracticePurpose("try_it")).toBe("project");
        expect(normalizePracticePurpose("capstone")).toBe("project");
    });
});

describe("makeCodeInputOut", () => {
    it("preserves future workspace languages from the canonical type", () => {
        const futureLanguage: WorkspaceLanguage = "testlang";

        const out = makeCodeInputOut({
            archetype: "future-language",
            id: "future-language-1",
            topic: "topic.future-language",
            diff: "easy",
            title: "Future language",
            prompt: "Use a future language.",
            language: futureLanguage,
            expected: {
                kind: "code_input",
            },
        });

        expect(out.exercise.language).toBe("testlang");
    });
});
