import fs from "node:fs/promises";
import path from "node:path";
import {
    assertTopicAuthoringDraft,
    type TopicAuthoringDraft,
    type TopicBundleManifest,
    type TopicSeed,
    validateTopicAuthoringDraft,
} from "@zoeskoul/curriculum-contracts";
import type { SubjectShapePack } from "@zoeskoul/curriculum-profiles";
import { buildTopicBundleFromDraft } from "../emit/buildTopicBundleFromDraft.js";
import { normalizeTopicAuthoringDraft } from "../normalize/normalizeTopicAuthoringDraft.js";
import { buildTopicAttemptHashes } from "./topicGenerationAudit.js";

function stripCodeFences(text: string): string {
    const trimmed = text.trim();
    if (!trimmed.startsWith("```")) return trimmed;

    return trimmed
        .replace(/^```[a-zA-Z0-9_-]*\n?/, "")
        .replace(/\n?```$/, "")
        .trim();
}

function parseSavedRawOutput(text: string): unknown {
    return JSON.parse(stripCodeFences(text));
}

export async function replayTopicAttemptFromSavedOutput(args: {
    reportDir: string;
    attempt: number;
    seed: TopicSeed;
    shape: SubjectShapePack;
    expectedNormalizedDraftHash?: string;
    expectedCompiledTopicBundleHash?: string;
}): Promise<{
    parsedOutput: unknown;
    validationResult: ReturnType<typeof validateTopicAuthoringDraft>;
    normalizedDraft: TopicAuthoringDraft;
    topicBundle: TopicBundleManifest;
    hashes: ReturnType<typeof buildTopicAttemptHashes>;
}> {
    const attemptDir = path.join(args.reportDir, `attempt-${args.attempt}`);
    const rawText = await fs.readFile(path.join(attemptDir, "raw-model-output.txt"), "utf8");
    let prompt: { system: string; user: string };
    try {
        prompt = JSON.parse(
            await fs.readFile(path.join(attemptDir, "prompt.json"), "utf8"),
        ) as { system: string; user: string };
    } catch {
        throw new Error(
            "Cannot replay full audit hash because prompt.json is missing.",
        );
    }
    const parsedOutput = parseSavedRawOutput(rawText);
    const validationResult = validateTopicAuthoringDraft(parsedOutput);

    if (!validationResult.ok) {
        throw new Error(
            `Replay validation failed:\n${validationResult.errors.join("\n")}`,
        );
    }

    assertTopicAuthoringDraft(parsedOutput as TopicAuthoringDraft);

    const normalizedDraft = normalizeTopicAuthoringDraft(parsedOutput, {
        profileId: args.seed.profileId,
    });
    const topicBundle = buildTopicBundleFromDraft({
        shape: args.shape,
        seed: args.seed,
        draft: normalizedDraft,
    });
    const hashes = buildTopicAttemptHashes({
        seed: args.seed,
        prompt,
        rawModelOutput: rawText,
        parsedOutput,
        normalizedDraft,
        repairedDraft: normalizedDraft,
        topicBundle,
    });
    try {
        const savedHashesPath = path.join(attemptDir, "hashes.json");
        const savedHashes = JSON.parse(
            await fs.readFile(savedHashesPath, "utf8"),
        ) as Record<string, string | undefined>;

        const comparableKeys = [
            "seedHash",
            "promptHash",
            "rawModelOutputHash",
            "parsedOutputHash",
            "normalizedDraftHash",
            "compiledTopicBundleHash",
        ] as const;

        for (const key of comparableKeys) {
            const savedValue = savedHashes[key];
            if (!savedValue) continue;

            if (hashes[key] !== savedValue) {
                throw new Error(
                    `Replay ${key} mismatch. Expected ${savedValue}, received ${hashes[key]}.`,
                );
            }
        }
    } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (
            typeof nodeError?.message === "string" &&
            nodeError.message.includes("mismatch")
        ) {
            throw error;
        }
        if (nodeError?.code !== "ENOENT") {
            throw error;
        }
    }

    if (
        args.expectedNormalizedDraftHash &&
        hashes.normalizedDraftHash !== args.expectedNormalizedDraftHash
    ) {
        throw new Error(
            `Replay normalized draft hash mismatch. Expected ${args.expectedNormalizedDraftHash}, received ${hashes.normalizedDraftHash}.`,
        );
    }

    if (
        args.expectedCompiledTopicBundleHash &&
        hashes.compiledTopicBundleHash !== args.expectedCompiledTopicBundleHash
    ) {
        throw new Error(
            `Replay topic bundle hash mismatch. Expected ${args.expectedCompiledTopicBundleHash}, received ${hashes.compiledTopicBundleHash}.`,
        );
    }

    return {
        parsedOutput,
        validationResult,
        normalizedDraft,
        topicBundle,
        hashes,
    };
}
