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
            policy: { projectPolicy: { capstoneRequired: false } },
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
                                    projectBrief: {
                                        stepCountTarget: 2,
                                        flow: "progressive",
                                        stepLadder: [
                                            { step: 1, title: "Start", requirement: "Build the first version." },
                                            { step: 2, title: "Finish", requirement: "Complete the deliverable." },
                                        ],
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
                            topics: [
                                {
                                    topicId: "capstone",
                                    title: "Capstone",
                                    projectBrief: {
                                        stepCountTarget: 4,
                                        flow: "progressive",
                                        stepLadder: [
                                            { step: 1, title: "Plan", requirement: "Build the base." },
                                            { step: 2, title: "Extend", requirement: "Add the second feature." },
                                            { step: 3, title: "Validate", requirement: "Check the result." },
                                            { step: 4, title: "Deliver", requirement: "Finish the project." },
                                        ],
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

    it("rejects extra planning sections inside the final capstone module", () => {
        const issues = validateCourseSpec({
            authoringFormatVersion: "2.0",
            subjectSlug: "sql",
            courseSlug: "multi-table-sql",
            catalogSlug: "sql",
            profileId: "sql",
            title: "Multi-Table SQL",
            description: "Learn joins.",
            sourceLocale: "en",
            targetLocales: [],
            policy: { projectPolicy: { capstoneRequired: true } },
            modules: [
                {
                    moduleNumber: 0,
                    moduleSlug: "multi-table-sql-module-0-foundations",
                    title: "Foundations",
                    sections: [
                        {
                            sectionSlug: "multi-table-sql-section-0-project",
                            title: "Project",
                            role: "module_project",
                            topics: [{ topicId: "project", title: "Project" }],
                        },
                    ],
                },
                {
                    moduleNumber: 1,
                    moduleSlug: "multi-table-sql-module-1-final-capstone",
                    title: "Final Capstone",
                    role: "capstone",
                    sections: [
                        {
                            sectionSlug: "multi-table-sql-section-1-planning",
                            title: "Planning",
                            topics: [{ topicId: "planning", title: "Planning" }],
                        },
                        {
                            sectionSlug: "multi-table-sql-section-1-capstone",
                            title: "Final Capstone",
                            role: "capstone",
                            topics: [
                                {
                                    topicId: "capstone",
                                    title: "Capstone",
                                    projectBrief: { stepCountTarget: 4 },
                                },
                            ],
                        },
                    ],
                },
            ],
        } as any);

        expect(issues).toContain(
            "modules[1]: capstone modules must contain exactly one section",
        );
    });

    it("requires a valid authoring-defined capstone step count and matching ladder", () => {
        const issues = validateCourseSpec({
            authoringFormatVersion: "2.0",
            subjectSlug: "sql",
            courseSlug: "multi-table-sql",
            catalogSlug: "sql",
            profileId: "sql",
            title: "Multi-Table SQL",
            description: "Learn joins.",
            sourceLocale: "en",
            targetLocales: [],
            modules: [
                {
                    moduleNumber: 0,
                    moduleSlug: "multi-table-sql-module-0-final-capstone",
                    title: "Final Capstone",
                    role: "capstone",
                    sections: [
                        {
                            sectionSlug: "multi-table-sql-section-0-final-capstone",
                            title: "Final Capstone",
                            role: "capstone",
                            topics: [
                                {
                                    topicId: "capstone",
                                    title: "Capstone",
                                    projectBrief: {
                                        stepCountTarget: 4,
                                        stepLadder: [
                                            { step: 1, title: "Start", requirement: "Build the base." },
                                            { step: 3, title: "Finish", requirement: "Finish it." },
                                        ],
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        } as any);

        expect(issues).toContain(
            "modules[0].sections[0].topics[0].projectBrief.stepLadder must contain exactly 4 step(s) to match stepCountTarget",
        );
        expect(issues).toContain(
            "modules[0].sections[0].topics[0].projectBrief.stepLadder[1].step must equal 2",
        );
    });

    it("requires projectBrief on the single final capstone topic", () => {
        const issues = validateCourseSpec({
            authoringFormatVersion: "2.0",
            subjectSlug: "sql",
            courseSlug: "multi-table-sql",
            catalogSlug: "sql",
            profileId: "sql",
            title: "Multi-Table SQL",
            description: "Learn joins.",
            sourceLocale: "en",
            targetLocales: [],
            modules: [
                {
                    moduleNumber: 0,
                    moduleSlug: "multi-table-sql-module-0-final-capstone",
                    title: "Final Capstone",
                    role: "capstone",
                    sections: [
                        {
                            sectionSlug: "multi-table-sql-section-0-final-capstone",
                            title: "Final Capstone",
                            role: "capstone",
                            topics: [{ topicId: "capstone", title: "Capstone" }],
                        },
                    ],
                },
            ],
        } as any);

        expect(issues).toContain(
            "modules[0].sections[0].topics[0].projectBrief is required for the final capstone topic",
        );
    });

    it("allows an explicit capstone opt-out for exceptional courses", () => {
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
            policy: { projectPolicy: { capstoneRequired: false } },
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
    it("enforces the opt-in explicit module and section slug convention", () => {
        const baseSpec = {
            authoringFormatVersion: "2.0",
            subjectSlug: "sql",
            courseSlug: "sql-analysis-reporting",
            catalogSlug: "sql",
            profileId: "sql",
            title: "SQL Analysis & Reporting",
            description: "Build reporting queries.",
            sourceLocale: "en",
            targetLocales: [],
            policy: {
                projectPolicy: {
                    capstoneRequired: false,
                },
                qualityPolicy: {
                    slugConvention: "explicit_module_section",
                },
            },
            modules: [
                {
                    moduleNumber: 0,
                    moduleSlug: "sql-analysis-reporting-module-0-foundations",
                    title: "Foundations",
                    sections: [
                        {
                            sectionSlug: "sql-analysis-reporting-section-0-readable-output",
                            title: "Readable Output",
                            topics: [{ topicId: "aliases", title: "Aliases" }],
                        },
                    ],
                },
            ],
        } as any;

        expect(validateCourseSpec(baseSpec)).toEqual([]);

        const issues = validateCourseSpec({
            ...baseSpec,
            modules: [
                {
                    ...baseSpec.modules[0],
                    moduleSlug: "sql-analysis-reporting-0-foundations",
                    sections: [
                        {
                            ...baseSpec.modules[0].sections[0],
                            sectionSlug: "sql-analysis-reporting-0-readable-output",
                        },
                    ],
                },
            ],
        } as any);

        expect(issues).toContain(
            'modules[0].moduleSlug must start with "sql-analysis-reporting-module-0-" and include a descriptive suffix when slugConvention="explicit_module_section"',
        );
        expect(issues).toContain(
            'modules[0].sections[0].sectionSlug must start with "sql-analysis-reporting-section-0-" and include a descriptive suffix when slugConvention="explicit_module_section"',
        );
    });

    it("validates cumulative project journey roots and milestone references", () => {
        const spec = {
            authoringFormatVersion: "2.0",
            subjectSlug: "python",
            courseSlug: "project-journeys",
            catalogSlug: "python",
            profileId: "python",
            title: "Project Journeys",
            description: "Test cumulative project metadata.",
            sourceLocale: "en",
            targetLocales: [],
            projectJourneys: [
                {
                    id: "guided",
                    role: "guided",
                    title: "Guided project",
                    repositoryPath: "guided-project",
                    continuity: "course",
                    supportLevel: "guided",
                    milestoneOrder: ["start", "finish"],
                },
                {
                    id: "parallel",
                    role: "module_project",
                    title: "Parallel project",
                    repositoryPath: "guided-project",
                    continuity: "cross_module",
                    supportLevel: "reapplication",
                    milestoneOrder: ["start", "finish"],
                },
            ],
            modules: [
                {
                    moduleNumber: 1,
                    moduleSlug: "project-journeys-1",
                    title: "Module 1",
                    sections: [
                        {
                            sectionSlug: "project-journeys-1-core",
                            title: "Core",
                            topics: [
                                {
                                    topicId: "guided-step",
                                    title: "Guided Step",
                                    projectJourney: {
                                        journeyId: "guided",
                                        entryMilestone: "finish",
                                        exitMilestone: "start",
                                    },
                                    projectBrief: {
                                        journeyId: "parallel",
                                        continuesFromMilestone: "start",
                                        finalMilestone: "finish",
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        } as any;

        const issues = validateCourseSpec(spec);

        expect(issues).toContain(
            'projectJourneys[1]: repositoryPath "guided-project" is reused by another journey',
        );
        expect(issues).toContain(
            "projectJourneys[1] must be referenced by at least one topic",
        );
        expect(issues).toContain(
            "modules[0].sections[0].topics[0].projectJourney: entryMilestone must not come after exitMilestone",
        );
        expect(issues).toContain(
            "modules[0].sections[0].topics[0].projectJourney: projectBrief.journeyId must match projectJourney.journeyId",
        );
        expect(issues).toContain(
            "modules[0].sections[0].topics[0].projectJourney: projectBrief.continuesFromMilestone must match projectJourney.entryMilestone",
        );
        expect(issues).toContain(
            "modules[0].sections[0].topics[0].projectJourney: projectBrief.finalMilestone must match projectJourney.exitMilestone",
        );
    });


    it("rejects broken journey handoffs and section-role mismatches", () => {
        const spec = {
            authoringFormatVersion: "2.0",
            subjectSlug: "git",
            courseSlug: "journey-continuity",
            catalogSlug: "git",
            profileId: "git",
            title: "Journey Continuity",
            sourceLocale: "en",
            targetLocales: [],
            projectJourneys: [
                {
                    id: "guided",
                    role: "guided",
                    title: "Guided repository",
                    repositoryPath: "guided-repository",
                    continuity: "course",
                    supportLevel: "guided",
                    milestoneOrder: ["start", "middle", "finish"],
                },
            ],
            modules: [
                {
                    moduleNumber: 1,
                    moduleSlug: "journey-continuity-1",
                    title: "Module 1",
                    sections: [
                        {
                            sectionSlug: "journey-continuity-1-project",
                            title: "Project",
                            role: "module_project",
                            topics: [
                                {
                                    topicId: "first-step",
                                    title: "First Step",
                                    projectJourney: {
                                        journeyId: "guided",
                                        entryMilestone: "start",
                                        exitMilestone: "middle",
                                    },
                                },
                                {
                                    topicId: "second-step",
                                    title: "Second Step",
                                    projectJourney: {
                                        journeyId: "guided",
                                        entryMilestone: "start",
                                        exitMilestone: "finish",
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        } as any;

        const issues = validateCourseSpec(spec);

        expect(issues).toContain(
            'modules[0].sections[0].topics[0].projectJourney: section role "module_project" requires a "module_project" project journey',
        );
        expect(issues).toContain(
            'modules[0].sections[0].topics[1].projectJourney: entryMilestone "start" must continue from previous exitMilestone "middle" for journey "guided"',
        );
    });

});
