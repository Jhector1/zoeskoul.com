import { describe, expect, it } from "vitest";
import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import { languageShape } from "@zoeskoul/curriculum-profiles";
import { buildMessagesFromDraft } from "./buildMessagesFromDraft.js";
import { buildTopicBundleFromDraft } from "./buildTopicBundleFromDraft.js";

const help = {
    concept: "Greeting concept",
    hint_1: "Use the sketch.",
    hint_2: "Focus on Bonjou.",
};

const seed = {
    subjectSlug: "haitian-creole",
    profileId: "language",
    moduleSlug: "haitian-creole-foundations-1",
    sectionSlug: "greetings",
    topicId: "dedicated-greetings",
    minutes: 12,
    moduleTitle: "Bonjou!",
    modulePurpose: "Use basic greetings.",
    moduleObjectives: [],
    guidedExercises: [],
    quizFocus: [],
    sectionTitle: "Greetings",
    sourceLocale: "en",
    targetLocales: ["en"],
    modulePrefix: "ht1",
    moduleOrder: 1,
    sectionOrder: 1,
    moduleRuntimeDefaults: null,
    practice: {
        tryIt: false,
    },
} as unknown as TopicSeed;

const draft: TopicAuthoringDraft = {
    title: "Dedicated greetings",
    summary: "The sketch has its own exercises.",
    minutes: 12,
    sketchBlocks: [
        {
            id: "greeting-basics",
            title: "Greeting basics",
            bodyMarkdown: "This sketch teaches **Bonjou**.",
            tryItExercises: [
                {
                    id: "try-greeting-listen",
                    kind: "listen_build",
                    title: "Hear Bonjou",
                    prompt: "Build the greeting taught in this sketch.",
                    hint: "Listen again.",
                    help,
                    targetText: "Bonjou.",
                    locale: "ht-HT",
                },
                {
                    id: "try-greeting-speak",
                    kind: "voice_input",
                    title: "Say Bonjou",
                    prompt: "Say the greeting taught in this sketch.",
                    hint: "Say Bonjou.",
                    help,
                    targetText: "Bonjou.",
                    locale: "ht-HT",
                },
            ],
        },
    ],
    quizDraft: [
        {
            id: "normal-choice",
            kind: "single_choice",
            title: "Normal quiz",
            prompt: "Which one is a greeting?",
            hint: "Choose Bonjou.",
            help,
            options: ["Bonjou", "Orevwa"],
            correctOptionIds: ["a"],
        },
    ],
};

describe("dedicated sketch Try It emission", () => {
    it("keeps dedicated exercises out of the normal quiz pool", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: languageShape,
            seed,
            draft,
        });

        const sketch = bundle.cards.find(
            (card) => card.id === "sketch0",
        ) as any;

        expect(sketch.tryIt).toMatchObject({
            exerciseKey: "try-greeting-listen",
            exerciseKeys: [
                "try-greeting-listen",
                "try-greeting-speak",
            ],
            preferKind: null,
        });

        const listen = bundle.exercises.find(
            (exercise) => exercise.id === "try-greeting-listen",
        );
        const speak = bundle.exercises.find(
            (exercise) => exercise.id === "try-greeting-speak",
        );
        const normal = bundle.exercises.find(
            (exercise) => exercise.id === "normal-choice",
        );

        expect(listen?.purpose).toBe("project");
        expect(speak?.purpose).toBe("project");
        expect(normal?.purpose).toBe("quiz");

        const quizCard = bundle.cards.find(
            (card) => card.id === "quiz",
        ) as any;
        expect(quizCard?.kind).toBe("quiz");
        expect(quizCard?.quiz).toMatchObject({
            n: 1,
            min: 1,
            max: 1,
        });

        expect(
            bundle.exercises
                .filter((exercise) => exercise.purpose === "quiz")
                .map((exercise) => exercise.id),
        ).toEqual(["normal-choice"]);

        expect(
            bundle.exercises
                .filter((exercise) => exercise.purpose === "project")
                .map((exercise) => exercise.id),
        ).toEqual(
            expect.arrayContaining([
                "try-greeting-listen",
                "try-greeting-speak",
            ]),
        );
    });

    it("emits messages for both dedicated exercises and the Try It container", () => {
        const messages = buildMessagesFromDraft({
            shape: languageShape,
            seed,
            draft,
        });

        const serialized = JSON.stringify(messages);
        expect(serialized).toContain("try-greeting-listen");
        expect(serialized).toContain("try-greeting-speak");
        expect(serialized).toContain("try_dedicated_greetings_sketch0");
    });
});
