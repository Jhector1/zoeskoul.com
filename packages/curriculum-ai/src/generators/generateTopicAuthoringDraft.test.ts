import { describe, expect, it } from "vitest";
import { pythonShape } from "@zoeskoul/curriculum-profiles";
import { generateTopicAuthoringDraftAttempt } from "./generateTopicAuthoringDraft.js";

describe("generateTopicAuthoringDraftAttempt", () => {
    it("requires generateJsonDetailed for auditable TopicAuthoringDraft generation", async () => {
        await expect(
            generateTopicAuthoringDraftAttempt(
                {
                    async generateJson<T>() {
                        return {} as T;
                    },
                },
                {
                    seed: {
                        profileId: "python",
                        subjectSlug: "python-for-beginners",
                        courseSlug: "python-course",
                        moduleSlug: "python-1",
                        modulePrefix: "py1",
                        moduleOrder: 1,
                        sectionSlug: "python-1-section-1",
                        sectionOrder: 1,
                        topicId: "read-and-add",
                        order: 1,
                        title: "Read and Add",
                        summary: "Read input and add one.",
                        minutes: 15,
                        sourceLocale: "en",
                        targetLocales: [],
                    } as any,
                    locale: "en",
                    shape: pythonShape,
                },
            ),
        ).rejects.toThrow(
            "TopicAuthoringDraft generation requires an auditable provider with generateJsonDetailed().",
        );
    });
});
