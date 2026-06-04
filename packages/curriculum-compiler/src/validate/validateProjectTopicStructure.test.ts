import { describe, expect, it } from "vitest";
import { validateProjectTopicStructure } from "./validateProjectTopicStructure.js";

function makeTopicBundle(overrides: Record<string, unknown> = {}) {
    return {
        topicId: "project-topic",
        subjectSlug: "python--python-v2--draft",
        moduleSlug: "python-v2-4",
        sectionSlug: "python-v2-4-capstone",
        prefix: "pyv2_4",
        minutes: 20,
        topic: {
            labelKey: "label",
            summaryKey: "summary",
        },
        cards: [
            {
                id: "project",
                kind: "project",
                project: {
                    steps: [],
                },
            },
        ],
        sketches: [],
        exercises: [
            {
                id: "step-1",
                kind: "code_input",
                purpose: "project",
            },
        ],
        ...overrides,
    };
}

describe("validateProjectTopicStructure", () => {
    it("rejects quiz cards and quiz exercises for authored module projects", () => {
        const issues = validateProjectTopicStructure({
            topicBundle: makeTopicBundle({
                cards: [
                    {
                        id: "project",
                        kind: "project",
                        project: {
                            steps: [],
                        },
                    },
                    {
                        id: "quiz",
                        kind: "quiz",
                    },
                ],
                exercises: [
                    {
                        id: "step-1",
                        kind: "code_input",
                        purpose: "project",
                    },
                    {
                        id: "quiz-1",
                        kind: "fill_blank_choice",
                        purpose: "quiz",
                    },
                ],
            }),
            filePath: "topic.bundle.json",
            sectionRole: "module_project",
        });

        expect(issues).toEqual([
            "topic.bundle.json: module_project topic must not include a quiz card",
            "topic.bundle.json: module_project topic must not include quiz-purpose exercises",
        ]);
    });

    it("treats capstone module role as sufficient even without a capstone section role", () => {
        const issues = validateProjectTopicStructure({
            topicBundle: makeTopicBundle({
                cards: [
                    {
                        id: "project",
                        kind: "project",
                        project: {
                            displayKind: "capstone",
                            uiKind: "capstone",
                            steps: [],
                        },
                    },
                ],
            }),
            filePath: "topic.bundle.json",
            moduleRole: "capstone",
        });

        expect(issues).toEqual([]);
    });

    it("requires capstone display kinds for capstone topics", () => {
        const issues = validateProjectTopicStructure({
            topicBundle: makeTopicBundle(),
            filePath: "topic.bundle.json",
            sectionRole: "capstone",
        });

        expect(issues).toEqual([
            "topic.bundle.json: capstone topic project card must use capstone display/ui kinds",
        ]);
    });
});
