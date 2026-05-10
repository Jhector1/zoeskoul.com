import { describe, expect, it } from "vitest";
import { validateTopicBundleIdentity } from "./validateTopicBundleIdentity.js";

describe("validateTopicBundleIdentity", () => {
    it("fails when emitted moduleSlug drifts from TopicSeed", () => {
        expect(() =>
            validateTopicBundleIdentity({
                location: "python-v2-0/python-v2-0-setup-and-first-programs/running-python-code",
                seed: {
                    subjectSlug: "python-v2",
                    profileId: "python",
                    moduleSlug: "python-v2-0",
                    modulePrefix: "pyv2_0",
                    moduleOrder: 1,
                    sectionSlug: "python-v2-0-setup-and-first-programs",
                    sectionOrder: 1,
                    topicId: "running-python-code",
                    order: 2,
                    title: "Running Python Code",
                    summary: "Use the browser editor.",
                    minutes: 18,
                    moduleTitle: "Getting Started with Python",
                    moduleObjectives: [],
                    guidedExercises: [],
                    quizFocus: [],
                    sectionTitle: "Setup and First Programs",
                    sourceLocale: "en",
                    targetLocales: [],
                },
                topicBundle: {
                    topicId: "running-python-code",
                    subjectSlug: "python-v2",
                    moduleSlug: "python-0",
                    sectionSlug: "python-v2-python-0-core-building-blocks-1",
                    prefix: "pyv2_0",
                    minutes: 18,
                    topic: {
                        labelKey: "topics.python-v2.python-0.running-python-code.label",
                        summaryKey: "topics.python-v2.python-0.running-python-code.summary",
                    },
                    cards: [],
                    sketches: [],
                    exercises: [],
                },
            }),
        ).toThrow(/Topic bundle identity mismatch/);
    });
});