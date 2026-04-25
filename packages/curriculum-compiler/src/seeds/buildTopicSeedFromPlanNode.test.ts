
import { describe, expect, it, vi } from "vitest";

vi.mock("@zoeskoul/curriculum-profiles", () => ({
    getProfileAdapter: vi.fn(() => ({
        buildTopicSeed: vi.fn(({ blueprint, module, section, topic }) => ({
            subjectSlug: "sql",
            profileId: blueprint.profileId,
            moduleSlug: module.slug,
            sectionSlug: section.slug,
            topicId: topic.topicId,
            order: topic.order,
            title: topic.title,
            summary: topic.summary,
            minutes: topic.minutes,
            moduleTitle: module.title,
            modulePurpose: module.purpose,
            moduleObjectives: module.learningObjectives,
            guidedExercises: module.guidedExercises,
            quizFocus: module.quizFocus,
            moduleProject: module.moduleProject,
            sectionTitle: section.title,
            sourceLocale: "en",
            targetLocales: ["en"],
            exercisePolicy: module.exercisePolicy,
        })),
    })),
}));

import { buildTopicSeedFromPlanNode } from "./buildTopicSeedFromPlanNode.js";

describe("buildTopicSeedFromPlanNode", () => {
    it("attaches exercisePolicy and plannedExerciseCounts", () => {
        const seed = buildTopicSeedFromPlanNode({
            blueprint: {
                profileId: "sql",
                teachingStyle: {
                    quizWeight: 0.5,
                    codeInputWeight: 0.2,
                },
            } as any,
            spec: {
                modules: [],
            } as any,
            module: {
                moduleSlug: "m0",
                title: "Module 0",
                order: 1,
                purpose: "Intro",
                learningObjectives: ["Obj 1"],
                guidedExercises: ["Ex 1"],
                quizFocus: ["Focus 1"],
                moduleProject: "Proj",
            } as any,
            section: {
                sectionSlug: "s0",
                title: "Section 0",
                order: 1,
            } as any,
            topic: {
                topicId: "t0",
                order: 1,
                title: "Topic 0",
                summary: "Summary",
                minutes: 15,
                learningGoals: ["Goal 1"],
            } as any,
        });

        expect(seed.exercisePolicy).toBeDefined();
        expect(seed.plannedExerciseCounts).toBeDefined();
        expect(seed.plannedExerciseCounts?.total).toBe(5);
    });
});