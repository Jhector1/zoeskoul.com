
import { describe, expect, it, vi } from "vitest";
import { stableJsonStringify } from "../reports/stableHash.js";

vi.mock("@zoeskoul/curriculum-profiles", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@zoeskoul/curriculum-profiles")>();

    return {
        ...actual,
        getProfileExercisePolicy: vi.fn(() => ({
            total: 11,
            dominantKind: "code_input",
            counts: {
                single_choice: 2,
                multi_choice: 2,
                drag_reorder: 2,
                fill_blank_choice: 2,
                code_input: 3,
            },
        })),
        getSqlModuleDatasetPolicy: vi.fn(() => ({
            datasetId: "orders",
        })),
    };
});

import { buildTopicSeedFromPlanNode } from "./buildTopicSeedFromPlanNode.js";

function makeBaseArgs(overrides: Partial<any> = {}) {
    return {
        blueprint: {
            profileId: "python",
            teachingStyle: {
                quizWeight: 0.5,
                codeInputWeight: 0.2,
            },
            ...overrides.blueprint,
        } as any,
        spec: {
            modules: [],
            ...overrides.spec,
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
            ...overrides.module,
        } as any,
        section: {
            sectionSlug: "s0",
            title: "Section 0",
            order: 1,
            ...overrides.section,
        } as any,
        topic: {
            topicId: "t0",
            order: 1,
            title: "Topic 0",
            summary: "Summary",
            minutes: 15,
            learningGoals: ["Goal 1"],
            ...overrides.topic,
        } as any,
    };
}

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
        expect(seed.plannedExerciseCounts?.total).toBe(11);
    });

    it("honors topic-level generation target overrides", () => {
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
                topicPolicies: {
                    conceptual_topic: {
                        generationTargets: {
                            quizBankMin: 4,
                            quizBankTarget: 5,
                            projectCodeInputMin: 0,
                            projectCodeInputTarget: 1,
                            projectCodeInputMax: 1,
                        },
                    },
                },
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
                topicId: "conceptual_topic",
                order: 1,
                title: "Topic 0",
                summary: "Summary",
                minutes: 15,
                learningGoals: ["Goal 1"],
            } as any,
        });

        expect(seed.generationTargets.quizBankTarget).toBe(5);
        expect(seed.generationTargets.projectCodeInputTarget).toBe(1);
        expect(seed.plannedExerciseCounts?.total).toBe(6);
        expect(seed.plannedExerciseCounts?.counts.code_input).toBe(1);
    });

    it("applies shared conceptual-only generation policy to every profile", () => {
        const seed = buildTopicSeedFromPlanNode({
            blueprint: {
                profileId: "python",
                teachingStyle: {
                    quizWeight: 0.5,
                    codeInputWeight: 0.5,
                },
            } as any,
            spec: {
                modules: [],
                policy: {
                    exercisePolicy: {
                        generationTargets: {
                            quizBankTarget: 8,
                            projectCodeInputMin: 3,
                            projectCodeInputTarget: 5,
                            projectCodeInputMax: 5,
                        },
                    },
                },
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
                topicId: "what-python-is",
                order: 1,
                title: "What Python Is",
                summary: "Conceptual introduction.",
                minutes: 12,
                technical: false,
                learningGoals: ["Explain what Python is used for"],
            } as any,
        });

        expect(seed.technical).toBe(false);
        expect(seed.generationTargets.projectCodeInputMin).toBe(0);
        expect(seed.generationTargets.projectCodeInputTarget).toBe(0);
        expect(seed.generationTargets.projectCodeInputMax).toBe(0);
        expect(seed.plannedExerciseCounts?.counts.code_input).toBe(0);
    });

    it("treats orientation-style topics as conceptual-only even when a new course marks technical true", () => {
        const seed = buildTopicSeedFromPlanNode({
            blueprint: {
                profileId: "bash",
                teachingStyle: {
                    quizWeight: 0.5,
                    codeInputWeight: 0.5,
                },
            } as any,
            spec: {
                modules: [],
            } as any,
            module: {
                moduleSlug: "linux-module-1-terminal-navigation",
                title: "Terminal Navigation",
                order: 1,
                purpose: "Intro",
                learningObjectives: ["Obj 1"],
                guidedExercises: ["Ex 1"],
                quizFocus: ["Focus 1"],
                moduleProject: "Proj",
            } as any,
            section: {
                sectionSlug: "linux-module-1-orientation",
                title: "Orientation",
                order: 1,
            } as any,
            topic: {
                topicId: "what-the-terminal-is",
                order: 1,
                title: "What the Terminal Is",
                summary: "Understand what the terminal is before using commands.",
                minutes: 15,
                technical: true,
                learningGoals: ["Explain what the terminal is"],
            } as any,
        });

        expect(seed.generationTargets.projectCodeInputMin).toBe(0);
        expect(seed.generationTargets.projectCodeInputTarget).toBe(0);
        expect(seed.generationTargets.projectCodeInputMax).toBe(0);
        expect(seed.plannedExerciseCounts?.counts.code_input).toBe(0);
    });

    it("honors explicit Python intro-topic overrides that keep code_input to one", () => {
        const seed = buildTopicSeedFromPlanNode({
            blueprint: {
                profileId: "python",
                teachingStyle: {
                    quizWeight: 0.5,
                    codeInputWeight: 0.5,
                },
            } as any,
            spec: {
                modules: [],
                topicPolicies: {
                    "running-python-code": {
                        generationTargets: {
                            quizBankMin: 6,
                            quizBankTarget: 8,
                            projectCodeInputMin: 1,
                            projectCodeInputTarget: 1,
                            projectCodeInputMax: 1,
                        },
                    },
                },
            } as any,
            module: {
                moduleSlug: "python-v2-0",
                title: "Getting Started with Python",
                order: 1,
                purpose: "Intro",
                learningObjectives: ["Obj 1"],
                guidedExercises: ["Ex 1"],
                quizFocus: ["Focus 1"],
                moduleProject: "Proj",
            } as any,
            section: {
                sectionSlug: "setup-and-first-programs",
                title: "Setup and First Programs",
                order: 1,
            } as any,
            topic: {
                topicId: "running-python-code",
                order: 1,
                title: "Running Python Code",
                summary: "Use the browser code editor and output panel.",
                minutes: 18,
                technical: true,
                learningGoals: ["Run code", "Read output"],
            } as any,
        });

        expect(seed.generationTargets.projectCodeInputTarget).toBe(1);
        expect(seed.plannedExerciseCounts?.counts.code_input).toBe(1);
    });

    it("uses profile.project defaults for module_project topics", () => {
        const seed = buildTopicSeedFromPlanNode(
            makeBaseArgs({
                section: {
                    role: "module_project",
                },
            }),
        );

        expect(seed.generationTargets.quizBankMin).toBe(0);
        expect(seed.generationTargets.quizBankTarget).toBe(0);
        expect(seed.generationTargets.quizVisibleDefault).toBe(0);
        expect(seed.generationTargets.quizVisibleMax).toBe(0);
        expect(seed.generationTargets.projectCodeInputTarget).toBe(3);
        expect(seed.practice).toEqual({
            conceptualOnly: false,
            requiresTryIt: true,
            tryIt: true,
            tryItPlacement: "all_sketches",
            tryItSketchIndex: 0,
            projectFlow: "progressive",
        });
    });

    it("uses profile.project defaults for capstone topics", () => {
        const seed = buildTopicSeedFromPlanNode(
            makeBaseArgs({
                module: {
                    role: "capstone",
                },
            }),
        );

        expect(seed.generationTargets.quizBankMin).toBe(0);
        expect(seed.generationTargets.quizBankTarget).toBe(0);
        expect(seed.generationTargets.projectCodeInputTarget).toBe(5);
        expect(seed.generationTargets.projectCodeInputMax).toBeGreaterThanOrEqual(5);
        expect(seed.practice).toEqual({
            conceptualOnly: false,
            requiresTryIt: true,
            tryIt: true,
            tryItPlacement: "all_sketches",
            tryItSketchIndex: 0,
            projectFlow: "progressive",
        });
    });

    it("uses the authoring-defined capstone step count instead of the profile default", () => {
        const projectBrief = {
            stepCountTarget: 4,
            flow: "progressive",
            stepLadder: [
                { step: 1, title: "Start", requirement: "Build the base." },
                { step: 2, title: "Extend", requirement: "Add the second metric." },
                { step: 3, title: "Validate", requirement: "Check the grain." },
                { step: 4, title: "Deliver", requirement: "Finish the report." },
            ],
        } as const;
        const seed = buildTopicSeedFromPlanNode(
            makeBaseArgs({
                module: {
                    role: "capstone",
                },
                section: {
                    role: "capstone",
                },
                topic: {
                    projectBrief,
                },
            }),
        );

        expect(seed.projectBrief).toEqual(projectBrief);
        expect(seed.generationTargets.projectCodeInputMin).toBe(4);
        expect(seed.generationTargets.projectCodeInputTarget).toBe(4);
        expect(seed.generationTargets.projectCodeInputMax).toBe(4);
        expect(seed.plannedExerciseCounts?.counts.code_input).toBe(4);
        expect(seed.plannedExerciseCounts?.total).toBe(4);
    });

    it("uses profile-owned layouts instead of inferring presentation from capabilities", () => {
        const gitSeed = buildTopicSeedFromPlanNode(
            makeBaseArgs({
                blueprint: {
                    subjectSlug: "git-foundations",
                    courseSlug: "git-foundations",
                    profileId: "git",
                },
            }),
        );
        const bashSeed = buildTopicSeedFromPlanNode(
            makeBaseArgs({
                blueprint: {
                    subjectSlug: "linux-terminal-fundamentals",
                    courseSlug: "linux-terminal-fundamentals",
                    profileId: "bash",
                },
            }),
        );

        expect(gitSeed.moduleServiceDefaults).toMatchObject({
            preset: "runner",
            runnerBackend: "pty",
            layoutMode: "default",
            terminalBootstrap: {
                gitSafeDirectories: ["/workspace/*"],
            },
            requires: { files: true, multiFile: true, terminal: true },
        });
        expect(bashSeed.moduleServiceDefaults).toMatchObject({
            preset: "runner",
            runnerBackend: "pty",
            layoutMode: "terminal_workspace",
            requires: { files: true, multiFile: true, terminal: true },
        });
    });

    it("keeps authored module IDE policy above the profile default", () => {
        const seed = buildTopicSeedFromPlanNode(
            makeBaseArgs({
                blueprint: {
                    subjectSlug: "git-foundations",
                    courseSlug: "git-foundations",
                    profileId: "git",
                    idePolicy: {
                        moduleServiceDefaults: {
                            m0: { layoutMode: "terminal_workspace" },
                        },
                    },
                },
            }),
        );

        expect(seed.moduleServiceDefaults).toMatchObject({
            layoutMode: "terminal_workspace",
            terminalBootstrap: {
                gitSafeDirectories: ["/workspace/*"],
            },
        });
    });

    it("keeps normal lesson topics on quiz targets", () => {
        const seed = buildTopicSeedFromPlanNode(makeBaseArgs());

        expect(seed.generationTargets.quizBankTarget).toBe(8);
        expect(seed.generationTargets.projectCodeInputTarget).toBe(3);
    });

    it("uses profile.practice defaults for normal Python lesson topics", () => {
        const seed = buildTopicSeedFromPlanNode(makeBaseArgs());

        expect(seed.practice).toEqual({
            conceptualOnly: false,
            requiresTryIt: true,
            tryIt: true,
            tryItPlacement: "all_sketches",
            tryItSketchIndex: 0,
        });
    });

    it("flows section practiceDefaults tryItPlacement into topic seed practice", () => {
        const seed = buildTopicSeedFromPlanNode(
            makeBaseArgs({
                section: {
                    practiceDefaults: {
                        tryIt: true,
                        tryItPlacement: "all_sketches",
                    },
                },
            }),
        );

        expect(seed.practice).toEqual({
            conceptualOnly: false,
            requiresTryIt: true,
            tryIt: true,
            tryItPlacement: "all_sketches",
            tryItSketchIndex: 0,
        });
    });

    it("lets topic.practice.tryItPlacement override section defaults", () => {
        const seed = buildTopicSeedFromPlanNode(
            makeBaseArgs({
                section: {
                    practiceDefaults: {
                        tryIt: true,
                        tryItPlacement: "all_sketches",
                    },
                },
                topic: {
                    practice: {
                        tryItPlacement: "first_sketch",
                    },
                },
            }),
        );

        expect(seed.practice).toEqual({
            conceptualOnly: false,
            requiresTryIt: true,
            tryIt: true,
            tryItPlacement: "first_sketch",
            tryItSketchIndex: 0,
        });
    });

    it("lets topic.practice.tryIt false disable inherited section tryIt", () => {
        const seed = buildTopicSeedFromPlanNode(
            makeBaseArgs({
                section: {
                    practiceDefaults: {
                        tryIt: true,
                        tryItPlacement: "all_sketches",
                    },
                },
                topic: {
                    practice: {
                        tryIt: false,
                    },
                },
            }),
        );

        expect(seed.practice).toEqual({
            conceptualOnly: false,
            requiresTryIt: true,
            tryIt: false,
            tryItPlacement: "all_sketches",
        });
    });

    it("inherits base try-it policy when the profile has no project capability", () => {
        const seed = buildTopicSeedFromPlanNode(
            makeBaseArgs({
                blueprint: {
                    profileId: "math",
                },
                section: {
                    role: "module_project",
                },
            }),
        );

        expect(seed.generationTargets.quizBankTarget).toBe(8);
        expect(seed.generationTargets.projectCodeInputTarget).toBe(3);
        expect(seed.practice).toEqual({
            conceptualOnly: false,
            requiresTryIt: true,
            tryIt: true,
            tryItPlacement: "all_sketches",
            tryItSketchIndex: 0,
        });
    });

    it("builds stable topic seeds for the same inputs", () => {
        const args = {
            blueprint: {
                profileId: "python",
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
        };

        const first = buildTopicSeedFromPlanNode(args);
        const second = buildTopicSeedFromPlanNode(args);

        expect(stableJsonStringify(first)).toBe(stableJsonStringify(second));
    });

    it("passes authored module, section, and practice metadata through to the topic seed", () => {
        const seed = buildTopicSeedFromPlanNode({
            blueprint: {
                profileId: "python",
                teachingStyle: {
                    quizWeight: 0.5,
                    codeInputWeight: 0.2,
                },
            } as any,
            spec: {
                modules: [],
            } as any,
            module: {
                moduleSlug: "python-v2-4",
                title: "Capstone",
                order: 4,
                role: "capstone",
                purpose: "Build the final project",
                learningObjectives: ["Obj 1"],
            } as any,
            section: {
                sectionSlug: "final-project",
                title: "Final Project",
                order: 1,
                role: "capstone",
            } as any,
            topic: {
                topicId: "mini-gradebook",
                order: 1,
                title: "Mini Gradebook",
                summary: "Build the final program.",
                minutes: 30,
                practice: {
                    tryIt: true,
                    tryItExerciseId: "cp-1",
                    tryItSketchIndex: 0,
                    projectFlow: "progressive",
                },
            } as any,
        });

        expect(seed.moduleRole).toBe("capstone");
        expect(seed.sectionRole).toBe("capstone");
        expect(seed.practice).toEqual({
            conceptualOnly: false,
            requiresTryIt: true,
            tryIt: true,
            tryItExerciseId: "cp-1",
            tryItPlacement: "all_sketches",
            tryItSketchIndex: 0,
            projectFlow: "progressive",
        });
    });

    it("keeps old topic practice tryIt and projectFlow behavior for module project topics", () => {
        const seed = buildTopicSeedFromPlanNode(
            makeBaseArgs({
                section: {
                    role: "module_project",
                },
                topic: {
                    practice: {
                        tryIt: true,
                        tryItSketchIndex: 2,
                        projectFlow: "standalone",
                    },
                },
            }),
        );

        expect(seed.practice).toEqual({
            conceptualOnly: false,
            requiresTryIt: true,
            tryIt: true,
            tryItPlacement: "all_sketches",
            tryItSketchIndex: 2,
            projectFlow: "standalone",
        });
    });

    it("lets explicit conceptualOnly authoring disable shared try-it defaults", () => {
        const seed = buildTopicSeedFromPlanNode(
            makeBaseArgs({
                topic: {
                    technical: true,
                    practice: {
                        conceptualOnly: true,
                        requiresTryIt: false,
                    },
                },
            }),
        );

        expect(seed.generationTargets.projectCodeInputTarget).toBe(0);
        expect(seed.practice).toEqual({
            conceptualOnly: true,
            requiresTryIt: false,
            tryIt: false,
        });
    });

    it("inherits shared hands-on try-it expectations across python, bash, and sql profiles", () => {
        for (const profileId of ["python", "bash", "sql"] as const) {
            const seed = buildTopicSeedFromPlanNode(
                makeBaseArgs({
                    blueprint: {
                        profileId,
                    },
                    topic: {
                        technical: true,
                        title: `${profileId} hands-on topic`,
                        summary: "Practice a real runtime-backed skill.",
                    },
                }),
            );

            expect(seed.practice).toMatchObject({
                conceptualOnly: false,
                requiresTryIt: true,
                tryIt: true,
            });
        }
    });
    it("resolves subject through topic Tools inheritance and preserves sparse lower overrides", () => {
        const seed = buildTopicSeedFromPlanNode(
            makeBaseArgs({
                blueprint: {
                    subjectSlug: "sql",
                    courseSlug: "multi-table-sql",
                    profileId: "sql",
                    tools: {
                        defaultVisible: true,
                        defaultSurface: "editor",
                        sqlPane: { showTables: true, showErd: true },
                    },
                },
                spec: {
                    tools: { sqlPane: { showChen: false } },
                    modules: [
                        {
                            moduleSlug: "m0",
                            tools: { sqlPane: { defaultTab: "erd" } },
                            sections: [
                                {
                                    sectionSlug: "s0",
                                    tools: { defaultSurface: "results" },
                                    topics: [
                                        {
                                            topicId: "t0",
                                            learningGoals: ["Trace the relationship"],
                                            tools: { sqlPane: { defaultTab: "tables" } },
                                            lessonTools: {
                                                sketch1: { sqlPane: { defaultTab: "erd" } },
                                            },
                                            exerciseTools: {
                                                "try-t0": { defaultSurface: "editor" },
                                            },
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            }),
        );

        expect(seed.tools).toEqual({
            defaultVisible: true,
            defaultSurface: "results",
            sqlPane: {
                showTables: true,
                showErd: true,
                showChen: false,
                defaultTab: "tables",
            },
        });
        expect(seed.lessonTools).toEqual({
            sketch1: { sqlPane: { defaultTab: "erd" } },
        });
        expect(seed.exerciseTools).toEqual({
            "try-t0": { defaultSurface: "editor" },
        });
    });

    it("inherits profile runner defaults before authored course and topic overrides", () => {
        const seed = buildTopicSeedFromPlanNode(
            makeBaseArgs({
                blueprint: {
                    subjectSlug: "git",
                    courseSlug: "git-foundations",
                    profileId: "git",
                    tools: {
                        runnerPane: { compactDefaultTab: "output" },
                    },
                },
                topic: {
                    tools: { defaultSurface: "editor" },
                },
            }),
        );

        expect(seed.tools).toEqual({
            defaultSurface: "editor",
            compactDefaultSurface: "results",
            runnerPane: {
                defaultTab: "terminal",
                compactDefaultTab: "output",
            },
        });
    });

});
