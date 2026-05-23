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
});
