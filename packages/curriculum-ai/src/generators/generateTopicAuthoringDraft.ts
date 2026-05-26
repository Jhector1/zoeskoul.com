import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import { validateTopicAuthoringDraft } from "@zoeskoul/curriculum-contracts";
import type { SubjectShapePack } from "@zoeskoul/curriculum-profiles";
import { GeneratedJsonError, type AiProvider, type GeneratedJsonResult, type TopicRetryContext } from "../types.js";
import { buildTopicAuthoringDraftPrompt } from "../prompts/buildTopicAuthoringDraftPrompt.js";
import { sanitizeGeneratedTopicAuthoringDraft } from "./sanitizeGeneratedTopicAuthoringDraft.js";
export const TOPIC_AUTHORING_DRAFT_GENERATOR_VERSION =
    "2026-05-23-topic-authoring-draft-generator-v1";

export async function generateTopicAuthoringDraftAttempt(
    provider: AiProvider,
    args: {
        seed: TopicSeed;
        locale: string;
        shape: SubjectShapePack;
        retry?: TopicRetryContext;
    },
): Promise<{
    prompt: {
        system: string;
        user: string;
    };
    generation: GeneratedJsonResult<TopicAuthoringDraft>;
}> {
    const prompt = buildTopicAuthoringDraftPrompt(args);

    try {
        if (!provider.generateJsonDetailed) {
            throw new Error(
                "TopicAuthoringDraft generation requires an auditable provider with generateJsonDetailed().",
            );
        }

        const generation = await provider.generateJsonDetailed<TopicAuthoringDraft>({
            system: prompt.system,
            user: prompt.user,
            schemaName: "TopicAuthoringDraft",
        });

        const sanitizedValue = sanitizeGeneratedTopicAuthoringDraft(generation.value);

        const sanitizedGeneration: GeneratedJsonResult<TopicAuthoringDraft> = {
            ...generation,
            value: sanitizedValue,
            parsedJson: sanitizedValue,
        };

        const validationResult = validateTopicAuthoringDraft(sanitizedGeneration.value);
        if (!validationResult.ok) {
            throw new GeneratedJsonError({
                code: "SCHEMA_VALIDATION_FAILED",
                message: validationResult.errors.join("\n"),
                metadata: sanitizedGeneration,
                rawText: sanitizedGeneration.rawText,
                parsedJson: sanitizedGeneration.parsedJson,
                validationErrors: validationResult.errors,
            });
        }

        return {
            prompt,
            generation: sanitizedGeneration,
        };
    } catch (error) {
        if (error && typeof error === "object") {
            (error as { prompt?: typeof prompt }).prompt = prompt;
        }
        throw error;
    }
}

export async function generateTopicAuthoringDraft(
    provider: AiProvider,
    args: {
        seed: TopicSeed;
        locale: string;
        shape: SubjectShapePack;
        retry?: TopicRetryContext;
    },
): Promise<TopicAuthoringDraft> {
    const result = await generateTopicAuthoringDraftAttempt(provider, args);
    return result.generation.value;
}
