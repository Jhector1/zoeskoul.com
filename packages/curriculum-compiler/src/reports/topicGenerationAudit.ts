import type {
    TopicAuthoringDraft,
    TopicBundleManifest,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { GeneratedJsonError, GeneratedJsonResult } from "@zoeskoul/curriculum-ai";
import {
    TOPIC_AUTHORING_DRAFT_GENERATOR_VERSION,
} from "@zoeskoul/curriculum-ai";
import { TOPIC_AUTHORING_DRAFT_SCHEMA_VERSION } from "@zoeskoul/curriculum-contracts";
import { sha256Json, sha256Text, stableJsonStringify } from "./stableHash.js";

export function buildPromptHash(prompt: { system: string; user: string }): string {
    return sha256Json(prompt);
}

export function buildSeedHash(seed: TopicSeed): string {
    return sha256Json(seed);
}

export function buildTopicAttemptMetadata(args: {
    seed: TopicSeed;
    generation?: GeneratedJsonResult<unknown>;
    generatorVersion?: string;
    retryAttempt?: number;
    maxRetries?: number;
}) {
    return {
        profileId: args.seed.profileId,
        subjectSlug: args.seed.subjectSlug,
        courseSlug: args.seed.courseSlug,
        moduleSlug: args.seed.moduleSlug,
        sectionSlug: args.seed.sectionSlug,
        topicId: args.seed.topicId,
        provider: args.generation?.provider ?? "unknown",
        model: args.generation?.model ?? "unknown",
        temperature: args.generation?.temperature ?? null,
        modelSeed: Number.isFinite(args.generation?.seed)
            ? args.generation?.seed
            : null,
        generatorVersion:
            args.generatorVersion ?? TOPIC_AUTHORING_DRAFT_GENERATOR_VERSION,
        schemaName: "TopicAuthoringDraft",
        schemaVersion: TOPIC_AUTHORING_DRAFT_SCHEMA_VERSION,
        strictSchema: args.generation?.strictSchema ?? false,
        retryAttempt: args.retryAttempt ?? 0,
        maxRetries: args.maxRetries ?? null,
    };
}

export function buildTopicAttemptHashes(args: {
    seed: TopicSeed;
    prompt: { system: string; user: string };
    rawModelOutput?: string;
    parsedOutput?: unknown;
    normalizedDraft?: TopicAuthoringDraft;
    repairedDraft?: TopicAuthoringDraft;
    topicBundle?: TopicBundleManifest;
}) {
    return {
        seedHash: buildSeedHash(args.seed),
        promptHash: buildPromptHash(args.prompt),
        rawModelOutputHash:
            typeof args.rawModelOutput === "string"
                ? sha256Text(args.rawModelOutput)
                : undefined,
        parsedOutputHash:
            typeof args.parsedOutput !== "undefined"
                ? sha256Json(args.parsedOutput)
                : undefined,
        normalizedDraftHash:
            typeof args.normalizedDraft !== "undefined"
                ? sha256Json(args.normalizedDraft)
                : undefined,
        repairedDraftHash:
            typeof args.repairedDraft !== "undefined"
                ? sha256Json(args.repairedDraft)
                : undefined,
        compiledTopicBundleHash:
            typeof args.topicBundle !== "undefined"
                ? sha256Json(args.topicBundle)
                : undefined,
    };
}

export function extractGenerationDiagnostics(error: unknown): {
    rawModelOutput?: string;
    parsedOutput?: unknown;
    validationResult?: {
        ok: false;
        errors: string[];
    };
    generation?: GeneratedJsonResult<unknown>;
} {
    if (
        error &&
        typeof error === "object" &&
        "name" in error &&
        error.name === "GeneratedJsonError"
    ) {
        const generatedError = error as GeneratedJsonError;

        return {
            rawModelOutput: generatedError.rawText,
            parsedOutput: generatedError.parsedJson,
            validationResult: generatedError.validationErrors?.length
                ? {
                    ok: false as const,
                    errors: generatedError.validationErrors,
                }
                : undefined,
            generation: generatedError.rawText
                ? {
                    ...generatedError.metadata,
                    rawText: generatedError.rawText,
                    parsedJson: generatedError.parsedJson,
                    value: generatedError.parsedJson,
                }
                : undefined,
        };
    }

    return {};
}
