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
                        schema: TOPIC_AUTHORING_DRAFT_JSON_SCHEMA,
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
    });

    it("documents that TopicAuthoringDraft provider schema currently permits oneOf", () => {
        expect(getOpenAiStructuredOutputSchema("TopicAuthoringDraft")).toEqual(
            TOPIC_AUTHORING_DRAFT_JSON_SCHEMA,
        );
        expect(() => assertOpenAiStructuredOutputSchemaCompatible(
            getOpenAiStructuredOutputSchema("TopicAuthoringDraft"),
        )).not.toThrow();
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
