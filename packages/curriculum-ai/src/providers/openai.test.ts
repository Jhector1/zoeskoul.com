import { afterEach, describe, expect, it, vi } from "vitest";
import {
    TOPIC_AUTHORING_DRAFT_JSON_SCHEMA,
} from "@zoeskoul/curriculum-contracts";
import {
    assertOpenAiStructuredOutputSchemaCompatible,
    getOpenAiStructuredOutputSchema,
    openAiProvider,
    resetOpenAiClientFactoryForTests,
    resetOpenAiModelResolverForTests,
    setOpenAiClientFactoryForTests,
    setOpenAiModelResolverForTests,
} from "./openai.js";

function findKeywordPath(value: unknown, keyword: string, path = "$"): string | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    if (keyword in (value as Record<string, unknown>)) {
        return `${path}.${keyword}`;
    }

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (Array.isArray(child)) {
            for (const [index, item] of child.entries()) {
                const nested = findKeywordPath(item, keyword, `${path}.${key}[${index}]`);
                if (nested) return nested;
            }
            continue;
        }

        const nested = findKeywordPath(child, keyword, `${path}.${key}`);
        if (nested) return nested;
    }

    return null;
}

function findObjectPropertyCoverageIssue(value: unknown, path = "$"): string | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const record = value as Record<string, unknown>;
    const properties =
        record.properties && typeof record.properties === "object"
            ? (record.properties as Record<string, unknown>)
            : null;
    const required = Array.isArray(record.required) ? record.required : null;

    if (properties) {
        const propertyKeys = Object.keys(properties).sort();
        const requiredKeys = [...(required ?? [])]
            .filter((key): key is string => typeof key === "string")
            .sort();

        if (
            propertyKeys.length !== requiredKeys.length ||
            propertyKeys.some((key, index) => key !== requiredKeys[index])
        ) {
            return path;
        }
    }

    for (const [key, child] of Object.entries(record)) {
        if (Array.isArray(child)) {
            for (const [index, item] of child.entries()) {
                const nested = findObjectPropertyCoverageIssue(item, `${path}.${key}[${index}]`);
                if (nested) return nested;
            }
            continue;
        }

        const nested = findObjectPropertyCoverageIssue(child, `${path}.${key}`);
        if (nested) return nested;
    }

    return null;
}

