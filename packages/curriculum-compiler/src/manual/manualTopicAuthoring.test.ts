import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AiProvider } from "@zoeskoul/curriculum-ai";
import type { TopicAuthoringDraft, TopicSeed } from "@zoeskoul/curriculum-contracts";
import type { ProfileServices } from "@zoeskoul/curriculum-profiles";
import { evaluateTopicDraft } from "../quality/evaluateTopicDraft.js";
import { loadManualTopicDraftFile } from "./loadManualTopicDraft.js";

const help = {
    concept: "Use the authored Kreyòl target.",
    hint_1: "Read the target carefully.",
    hint_2: "Keep the authored spelling.",
};

const draft: TopicAuthoringDraft = {
    title: "Manual Language Topic",
    summary: "A strict manually authored language topic.",
    minutes: 10,
    sketchBlocks: [{ id: "learn", title: "Learn", bodyMarkdown: "Practice **Bonjou** and **mèsi**." }],
    quizDraft: [
        { id: "choice", kind: "single_choice", title: "Choose", prompt: "Choose the greeting.", hint: "Look for bonjou.", help, options: ["Bonjou.", "Mèsi."], correctOptionIds: ["a"] },
        { id: "fill", kind: "fill_blank_choice", title: "Complete", prompt: "Complete mèsi.", hint: "Keep the accent.", help, template: "m[blank1]si", choices: ["è", "e"], correctValue: "è" },
        { id: "listen", kind: "listen_build", title: "Listen", prompt: "Build what you hear.", hint: "Use the greeting.", help, targetText: "Bonjou.", locale: "ht-HT", wordBank: ["Bonjou."] },
        { id: "voice", kind: "voice_input", title: "Speak", prompt: "Say Bonjou.", hint: "Say the complete word.", help, targetText: "Bonjou.", locale: "ht-HT" },
        { id: "bank", kind: "word_bank_arrange", title: "Build", prompt: "Build the phrase.", hint: "Start with Wi.", help, targetText: "Wi, mèsi.", locale: "ht-HT", wordBank: ["Wi,", "mèsi."] },
        { id: "text", kind: "text_input", title: "Write", prompt: "Type mèsi.", hint: "Keep è.", help, expectedText: "mèsi" },
    ],
};

const throwingProvider: AiProvider = {
    async generateJson() {
        throw new Error("AI must not be called in manual-strict mode");
    },
};

const profileServices = {
    profileId: "language",
    async repairDraft() {
        throw new Error("repairDraft must not be called in manual-strict mode");
    },
    async critiqueDraft(args: any) {
        return { topicId: args.seed.topicId, ok: true, issues: [] };
    },
    async validateProfile() {
        return [];
    },
    async validateSemantic(args: any) {
        return { topicId: args.seed.topicId, ok: true, issues: [] };
    },
    async validateGolden(args: any) {
        return { topicId: args.seed.topicId, ok: true, issues: [] };
    },
    getTrustPolicy() {
        return {
            profileId: "language",
            autoPublishEnabled: false,
            requiresCritiquePass: true,
            requiresSemanticValidation: false,
            maxHintWarnings: 0,
            maxMediumRepairs: 0,
            allowHighSeverityRepairs: false,
        };
    },
} as unknown as ProfileServices;

const seed = {
    profileId: "language",
    subjectSlug: "haitian-creole",
    courseSlug: "haitian-creole-foundations",
    moduleSlug: "haitian-creole-foundations-1-sounds-of-kreyol",
    sectionSlug: "ht1-learn-listen-speak",
    topicId: "manual-language-topic",
    exercisePolicy: { min: 6, max: 6, mix: {} },
    plannedExerciseCounts: {
        total: 6,
        counts: {
            single_choice: 1,
            multi_choice: 0,
            drag_reorder: 0,
            fill_blank_choice: 1,
            text_input: 1,
            voice_input: 1,
            word_bank_arrange: 1,
            listen_build: 1,
            pseudocode_input: 0,
            code_input: 0,
        },
    },
    generationTargets: { exerciseCount: 6 },
} as unknown as TopicSeed;

describe("manual topic authoring", () => {
    it("loads strict TopicAuthoringDraft JSON", async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zoeskoul-manual-topic-"));
        const filePath = path.join(dir, "topic.json");
        await fs.writeFile(filePath, JSON.stringify(draft, null, 2), "utf8");
        expect(await loadManualTopicDraftFile(filePath)).toEqual(draft);
    });

    it("preserves authored language kinds without AI or repair", async () => {
        const evaluated = await evaluateTopicDraft({
            provider: throwingProvider,
            seed,
            rawDraft: draft,
            profileServices,
            mode: "manual-strict",
            skipSemantic: true,
        });
        expect(evaluated.draft).toEqual(draft);
        expect(evaluated.draft.quizDraft.map((x) => x.kind)).toEqual([
            "single_choice",
            "fill_blank_choice",
            "listen_build",
            "voice_input",
            "word_bank_arrange",
            "text_input",
        ]);
        expect(evaluated.repairReport.repairs).toEqual([]);
    });
});
