import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
    CourseBlueprint,
    CourseSpec,
    TopicAuthoringDraft,
} from "@zoeskoul/curriculum-contracts";
import { getRepoRoot } from "@zoeskoul/curriculum-core";
import { pythonShape } from "@zoeskoul/curriculum-profiles";
import { buildTopicBundleFromDraft } from "../emit/buildTopicBundleFromDraft.js";
import { buildPlanFromSpec } from "../spec/buildPlanFromSpec.js";
import { listTopicPlanNodes } from "../plan/listTopicPlanNodes.js";
import { buildTopicSeedFromPlanNode } from "../seeds/buildTopicSeedFromPlanNode.js";
import { buildCourseQualityReportFromArtifacts } from "./buildCourseQualityReportFromArtifacts.js";

const subjectSlug = "python--course-quality-aggregation-test";
const reportRoot = path.join(
    getRepoRoot(),
    ".curriculum-drafts",
    "reports",
    subjectSlug,
);

async function writeJson(filePath: string, value: unknown) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function draft(topicTitle: string): TopicAuthoringDraft {
    return {
        title: topicTitle,
        summary: `${topicTitle} summary`,
        minutes: 15,
        sketchBlocks: [
            {
                id: "sketch-1",
                title: "Sketch",
                bodyMarkdown: "Try it yourself: change one value and run again.",
            },
        ],
        quizDraft: [
            {
                id: "code-1",
                kind: "code_input",
                title: `${topicTitle} code`,
                prompt: `Practice ${topicTitle.toLowerCase()}.`,
                hint: "Read the function name and return the value.",
                help: {
                    concept: "Return the transformed value from the function.",
                    hint_1: "Store the changed text in a variable if that helps.",
                    hint_2: "Return the final string instead of printing it.",
                },
                starterCode: "def format_name(text):\n    pass",
                solutionCode: "def format_name(text):\n    return text.strip().title()",
                recipeType: "semantic",
                semanticChecks: [
                    {
                        type: "function_returns",
                        functionName: "format_name",
                        args: ["  ava  "],
                        argKinds: ["value"],
                        expected: "Ava",
                        expectedKind: "value",
                    },
                    {
                        type: "function_returns",
                        functionName: "format_name",
                        args: ["leo"],
                        argKinds: ["value"],
                        expected: "Leo",
                        expectedKind: "value",
                    },
                    {
                        type: "no_stdout",
                    },
                ],
            },
        ],
    };
}

afterEach(async () => {
    await fs.rm(reportRoot, { recursive: true, force: true });
});

describe("buildCourseQualityReportFromArtifacts", () => {
    it("counts every available topic artifact instead of only the current-run subset", async () => {
        const blueprint = {
            subjectSlug,
            courseSlug: "artifact-aggregation",
            profileId: "python",
            workspaceProfileId: "browser-python-files-runner",
            workspacePolicyId: "python-browser-workspace",
            sourceLocale: "en",
            targetLocales: [],
            level: "beginner",
            title: "Artifact Aggregation",
        } as CourseBlueprint;

        const spec = {
            subjectSlug: "python",
            courseSlug: "artifact-aggregation",
            profileId: "python",
            workspaceProfileId: "browser-python-files-runner",
            workspacePolicyId: "python-browser-workspace",
            sourceLocale: "en",
            targetLocales: [],
            title: "Artifact Aggregation",
            modules: [
                {
                    moduleNumber: 8,
                    moduleSlug: "module-8",
                    title: "Module 8",
                    purpose: "Module 8 purpose",
                    learningObjectives: ["Write a helper function."],
                    guidedExercises: [],
                    quizFocus: [],
                    moduleProject: "Module 8 project",
                    sections: [
                        {
                            sectionSlug: "section-a",
                            title: "Section A",
                            topics: [
                                {
                                    topicId: "topic-one",
                                    title: "Topic One",
                                    summary: "Topic One summary",
                                    minutes: 15,
                                    technical: true,
                                    learningGoals: ["Write one small Python helper function."],
                                },
                                {
                                    topicId: "topic-two",
                                    title: "Topic Two",
                                    summary: "Topic Two summary",
                                    minutes: 15,
                                    technical: true,
                                    learningGoals: ["Return a cleaned result from a function."],
                                },
                            ],
                        },
                    ],
                },
                {
                    moduleNumber: 9,
                    moduleSlug: "module-9",
                    title: "Module 9",
                    purpose: "Module 9 purpose",
                    learningObjectives: ["Check a function result."],
                    guidedExercises: [],
                    quizFocus: [],
                    moduleProject: "Module 9 project",
                    sections: [
                        {
                            sectionSlug: "section-b",
                            title: "Section B",
                            topics: [
                                {
                                    topicId: "topic-three",
                                    title: "Topic Three",
                                    summary: "Topic Three summary",
                                    minutes: 15,
                                    technical: true,
                                    learningGoals: ["Check function output with a small example."],
                                },
                            ],
                        },
                    ],
                },
            ],
        } as CourseSpec;

        const plan = buildPlanFromSpec({ blueprint, spec });
        const nodes = listTopicPlanNodes({ plan });

        for (const node of nodes) {
            const seed = buildTopicSeedFromPlanNode({
                blueprint,
                spec,
                module: node.module,
                section: node.section,
                topic: node.topic,
            });
            const topicDraft = draft(node.topic.title);
            const topicBundle = buildTopicBundleFromDraft({
                shape: pythonShape,
                seed,
                draft: topicDraft,
            });
            const reportDir = path.join(
                reportRoot,
                node.module.moduleSlug === "module-8" ? "module8" : "module9",
                node.topic.topicId,
            );

            await writeJson(path.join(reportDir, "repaired-draft.json"), topicDraft);
            await writeJson(path.join(reportDir, "emitted-topic-bundle.json"), topicBundle);
        }

        const report = await buildCourseQualityReportFromArtifacts({
            blueprint,
            plan,
            spec,
        });

        expect(report.summary.modules).toBe(2);
        expect(report.summary.topicsTotal).toBe(3);
        expect(report.summary.exercises).toBe(3);
        expect(report.summary.codeInputs).toBe(3);
        expect(report.summary.exerciseKinds.code_input).toBe(3);
        expect(report.ok).toBe(true);
    });
});
