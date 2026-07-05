import { describe, expect, it } from "vitest";
import {
    resolveExerciseInteractionState,
    resolveExerciseRuntimeDefaultsLayers,
    shouldSkipEmbeddedEnsureExercise,
} from "./ExerciseRenderer";

describe("resolveExerciseRuntimeDefaultsLayers", () => {
    it("falls back to parent module defaults when exercise does not define them", () => {
        const layers = resolveExerciseRuntimeDefaultsLayers({
            exercise: {
                kind: "code_input",
                id: "ex-1",
                topic: "sql.topic",
                difficulty: "easy",
                title: "SQL",
                prompt: "Prompt",
                language: "sql",
            } as any,
            moduleRuntimeDefaults: {
                kind: "sql",
                datasetId: "students_intro",
                showErd: true,
            },
        });

        expect(layers.moduleRuntimeDefaults).toMatchObject({
            datasetId: "students_intro",
            showErd: true,
        });
    });

    it("keeps exercise topic defaults over parent topic defaults", () => {
        const layers = resolveExerciseRuntimeDefaultsLayers({
            exercise: {
                kind: "code_input",
                id: "ex-1",
                topic: "sql.topic",
                difficulty: "easy",
                title: "SQL",
                prompt: "Prompt",
                language: "sql",
                topicRuntimeDefaults: {
                    kind: "sql",
                    datasetId: "products_catalog",
                },
            } as any,
            topicRuntimeDefaults: {
                kind: "sql",
                datasetId: "students_intro",
            },
        });

        expect(layers.topicRuntimeDefaults).toMatchObject({
            datasetId: "products_catalog",
        });
    });
});

describe("shouldSkipEmbeddedEnsureExercise", () => {
    it("does not treat unresolved @: starterCode as real manifest starter content", () => {
        expect(
            shouldSkipEmbeddedEnsureExercise({
                existing: {
                    workspaceOrigin: "starter",
                    userEdited: false,
                    workspace: {
                        version: 2,
                        language: "sql",
                        nodes: [
                            {
                                id: "file:query.sql",
                                kind: "file",
                                name: "query.sql",
                                parentId: null,
                                content: "",
                                createdAt: 0,
                                updatedAt: 0,
                            },
                        ],
                        openTabs: ["file:query.sql"],
                        activeFileId: "file:query.sql",
                        entryFileId: "file:query.sql",
                        expanded: [],
                        stdin: "",
                    },
                    code: "",
                    source: "",
                },
                manifestLanguage: "sql",
                manifestStarterWorkspace: null,
                manifestStarterCode:
                    "@:topics.sql-v2.sql-v2-1.query_one_column.quiz.ci_select_name_from_products.starterCode",
                manifestIdeConfig: null,
            }),
        ).toBe(true);
    });
});


describe("resolveExerciseInteractionState", () => {
    it("keeps revealed exercises interactive while grading stays finalized elsewhere", () => {
        expect(
            resolveExerciseInteractionState({
                readOnly: false,
                busy: false,
                ok: null,
                finalized: true,
                revealed: true,
                attempts: 0,
                maxAttempts: 3,
            }),
        ).toEqual({ outOfAttempts: false, lockInputs: false });
    });

    it("still locks a finalized non-reveal result", () => {
        expect(
            resolveExerciseInteractionState({
                readOnly: false,
                busy: false,
                ok: false,
                finalized: true,
                revealed: false,
                attempts: 3,
                maxAttempts: 3,
            }),
        ).toEqual({ outOfAttempts: true, lockInputs: true });
    });
});
