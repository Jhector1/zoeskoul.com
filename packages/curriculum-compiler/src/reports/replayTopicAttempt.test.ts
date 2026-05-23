import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pythonShape } from "@zoeskoul/curriculum-profiles";
import { replayTopicAttemptFromSavedOutput } from "./replayTopicAttempt.js";
import { buildTopicAttemptHashes } from "./topicGenerationAudit.js";

describe("replayTopicAttemptFromSavedOutput", () => {
    it("replays the same raw model JSON into the same normalized draft hash", async () => {
        const reportDir = await fs.mkdtemp(
            path.join(os.tmpdir(), "topic-replay-test-"),
        );
        const attemptDir = path.join(reportDir, "attempt-0");
        await fs.mkdir(attemptDir, { recursive: true });

        const rawDraft = {
            title: "Topic",
            summary: "Summary",
            minutes: 15,
            sketchBlocks: [],
            quizDraft: [
                {
                    id: "code-1",
                    kind: "code_input",
                    title: "Code",
                    prompt: "Read a number and print the next number.",
                    starterCode: "# Write your answer below\n",
                    solutionCode: "n = int(input())\nprint(n + 1)",
                    recipeType: "fixed_tests",
                    tests: [{ stdin: "1\n", stdout: "2\n", match: "exact" }],
                    hint: "Use input.",
                    help: {
                        concept: "Read a value and print a result.",
                        hint_1: "Convert the input first.",
                        hint_2: "Print the final answer.",
                    },
                },
            ],
        };

        await fs.writeFile(
            path.join(attemptDir, "raw-model-output.txt"),
            JSON.stringify(rawDraft, null, 2),
            "utf8",
        );
        const prompt = {
            system: "system prompt",
            user: "user prompt",
        };
        await fs.writeFile(
            path.join(attemptDir, "prompt.json"),
            JSON.stringify(prompt, null, 2),
            "utf8",
        );

        const seed = {
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
            moduleRuntimeDefaults: {
                kind: "code",
                language: "python",
            },
        } as any;
        const expectedHashes = buildTopicAttemptHashes({
            seed,
            prompt,
            rawModelOutput: JSON.stringify(rawDraft, null, 2),
            parsedOutput: rawDraft,
            normalizedDraft: rawDraft as any,
        });
        await fs.writeFile(
            path.join(attemptDir, "hashes.json"),
            JSON.stringify(expectedHashes, null, 2),
            "utf8",
        );

        const first = await replayTopicAttemptFromSavedOutput({
            reportDir,
            attempt: 0,
            seed,
            shape: pythonShape,
        });
        const second = await replayTopicAttemptFromSavedOutput({
            reportDir,
            attempt: 0,
            seed,
            shape: pythonShape,
            expectedNormalizedDraftHash: first.hashes.normalizedDraftHash,
            expectedCompiledTopicBundleHash: first.hashes.compiledTopicBundleHash,
        });

        expect(first.hashes.normalizedDraftHash).toBe(second.hashes.normalizedDraftHash);
        expect(first.hashes.compiledTopicBundleHash).toBe(
            second.hashes.compiledTopicBundleHash,
        );
    });

    it("fails clearly when prompt.json is missing", async () => {
        const reportDir = await fs.mkdtemp(
            path.join(os.tmpdir(), "topic-replay-test-"),
        );
        const attemptDir = path.join(reportDir, "attempt-0");
        await fs.mkdir(attemptDir, { recursive: true });
        await fs.writeFile(
            path.join(attemptDir, "raw-model-output.txt"),
            JSON.stringify({
                title: "Topic",
                summary: "Summary",
                minutes: 15,
                sketchBlocks: [],
                quizDraft: [],
            }),
            "utf8",
        );

        await expect(
            replayTopicAttemptFromSavedOutput({
                reportDir,
                attempt: 0,
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
                shape: pythonShape,
            }),
        ).rejects.toThrow("Cannot replay full audit hash because prompt.json is missing.");
    });
});
