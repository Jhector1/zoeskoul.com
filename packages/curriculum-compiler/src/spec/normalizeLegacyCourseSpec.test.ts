import { describe, expect, it } from "vitest";
import { normalizeLegacyCourseSpec } from "./normalizeLegacyCourseSpec.js";

function assertDefined<T>(
    value: T | null | undefined,
    message = "Expected value to be defined",
): asserts value is T {
    if (value == null) {
        throw new Error(message);
    }
}

describe("normalizeLegacyCourseSpec", () => {
    it("preserves authored release plan instead of overwriting it", () => {
        const spec = normalizeLegacyCourseSpec({
            authoringFormatVersion: "2.0",
            subjectSlug: "sql",
            profileId: "sql",
            title: "SQL",
            releasePlan: {
                currentRelease: {
                    name: "current",
                    startModuleNumber: 0,
                    endModuleNumber: 4,
                },
                releases: [
                    {
                        name: "current",
                        startModuleNumber: 0,
                        endModuleNumber: 4,
                    },
                ],
            },
            modules: [],
        });

        assertDefined(spec.releasePlan, "releasePlan should be defined");
        assertDefined(
            spec.releasePlan.currentRelease,
            "currentRelease should be defined",
        );
        expect(spec.releasePlan.currentRelease.endModuleNumber).toBe(4);

        const firstRelease = spec.releasePlan.releases?.[0];
        assertDefined(firstRelease, "first release should be defined");
        expect(firstRelease.endModuleNumber).toBe(4);
    });

    it("preserves authored module exercisePolicy when present", () => {
        const spec = normalizeLegacyCourseSpec({
            authoringFormatVersion: "2.0",
            subjectSlug: "sql",
            profileId: "sql",
            title: "SQL",
            modules: [
                {
                    moduleNumber: 0,
                    moduleSlug: "m0",
                    title: "Intro",
                    sections: [],
                    exercisePolicy: {
                        mix: {
                            single_choice: 0.4,
                            multi_choice: 0.1,
                            drag_reorder: 0.1,
                            fill_blank_choice: 0.2,
                            code_input: 0.2,
                        },
                    },
                },
            ],
        });

        const firstModule = spec.modules[0];
        assertDefined(firstModule, "first module should be defined");
        assertDefined(
            firstModule.exercisePolicy,
            "first module exercisePolicy should be defined",
        );
        assertDefined(
            firstModule.exercisePolicy.mix,
            "first module exercisePolicy.mix should be defined",
        );

        expect(firstModule.exercisePolicy.mix.single_choice).toBe(0.4);
    });

    it("trims overloaded moduleProject sections after known markers", () => {
        const spec = normalizeLegacyCourseSpec({
            authoringFormatVersion: "2.0",
            subjectSlug: "sql",
            profileId: "sql",
            title: "SQL",
            modules: [
                {
                    moduleNumber: 1,
                    moduleSlug: "m1",
                    title: "Module",
                    moduleProject:
                        "Build a query project.\n\nAssessment and Delivery Notes\nThis part should be removed.",
                    sections: [],
                },
            ],
        });

        expect(spec.modules[0]?.moduleProject).toBe("Build a query project.");
    });

    it("normalizes course, module, section, and topic practice settings", () => {
        const spec = normalizeLegacyCourseSpec({
            authoringFormatVersion: "2.0",
            subjectSlug: "python",
            profileId: "python",
            title: "Python",
            practiceDefaults: {
                tryIt: true,
                tryItPlacement: "first_sketch",
            },
            modules: [
                {
                    moduleNumber: 0,
                    moduleSlug: "m0",
                    title: "Intro",
                    practiceDefaults: {
                        tryItPlacement: "all_sketches",
                    },
                    sections: [
                        {
                            sectionSlug: "s0",
                            title: "Section",
                            practiceDefaults: {
                                tryItPlacement: "none",
                            },
                            topics: [
                                {
                                    topicId: "t0",
                                    title: "Topic",
                                    practice: {
                                        tryIt: true,
                                        tryItPlacement: "all_sketches",
                                        tryItExerciseIds: ["ex-1", "ex-2"],
                                        tryItSketchIndex: 1,
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        });

        expect(spec.practiceDefaults).toEqual({
            tryIt: true,
            tryItPlacement: "first_sketch",
        });
        expect(spec.modules[0]?.practiceDefaults).toEqual({
            tryItPlacement: "all_sketches",
        });
        expect(spec.modules[0]?.sections[0]?.practiceDefaults).toEqual({
            tryItPlacement: "none",
        });
        expect(spec.modules[0]?.sections[0]?.topics[0]?.practice).toEqual({
            tryIt: true,
            tryItPlacement: "all_sketches",
            tryItExerciseIds: ["ex-1", "ex-2"],
            tryItSketchIndex: 1,
        });
    });
    it("preserves the authored project brief and exact capstone step count", () => {
        const projectBrief = {
            scenario: "Build the final report.",
            role: "Analyst",
            workspace: "SQL editor",
            deliverable: "One cumulative report",
            stepCountTarget: 4,
            flow: "progressive",
            requirements: ["Preserve each earlier requirement."],
            stepLadder: [
                { step: 1, title: "Start", requirement: "Build the grain." },
                { step: 2, title: "Measure", requirement: "Add metrics." },
                { step: 3, title: "Classify", requirement: "Add labels." },
                { step: 4, title: "Finish", requirement: "Filter and sort." },
            ],
        };

        const spec = normalizeLegacyCourseSpec({
            authoringFormatVersion: "2.0",
            subjectSlug: "sql",
            courseSlug: "reporting",
            profileId: "sql",
            title: "Reporting",
            modules: [
                {
                    moduleNumber: 1,
                    moduleSlug: "reporting-module-1-capstone",
                    role: "capstone",
                    title: "Final Capstone",
                    sections: [
                        {
                            sectionSlug: "reporting-section-1-capstone",
                            role: "capstone",
                            title: "Final Capstone",
                            topics: [
                                {
                                    topicId: "final-report",
                                    title: "Final Report",
                                    projectBrief,
                                },
                            ],
                        },
                    ],
                },
            ],
        });

        expect(
            spec.modules[0]?.sections[0]?.topics[0]?.projectBrief,
        ).toEqual(projectBrief);
    });

});
