import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { TopicAuthoringDraft } from "@zoeskoul/curriculum-contracts";
import { loadTopicSourceDraftFile, writeTopicSourceDraft } from "./topicSourceDraft.js";

const draft: TopicAuthoringDraft = {
    title: "Canonical source topic",
    summary: "A strict source draft.",
    minutes: 10,
    sketchBlocks: [{ id: "learn", title: "Learn", bodyMarkdown: "Practice the concept." }],
    quizDraft: [],
};

describe("topic source drafts", () => {
    it("loads strict TopicAuthoringDraft JSON from the canonical source layer", async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zoeskoul-topic-source-"));
        const filePath = path.join(dir, "topic.json");
        await fs.writeFile(filePath, JSON.stringify(draft, null, 2), "utf8");
        expect(await loadTopicSourceDraftFile(filePath)).toEqual(draft);
    });

    it("refuses to silently overwrite a canonical source draft", async () => {
        const moduleSlug = `source-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const args = {
            subjectSlug: "python",
            courseSlug: "python-foundations",
            moduleSlug,
            topicId: "canonical-source-test",
            metadata: { version: 1 as const, origin: "manual" as const },
        };

        const first = await writeTopicSourceDraft({ ...args, draft });
        await expect(
            writeTopicSourceDraft({
                ...args,
                draft: { ...draft, title: "Different content" },
            }),
        ).rejects.toThrow("Refusing to overwrite canonical topic source draft");

        await fs.rm(path.dirname(first.sourcePath), { recursive: true, force: true });
    });
});
