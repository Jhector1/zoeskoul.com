import { describe, expect, it } from "vitest";

import type { WorkspaceLanguage } from "@/lib/practice/types";

import { makeCodeInputOut } from "./utils";

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
            starterCode: "",
            language: futureLanguage,
            expected: {
                kind: "code_input",
            },
        });

        expect(out.exercise.language).toBe("testlang");
    });
});
