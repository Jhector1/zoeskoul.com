import { describe, expect, it } from "vitest";
import { buildPlanFromSpec } from "./buildPlanFromSpec.js";

describe("buildPlanFromSpec", () => {
    it("preserves the authored project brief and exact capstone step target", () => {
        const projectBrief = {
            scenario: "Build one final relational report.",
            role: "SQL reporting specialist",
            deliverable: "A complete participation report.",
            stepCountTarget: 4,
            flow: "progressive" as const,
            stepLadder: [
                { step: 1, title: "Start", requirement: "Build the base query." },
                { step: 2, title: "Extend", requirement: "Add counts." },
                { step: 3, title: "Validate", requirement: "Check the grain." },
                { step: 4, title: "Deliver", requirement: "Finish the report." },
            ],
        };

        const plan = buildPlanFromSpec({
            blueprint: {
                subjectSlug: "sql",
                courseSlug: "multi-table-sql",
                profileId: "sql",
            } as any,
            spec: {
                authoringFormatVersion: "2.0",
                subjectSlug: "sql",
                courseSlug: "multi-table-sql",
                catalogSlug: "sql",
                profileId: "sql",
                title: "Multi-Table SQL",
                sourceLocale: "en",
                targetLocales: [],
                modules: [
                    {
                        moduleNumber: 3,
                        moduleSlug: "multi-table-sql-module-3-final-capstone",
                        role: "capstone",
                        title: "Final Capstone",
                        sections: [
                            {
                                sectionSlug: "multi-table-sql-section-3-final-capstone",
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
            } as any,
        });

        expect(plan.modules[0]?.sections[0]?.topics[0]?.projectBrief).toEqual(
            projectBrief,
        );
    });

    it("preserves hierarchical Tools policy scopes in the plan", () => {
        const plan = buildPlanFromSpec({
            blueprint: {
                subjectSlug: "sql",
                courseSlug: "multi-table-sql",
                profileId: "sql",
                tools: {
                    defaultVisible: true,
                    defaultSurface: "editor",
                    sqlPane: { showTables: true, showErd: true },
                },
            } as any,
            spec: {
                authoringFormatVersion: "2.0",
                subjectSlug: "sql",
                courseSlug: "multi-table-sql",
                catalogSlug: "sql",
                profileId: "sql",
                title: "Multi-Table SQL",
                sourceLocale: "en",
                targetLocales: [],
                tools: { sqlPane: { showChen: false } },
                modules: [
                    {
                        moduleNumber: 0,
                        moduleSlug: "module-0",
                        title: "Joins",
                        tools: { sqlPane: { defaultTab: "erd" } },
                        sections: [
                            {
                                sectionSlug: "relationships",
                                title: "Relationships",
                                tools: { defaultSurface: "results" },
                                topics: [
                                    {
                                        topicId: "keys",
                                        title: "Keys",
                                        tools: { sqlPane: { defaultTab: "tables" } },
                                        lessonTools: {
                                            sketch1: { sqlPane: { defaultTab: "erd" } },
                                        },
                                        exerciseTools: {
                                            "try-keys": { defaultSurface: "editor" },
                                        },
                                    },
                                ],
                            },
                        ],
                    },
                ],
            } as any,
        });

        expect(plan.tools).toMatchObject({
            defaultVisible: true,
            defaultSurface: "editor",
            sqlPane: { showTables: true, showErd: true, showChen: false },
        });
        expect(plan.modules[0]?.tools).toEqual({
            sqlPane: { defaultTab: "erd" },
        });
        expect(plan.modules[0]?.sections[0]?.tools).toEqual({
            defaultSurface: "results",
        });
        expect(plan.modules[0]?.sections[0]?.topics[0]).toMatchObject({
            tools: { sqlPane: { defaultTab: "tables" } },
            lessonTools: { sketch1: { sqlPane: { defaultTab: "erd" } } },
            exerciseTools: { "try-keys": { defaultSurface: "editor" } },
        });
    });

});
