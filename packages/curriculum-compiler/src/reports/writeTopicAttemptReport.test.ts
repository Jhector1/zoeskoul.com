import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCompileValidationState } from "../compile/validationState.js";
import { writeTopicAttemptReport } from "./writeTopicAttemptReport.js";

describe("writeTopicAttemptReport", () => {
    it("writes success attempt audit files", async () => {
        const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), "attempt-report-"));

        await writeTopicAttemptReport({
            reportDir,
            attempt: 0,
            status: "success",
            prompt: {
                system: "system",
                user: "user",
            },
            rawModelOutput: '{"title":"Topic"}',
            parsedOutput: { title: "Topic" },
            rawDraft: { title: "Topic" },
            normalizedDraft: { title: "Topic" },
            repairedDraft: { title: "Topic" },
            validationResult: { ok: true, errors: [] },
            attemptMetadata: { strictSchema: true },
            hashes: { promptHash: "abc" },
            topicBundle: { topicId: "topic-1" },
        });

        const attemptDir = path.join(reportDir, "attempt-0");
        for (const filename of [
            "prompt.json",
            "raw-model-output.txt",
            "parsed-output.json",
            "raw-draft.json",
            "normalized-draft.json",
            "attempt-metadata.json",
            "hashes.json",
            "emitted-topic-bundle.json",
        ]) {
            await expect(fs.access(path.join(attemptDir, filename))).resolves.toBeUndefined();
        }
    });

    it("writes failure attempt audit files when diagnostics are available", async () => {
        const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), "attempt-report-"));

        await writeTopicAttemptReport({
            reportDir,
            attempt: 1,
            status: "failed",
            prompt: {
                system: "system",
                user: "user",
            },
            rawModelOutput: '{"bad":true}',
            parsedOutput: { bad: true },
            validationResult: { ok: false, errors: ["bad draft"] },
            attemptMetadata: { strictSchema: true },
            hashes: { promptHash: "abc" },
            error: new Error("boom"),
        });

        const attemptDir = path.join(reportDir, "attempt-1");
        for (const filename of [
            "prompt.json",
            "raw-model-output.txt",
            "parsed-output.json",
            "validation-result.json",
            "attempt-metadata.json",
            "hashes.json",
            "error.json",
        ]) {
            await expect(fs.access(path.join(attemptDir, filename))).resolves.toBeUndefined();
        }
    });

    it("records validation skip state in attempt metadata", async () => {
        const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), "attempt-report-"));
        const validationState = resolveCompileValidationState({
            skipSemantic: true,
        });

        await writeTopicAttemptReport({
            reportDir,
            attempt: 0,
            status: "success",
            validationState,
        });

        const attemptDir = path.join(reportDir, "attempt-0");
        const status = JSON.parse(
            await fs.readFile(path.join(attemptDir, "attempt-status.json"), "utf8"),
        );
        const persisted = JSON.parse(
            await fs.readFile(path.join(attemptDir, "validation-state.json"), "utf8"),
        );

        expect(status.validationState.semantic.skipped).toBe(true);
        expect(persisted.semantic.skipped).toBe(true);
        expect(persisted.structural.skipped).toBe(false);
    });
});
