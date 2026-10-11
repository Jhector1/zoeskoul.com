import { describe, expect, it } from "vitest";
import type { TopicSeed } from "@zoeskoul/curriculum-contracts";

import { buildTryItPrompt } from "./tryItText.js";

const seed = {
    sectionRole: "lesson",
    moduleRole: "standard",
    practice: {},
} as unknown as TopicSeed;

describe("learner-facing Try It bridge copy", () => {
    it("never exposes the internal authoring term sketch", () => {
        const prompt = buildTryItPrompt({
            exerciseTitle: "Group the open-house supplies",
            exercisePrompt:
                "Replace the three supply paragraphs with one unordered list.",
            topicTitle: "Ordered and Unordered Lists",
            seed,
            sketchTitle:
                "Use an unordered list when sequence does not matter",
        });

        expect(prompt).toContain(
            "Now apply what you just learned in this task.",
        );
        expect(prompt).toContain(
            "Replace the three supply paragraphs with one unordered list.",
        );
        expect(prompt.toLowerCase()).not.toContain("sketch");
    });

    it("still omits the bridge when no preceding teaching block is supplied", () => {
        const prompt = buildTryItPrompt({
            exerciseTitle: "Group the supplies",
            exercisePrompt: "Build one unordered list.",
            topicTitle: "Ordered and Unordered Lists",
            seed,
        });

        expect(prompt).not.toContain(
            "Now apply what you just learned in this task.",
        );
    });
});
