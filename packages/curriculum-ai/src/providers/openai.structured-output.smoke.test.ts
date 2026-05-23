import { describe, expect, it } from "vitest";
import { openAiProvider } from "./openai.js";

const shouldRunSmoke =
    process.env.OPENAI_SMOKE_TEST === "1" &&
    !!process.env.OPENAI_API_KEY &&
    !!process.env.OPENAI_MODEL;

const maybeDescribe = shouldRunSmoke ? describe : describe.skip;

maybeDescribe("openai structured output smoke", () => {
    it("accepts the TopicAuthoringDraft structured-output schema", async () => {
        const result = await openAiProvider.generateJsonDetailed!({
            system: [
                "Return a minimal valid TopicAuthoringDraft JSON object.",
                "Use no prose, only JSON.",
            ].join("\n"),
            user: JSON.stringify({
                topic: "Smoke Test",
                constraints: {
                    minimal: true,
                },
            }),
            schemaName: "TopicAuthoringDraft",
        });

        expect(result.strictSchema).toBe(true);
        expect(result.value).toMatchObject({
            title: expect.any(String),
            summary: expect.any(String),
            minutes: expect.any(Number),
            sketchBlocks: expect.any(Array),
            quizDraft: expect.any(Array),
        });
    }, 30000);
});
