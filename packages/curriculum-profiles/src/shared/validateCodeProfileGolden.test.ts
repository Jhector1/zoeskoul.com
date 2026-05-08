import { afterEach, describe, expect, it } from "vitest";
import { clearCodeRunner } from "@zoeskoul/curriculum-runtime";
import { validateCodeProfileGolden } from "./validateCodeProfileGolden.js";

describe("validateCodeProfileGolden", () => {
    afterEach(() => {
        clearCodeRunner();
    });

    it("blocks unsupported semantic languages with a clear code", async () => {
        const issues = await validateCodeProfileGolden({
            profileId: "javascript",
            expectedLanguage: "javascript" as any,
            allowedRecipeTypes: ["semantic"] as any,
            topicBundle: {
                topicId: "js-topic",
                subjectSlug: "javascript",
                moduleSlug: "js-1",
                sectionSlug: "js-1-1",
                prefix: "topics.javascript.js-1.js-topic",
                minutes: 10,
                topic: {
                    labelKey: "label",
                    summaryKey: "summary",
                },
                runtimeDefaults: {
                    kind: "code",
                    language: "javascript",
                },
                cards: [],
                sketches: [],
                exercises: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        messageBase: "quiz.code-1",
                        language: "javascript",
                        recipe: {
                            type: "semantic",
                            language: "javascript",
                            solutionCode: `console.log("hello")`,
                            semanticChecks: [{ type: "printed_line_count", min: 1 }],
                        },
                    },
                ],
            } as any,
        });

        expect(issues.map((issue) => issue.code)).toContain(
            "CODE_PROFILE_SEMANTIC_LANGUAGE_UNSUPPORTED",
        );
    });
});
