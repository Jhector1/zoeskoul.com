import { afterEach, describe, expect, it } from "vitest";
import {
    mathShape,
    registerCurriculumProfile,
    unregisterCurriculumProfile,
    type CourseProfile,
} from "@zoeskoul/curriculum-profiles";
import { validateCourseSpec } from "./validateCourseSpec.js";

const testProfileId = "bad-math-profile";

afterEach(() => {
    unregisterCurriculumProfile(testProfileId);
});

describe("validateCourseSpec", () => {
    it("surfaces profile and shape capability mismatches", () => {
        const badProfile: CourseProfile = {
            id: testProfileId,
            shape: {
                ...mathShape,
                profileId: testProfileId,
                topicBundle: {
                    ...mathShape.topicBundle,
                    allowedExerciseKinds: [
                        "single_choice",
                        "multi_choice",
                        "drag_reorder",
                        "fill_blank_choice",
                        "code_input",
                    ],
                },
            },
            allowedExerciseKinds: [...mathShape.topicBundle.allowedExerciseKinds],
            allowedRecipeTypes: [],
            buildModuleRuntimeDefaults() {
                return null;
            },
            getRecipeRegistry() {
                return {};
            },
            validateTopicBundle() {
                return [];
            },
        };

        registerCurriculumProfile(badProfile);

        const issues = validateCourseSpec({
            authoringFormatVersion: "2.0",
            subjectSlug: "math",
            courseSlug: "math-foundations",
            catalogSlug: "math",
            profileId: testProfileId,
            title: "Math Foundations",
            sourceLocale: "en",
            targetLocales: [],
            modules: [
                {
                    moduleNumber: 1,
                    moduleSlug: "math-1",
                    title: "Intro",
                    sections: [
                        {
                            sectionSlug: "math-1-core-concepts-1",
                            title: "Basics",
                            topics: [{ topicId: "counting", title: "Counting" }],
                        },
                    ],
                },
            ],
        } as any);

        expect(issues).toContain(
            'Profile "bad-math-profile" shape allows "code_input" but profile.allowedExerciseKinds does not. Update bad-math-profile shape or bad-math-profile profile so capabilities agree.',
        );
        expect(issues).toContain(
            'Profile "bad-math-profile" shape allows "code_input" but profile does not support code_input. Update bad-math-profile shape or add codeInput support to the profile.',
        );
    });

    it("accepts authored module roles, section roles, and topic practice metadata", () => {
        const issues = validateCourseSpec({
            authoringFormatVersion: "2.0",
            subjectSlug: "python",
            courseSlug: "python-v2",
            catalogSlug: "python",
            profileId: "python",
            title: "Python",
            description: "Learn Python.",
            sourceLocale: "en",
            targetLocales: [],
            modules: [
                {
                    moduleNumber: 1,
                    moduleSlug: "python-1",
                    title: "Module 1",
                    role: "capstone",
                    sections: [
                        {
                            sectionSlug: "python-1-project",
                            title: "Project",
                            role: "module_project",
                            topics: [
                                {
                                    topicId: "helper-modules",
                                    title: "Helper Modules",
                                    practice: {
                                        tryIt: true,
                                        tryItExerciseId: "try-helper",
                                        tryItSketchIndex: 0,
                                        projectFlow: "progressive",
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        } as any);

        expect(issues).toEqual([]);
    });

    it("rejects invalid authored role and practice metadata", () => {
        const issues = validateCourseSpec({
            authoringFormatVersion: "2.0",
            subjectSlug: "python",
            courseSlug: "python-v2",
            catalogSlug: "python",
            profileId: "python",
            title: "Python",
            description: "Learn Python.",
            sourceLocale: "en",
            targetLocales: [],
            modules: [
                {
                    moduleNumber: 1,
                    moduleSlug: "python-1",
                    title: "Module 1",
                    role: "finale",
                    sections: [
                        {
                            sectionSlug: "python-1-project",
                            title: "Project",
                            role: "practice",
                            topics: [
                                {
                                    topicId: "helper-modules",
                                    title: "Helper Modules",
                                    practice: {
                                        tryIt: "yes",
                                        tryItExerciseId: "",
                                        tryItSketchIndex: -1,
                                        projectFlow: "chained",
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        } as any);

        expect(issues).toContain(
            'modules[0].role must be "standard" or "capstone" when provided',
        );
        expect(issues).toContain(
            'modules[0].sections[0].role must be "lesson", "module_project", or "capstone" when provided',
        );
        expect(issues).toContain(
            "modules[0].sections[0].topics[0].practice.tryIt must be a boolean when provided",
        );
        expect(issues).toContain(
            "modules[0].sections[0].topics[0].practice.tryItExerciseId must be non-empty when provided",
        );
        expect(issues).toContain(
            "modules[0].sections[0].topics[0].practice.tryItSketchIndex must be a non-negative number when provided",
        );
        expect(issues).toContain(
            'modules[0].sections[0].topics[0].practice.projectFlow must be "standalone" or "progressive" when provided',
        );
    });
});