describe("openAiProvider", () => {
    afterEach(() => {
        resetOpenAiClientFactoryForTests();
        resetOpenAiModelResolverForTests();
    });

    it("sends deterministic strict-schema requests for TopicAuthoringDraft", async () => {
        const create = vi.fn(async (request: unknown) => ({
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            title: "Topic",
                            summary: "Summary",
                            minutes: 15,
                            sketchBlocks: [],
                            quizDraft: [],
                        }),
                    },
                },
            ],
        }));

        setOpenAiClientFactoryForTests(
            () =>
                ({
                    chat: {
                        completions: {
                            create,
                        },
                    },
                }) as any,
        );
        setOpenAiModelResolverForTests(() => "gpt-test");

        await openAiProvider.generateJsonDetailed!({
            system: "system prompt",
            user: "user prompt",
            schemaName: "TopicAuthoringDraft",
        });

        expect(create).toHaveBeenCalledTimes(1);
        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                model: "gpt-test",
                temperature: 0,
                seed: 0,
                response_format: {
                    type: "json_schema",
                    json_schema: {
                        name: "TopicAuthoringDraft",
                        strict: true,
                        schema: getOpenAiStructuredOutputSchema("TopicAuthoringDraft"),
                    },
                },
            }),
        );
        expect(create.mock.calls[0][0]).not.toEqual(
            expect.objectContaining({
                response_format: expect.objectContaining({
                    type: "json_object",
                }),
            }),
        );
        expect(
            JSON.stringify(
                (create.mock.calls[0][0] as {
                    response_format?: {
                        json_schema?: {
                            schema?: unknown;
                        };
                    };
                }).response_format?.json_schema?.schema,
            ),
        ).not.toContain("\"oneOf\"");
    });

    it("omits unsupported sampling parameters for GPT-5-family models", async () => {
        const create = vi.fn(async (_request: Record<string, unknown>) => ({
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            title: "Topic",
                            summary: "Summary",
                            minutes: 15,
                            sketchBlocks: [],
                            quizDraft: [],
                        }),
                    },
                },
            ],
        }));

        setOpenAiClientFactoryForTests(
            () =>
                ({
                    chat: {
                        completions: {
                            create,
                        },
                    },
                }) as any,
        );
        setOpenAiModelResolverForTests(() => "gpt-5-mini");

        const result = await openAiProvider.generateJsonDetailed!({
            system: "system prompt",
            user: "user prompt",
            schemaName: "TopicAuthoringDraft",
        });

        expect(create).toHaveBeenCalledTimes(1);
        expect(create.mock.calls[0][0]).not.toHaveProperty("temperature");
        expect(create.mock.calls[0][0]).not.toHaveProperty("seed");
        expect(result.temperature).toBe(1);
        expect(result.seed).toBeUndefined();
    });

    it("strips provider-only null compatibility fields before canonical TopicAuthoringDraft validation", async () => {
        const create = vi.fn(async () => ({
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            title: "Topic",
                            summary: "Summary",
                            minutes: 15,
                            sketchBlocks: [
                                {
                                    id: "sketch0",
                                    cardTitle: null,
                                    title: "Lesson",
                                    bodyMarkdown: "Body",
                                },
                            ],
                            projectDraft: null,
                            quizDraft: [
                                {
                                    id: "quiz1",
                                    kind: "single_choice",
                                    title: "Question",
                                    prompt: "Pick one.",
                                    hint: "Hint",
                                    help: {
                                        concept: "Concept",
                                        hint_1: "Hint 1",
                                        hint_2: "Hint 2",
                                    },
                                    options: ["A", "B"],
                                    correctOptionIds: ["a"],
                                    tokens: null,
                                    correctOrder: null,
                                    template: null,
                                    choices: null,
                                    correctValue: null,
                                    starterCode: null,
                                    solutionCode: null,
                                    tests: null,
                                    semanticChecks: null,
                                    datasetId: null,
                                    recipeType: null,
                                    checkSql: null,
                                },
                            ],
                        }),
                    },
                },
            ],
        }));

        setOpenAiClientFactoryForTests(
            () =>
                ({
                    chat: {
                        completions: {
                            create,
                        },
                    },
                }) as any,
        );
        setOpenAiModelResolverForTests(() => "gpt-test");

        const result = await openAiProvider.generateJsonDetailed!({
            system: "system prompt",
            user: "user prompt",
            schemaName: "TopicAuthoringDraft",
        });

        expect(result.value).toEqual({
            title: "Topic",
            summary: "Summary",
            minutes: 15,
            sketchBlocks: [
                {
                    id: "sketch0",
                    title: "Lesson",
                    bodyMarkdown: "Body",
                },
            ],
            quizDraft: [
                {
                    id: "quiz1",
                    kind: "single_choice",
                    title: "Question",
                    prompt: "Pick one.",
                    hint: "Hint",
                    help: {
                        concept: "Concept",
                        hint_1: "Hint 1",
                        hint_2: "Hint 2",
                    },
                    options: ["A", "B"],
                    correctOptionIds: ["a"],
                },
            ],
        });
    });

    it("uses a lowered provider schema for TopicAuthoringDraft structured outputs", () => {
        const providerSchema = getOpenAiStructuredOutputSchema("TopicAuthoringDraft");

        expect(providerSchema).not.toEqual(TOPIC_AUTHORING_DRAFT_JSON_SCHEMA);
        expect(findKeywordPath(providerSchema, "oneOf")).toBeNull();
        expect(findKeywordPath(TOPIC_AUTHORING_DRAFT_JSON_SCHEMA, "oneOf")).toBe(
            "$.properties.quizDraft.items.oneOf",
        );
        expect(() =>
            assertOpenAiStructuredOutputSchemaCompatible(providerSchema),
        ).not.toThrow();
    });

    it("does not include oneOf under quizDraft.items in the OpenAI TopicAuthoringDraft schema", () => {
        const providerSchema = getOpenAiStructuredOutputSchema("TopicAuthoringDraft") as {
            properties?: {
                quizDraft?: {
                    items?: {
                        properties?: {
                            tests?: {
                                items?: {
                                    properties?: Record<string, unknown>;
                                };
                            };
                        };
                    };
                };
            };
        };

        expect(providerSchema.properties?.quizDraft?.items).toBeTruthy();
        expect(providerSchema.properties?.quizDraft?.items).not.toHaveProperty("oneOf");
        expect(
            providerSchema.properties?.quizDraft?.items?.properties?.tests?.items?.properties,
        ).toHaveProperty("files");
    });

    it("contains none of the unsupported structured-output keywords anywhere in the lowered TopicAuthoringDraft schema", () => {
        const providerSchema = getOpenAiStructuredOutputSchema("TopicAuthoringDraft");

        for (const keyword of ["oneOf", "anyOf", "allOf", "not", "if", "then", "else", "$ref"]) {
            expect(findKeywordPath(providerSchema, keyword)).toBeNull();
        }
    });

    it("uses OpenAI-strict object schemas where every declared property is also required", () => {
        expect(
            findObjectPropertyCoverageIssue(
                getOpenAiStructuredOutputSchema("TopicAuthoringDraft"),
            ),
        ).toBeNull();
    });

    it("requires nullable cardTitle in the OpenAI sketch schema", () => {
        const providerSchema = getOpenAiStructuredOutputSchema("TopicAuthoringDraft") as any;
        const sketchSchema = providerSchema.properties.sketchBlocks.items;

        expect(sketchSchema.required).toContain("cardTitle");
        expect(sketchSchema.properties.cardTitle.type).toEqual(["string", "null"]);
    });

    it("requires course-plan role metadata and an authored capstone project brief", () => {
        const providerSchema = getOpenAiStructuredOutputSchema("CoursePlan") as any;
        const moduleSchema = providerSchema.properties.modules.items;
        const sectionSchema = moduleSchema.properties.sections.items;
        const topicSchema = sectionSchema.properties.topics.items;
        const projectBriefSchema = topicSchema.properties.projectBrief;

        expect(moduleSchema.required).toContain("role");
        expect(moduleSchema.properties.role.enum).toEqual(["standard", "capstone"]);
        expect(sectionSchema.required).toContain("role");
        expect(sectionSchema.properties.role.enum).toEqual([
            "lesson",
            "module_project",
            "capstone",
        ]);
        expect(topicSchema.required).toContain("projectBrief");
        expect(projectBriefSchema.type).toEqual(["object", "null"]);
        expect(projectBriefSchema.required).toContain("stepCountTarget");
        expect(projectBriefSchema.required).toContain("stepLadder");
        expect(
            findObjectPropertyCoverageIssue(providerSchema),
        ).toBeNull();
    });

    it("rejects unsupported structured-output schema keywords", () => {
        expect(() =>
            assertOpenAiStructuredOutputSchemaCompatible({
                type: "object",
                anyOf: [{ type: "string" }, { type: "number" }],
            }),
        ).toThrow(/unsupported keyword "anyOf"/);
    });
});
