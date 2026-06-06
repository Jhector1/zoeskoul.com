import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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
                            role: "capstone",
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

    it("requires explicit authored project sections before a required capstone", () => {
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
            policy: {
                projectPolicy: {
                    minProjectsBeforeCapstone: 2,
                    capstoneRequired: true,
                },
            },
            modules: [
                {
                    moduleNumber: 0,
                    moduleSlug: "python-v2-0",
                    title: "Intro",
                    sections: [
                        {
                            sectionSlug: "python-v2-0-core",
                            title: "Core",
                            topics: [{ topicId: "intro", title: "Intro" }],
                        },
                    ],
                },
                {
                    moduleNumber: 1,
                    moduleSlug: "python-v2-1",
                    title: "Strings",
                    sections: [
                        {
                            sectionSlug: "python-v2-1-core",
                            title: "Core",
                            topics: [{ topicId: "strings", title: "Strings" }],
                        },
                    ],
                },
            ],
        } as any);

        expect(issues).toContain(
            "policy.projectPolicy.minProjectsBeforeCapstone requires at least 2 authored module_project section(s) before the capstone, but found 0",
        );
        expect(issues).toContain(
            "policy.projectPolicy.capstoneRequired requires an authored capstone module or capstone section",
        );
    });

    it("accepts authored module projects and a capstone separated into their own sections", () => {
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
            policy: {
                projectPolicy: {
                    minProjectsBeforeCapstone: 2,
                    capstoneRequired: true,
                },
            },
            modules: [
                {
                    moduleNumber: 0,
                    moduleSlug: "python-v2-0",
                    title: "Intro",
                    sections: [
                        {
                            sectionSlug: "python-v2-0-core",
                            title: "Core",
                            topics: [{ topicId: "intro", title: "Intro" }],
                        },
                        {
                            sectionSlug: "python-v2-0-project",
                            title: "Project",
                            role: "module_project",
                            topics: [{ topicId: "project-0", title: "Project 0" }],
                        },
                    ],
                },
                {
                    moduleNumber: 1,
                    moduleSlug: "python-v2-1",
                    title: "Strings",
                    sections: [
                        {
                            sectionSlug: "python-v2-1-core",
                            title: "Core",
                            topics: [{ topicId: "strings", title: "Strings" }],
                        },
                        {
                            sectionSlug: "python-v2-1-project",
                            title: "Project",
                            role: "module_project",
                            topics: [{ topicId: "project-1", title: "Project 1" }],
                        },
                    ],
                },
                {
                    moduleNumber: 2,
                    moduleSlug: "python-v2-2",
                    title: "Capstone",
                    role: "capstone",
                    sections: [
                        {
                            sectionSlug: "python-v2-2-capstone",
                            title: "Final Project",
                            role: "capstone",
                            topics: [{ topicId: "capstone", title: "Capstone" }],
                        },
                    ],
                },
            ],
        } as any);

        expect(issues).toEqual([]);
    });

    it("accepts the current applied-python-projects authored structure", () => {
        const spec = JSON.parse(
            readFileSync(
                "/Users/admin/Documents/NextJSProject/zoeskoul.com/authoring/subjects/python/courses/applied-python-projects/course.spec.json",
                "utf8",
            ),
        );

        expect(validateCourseSpec(spec)).toEqual([]);
    });

    it("fails clearly when project policy requires a final capstone module", () => {
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
            policy: {
                projectPolicy: {
                    minProjectsBeforeCapstone: 1,
                    capstoneRequired: true,
                },
            },
            modules: [
                {
                    moduleNumber: 1,
                    moduleSlug: "python-v2-1",
                    title: "Module 1",
                    sections: [
                        {
                            sectionSlug: "python-v2-1-core",
                            title: "Core",
                            topics: [{ topicId: "intro", title: "Intro" }],
                        },
                        {
                            sectionSlug: "python-v2-1-project",
                            title: "Project",
                            role: "module_project",
                            topics: [{ topicId: "project-1", title: "Project 1" }],
                        },
                    ],
                },
            ],
        } as any);

        expect(issues).toContain(
            "policy.projectPolicy.capstoneRequired requires an authored capstone module or capstone section",
        );
        expect(issues).toContain(
            'policy.projectPolicy.capstoneRequired requires the final module to use role="capstone"',
        );
        expect(issues).toContain(
            "policy.projectPolicy.capstoneRequired requires the final module to contain exactly one capstone section",
        );
    });

    it("fails clearly when the final capstone module has multiple capstone sections", () => {
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
            policy: {
                projectPolicy: {
                    minProjectsBeforeCapstone: 1,
                    capstoneRequired: true,
                },
            },
            modules: [
                {
                    moduleNumber: 1,
                    moduleSlug: "python-v2-1",
                    title: "Module 1",
                    sections: [
                        {
                            sectionSlug: "python-v2-1-project",
                            title: "Project",
                            role: "module_project",
                            topics: [{ topicId: "project-1", title: "Project 1" }],
                        },
                    ],
                },
                {
                    moduleNumber: 2,
                    moduleSlug: "python-v2-2",
                    title: "Capstone",
                    role: "capstone",
                    sections: [
                        {
                            sectionSlug: "python-v2-2-capstone-a",
                            title: "Capstone A",
                            role: "capstone",
                            topics: [{ topicId: "capstone-a", title: "Capstone A" }],
                        },
                        {
                            sectionSlug: "python-v2-2-capstone-b",
                            title: "Capstone B",
                            role: "capstone",
                            topics: [{ topicId: "capstone-b", title: "Capstone B" }],
                        },
                    ],
                },
            ],
        } as any);

        expect(issues).toContain("modules[1]: only one capstone section is allowed");
        expect(issues).toContain(
            "policy.projectPolicy.capstoneRequired requires the final module to contain exactly one capstone section",
        );
    });

    it("fails clearly when the capstone section has multiple topics", () => {
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
            policy: {
                projectPolicy: {
                    minProjectsBeforeCapstone: 1,
                    capstoneRequired: true,
                },
            },
            modules: [
                {
                    moduleNumber: 1,
                    moduleSlug: "python-v2-1",
                    title: "Module 1",
                    sections: [
                        {
                            sectionSlug: "python-v2-1-project",
                            title: "Project",
                            role: "module_project",
                            topics: [{ topicId: "project-1", title: "Project 1" }],
                        },
                    ],
                },
                {
                    moduleNumber: 2,
                    moduleSlug: "python-v2-2",
                    title: "Capstone",
                    role: "capstone",
                    sections: [
                        {
                            sectionSlug: "python-v2-2-capstone",
                            title: "Capstone",
                            role: "capstone",
                            topics: [
                                { topicId: "capstone-a", title: "Capstone A" },
                                { topicId: "capstone-b", title: "Capstone B" },
                            ],
                        },
                    ],
                },
            ],
        } as any);

        expect(issues).toContain(
            "modules[1].sections[0]: capstone sections must contain exactly one topic",
        );
    });

    it("does not force capstone structure when project policy does not require it", () => {
        const issues = validateCourseSpec({
            authoringFormatVersion: "2.0",
            subjectSlug: "math",
            courseSlug: "math-foundations",
            catalogSlug: "math",
            profileId: "math",
            title: "Math Foundations",
            description: "Learn math.",
            sourceLocale: "en",
            targetLocales: [],
            modules: [
                {
                    moduleNumber: 1,
                    moduleSlug: "math-1",
                    title: "Module 1",
                    sections: [
                        {
                            sectionSlug: "math-1-core",
                            title: "Core",
                            topics: [{ topicId: "counting", title: "Counting" }],
                        },
                    ],
                },
            ],
        } as any);

        expect(issues).toEqual([]);
    });
});
