import { describe, expect, it } from "vitest";
import { buildTryItPrompt } from "./tryItText.js";

describe("buildTryItPrompt structured learner copy", () => {
    it("preserves an authored Problem/Task prompt verbatim", () => {
        const prompt = `**Problem**

Paragraph text still relies on the browser's default color.

**Task**

Keep the previous stylesheet and add the requested paragraph rule.`;

        const result = buildTryItPrompt({
            exerciseTitle: "Read a CSS rule",
            exercisePrompt: prompt,
            topicTitle: "Selectors, Declarations, and Rules",
            seed: {} as any,
            sketchTitle: "Read a CSS rule",
        });

        expect(result).toBe(prompt);
        expect(result.startsWith("**Problem**\n")).toBe(true);
        expect(result).not.toContain("Now apply what you just learned");
        expect(result).not.toContain("File to edit");
        expect(result).not.toContain("Check your work");
    });
});
