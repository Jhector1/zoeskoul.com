
import { describe, expect, it } from "vitest";
import { normalizeTopicAuthoringDraft } from "./normalizeTopicAuthoringDraft.js";

describe("normalizeTopicAuthoringDraft", () => {
    it("normalizes missing arrays and trims basic strings", () => {
        const normalized = normalizeTopicAuthoringDraft({
            title: "  Topic  ",
            summary: "  Summary  ",
            minutes: 15,
            sketchBlocks: undefined,
            quizDraft: undefined,
        } as any);

        expect(normalized.title).toBe("Topic");
        expect(normalized.summary).toBe("Summary");
        expect(Array.isArray(normalized.sketchBlocks)).toBe(true);
        expect(Array.isArray(normalized.quizDraft)).toBe(true);
    });

    it("preserves minutes when already numeric", () => {
        const normalized = normalizeTopicAuthoringDraft({
            title: "Topic",
            summary: "Summary",
            minutes: 20,
            sketchBlocks: [],
            quizDraft: [],
        } as any);

        expect(normalized.minutes).toBe(20);
    });
});