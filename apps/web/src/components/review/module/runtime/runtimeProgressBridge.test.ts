import { describe, expect, it } from "vitest";
import { mergeRuntimeIntoProgress } from "@zoeskoul/learning-runtime/review/module/runtime/runtimeProgressBridge";
import type { WorkspaceStateV2 } from "@/components/ide/types";
import type { ReviewRuntimeStore } from "@/components/review/module/runtime/reviewRuntimeTypes";

type RuntimeLike = Pick<ReviewRuntimeStore, "exercises" | "cards">;

function buildWorkspace(language: WorkspaceStateV2["language"] = "python"): WorkspaceStateV2 {
    return {
        version: 2,
        language,
        nodes: [
            {
                id: "src",
                kind: "folder",
                name: "src",
                parentId: null,
                createdAt: 1,
                updatedAt: 1,
            },
            {
                id: "src/main.py",
                kind: "file",
                name: language === "sql" ? "query.sql" : "main.py",
                parentId: "src",
                content:
                    language === "sql"
                        ? "select * from inventory_items;"
                        : "print('persist me')\n",
                createdAt: 1,
                updatedAt: 1,
            },
            {
                id: "src/helper.py",
                kind: "file",
                name: language === "sql" ? "notes.sql" : "helper.py",
                parentId: "src",
                content:
                    language === "sql"
                        ? "-- keep this file"
                        : "def helper():\n    return 42\n",
                createdAt: 1,
                updatedAt: 1,
            },
        ],
        openTabs: ["src/main.py", "src/helper.py"],
        activeFileId: "src/helper.py",
        entryFileId: "src/main.py",
        stdin: language === "sql" ? "" : "9\n",
        expanded: ["src"],
        leftPct: 40,
    };
}

describe("mergeRuntimeIntoProgress", () => {
    it("persists multi-file exercise workspaces into runtimeStateV2 and quiz compatibility patches", () => {
        const workspace = buildWorkspace("python");
        const exerciseKey = "python:python-1:section-a:topic-a:q1:q1";

        const next = mergeRuntimeIntoProgress(
            { topics: {} },
            {
                exercises: {
                    [exerciseKey]: {
                        exerciseKey,
                        topicId: "topic-a",
                        cardId: "q1",
                        exerciseId: "q1",
                        language: "python",
                        lang: "python",
                        workspace,
                        codeWorkspace: workspace,
                        ideWorkspace: workspace,
                        stdin: workspace.stdin,
                        codeStdin: workspace.stdin,
                        code: "print('persist me')",
                        source: "print('persist me')",
                        userEdited: true,
                        workspaceOrigin: "user",
                        updatedAt: 123,
                    },
                },
                cards: {},
            } as unknown as RuntimeLike,
        );

        const topic = next.topics?.["topic-a"];
        expect(topic).toBeDefined();
        if (!topic) {
            throw new Error("Expected topic-a progress to be persisted.");
        }

        expect(topic.runtimeStateV2!.exercises![exerciseKey].workspace).toEqual(workspace);
        expect(topic.runtimeStateV2!.exercises![exerciseKey]).not.toHaveProperty("codeWorkspace");
        expect(topic.runtimeStateV2!.exercises![exerciseKey]).not.toHaveProperty("ideWorkspace");

        const practicePatch = topic.quizState!.q1.practiceItemPatch![exerciseKey];
        expect(practicePatch.workspace).toEqual(workspace);
        expect(practicePatch).not.toHaveProperty("codeWorkspace");
        expect(practicePatch).not.toHaveProperty("ideWorkspace");
        expect(practicePatch.exerciseKey).toBe(exerciseKey);
        expect(practicePatch.topicId).toBe("topic-a");
        expect(practicePatch.cardId).toBe("q1");
        expect(practicePatch.stdin).toBe("9\n");
        expect(practicePatch.codeStdin).toBe("9\n");
        expect(practicePatch.language).toBe("python");
        expect(practicePatch.lang).toBe("python");
        expect(practicePatch.code).toBe("print('persist me')\n");
        expect(practicePatch.source).toBe("print('persist me')\n");
        expect(topic.quizState!.q1.practiceItemPatch).not.toHaveProperty("q1");
        expect(Object.keys(topic.quizState!.q1.practiceItemPatch!)).toEqual([
            exerciseKey,
        ]);
    });

    it("persists sketch/card tool workspaces for refresh and navigation restore", () => {
        const workspace = buildWorkspace("sql");

        const legacyToolKey =
            "sql:sql_module_12:section_12_1:what-update-does:sk1:general";

        const next = mergeRuntimeIntoProgress(
            {
                topics: {
                    "what-update-does": {
                        toolState: {
                            [legacyToolKey]: { workspace },
                            "card:sk1": { workspace },
                        },
                    },
                },
            },
            {
                exercises: {},
                cards: {
                    "sql:sql_module_12:section_12_1:what-update-does:sk1": {
                        cardKey: "sql:sql_module_12:section_12_1:what-update-does:sk1",
                        topicId: "what-update-does",
                        cardId: "sk1",
                        toolKey: legacyToolKey,
                        toolLang: "sql",
                        toolWorkspace: workspace,
                        toolCode: "select * from inventory_items;",
                        toolStdin: "",
                        workspaceOrigin: "user",
                        userEdited: true,
                        updatedAt: 456,
                        sketch: { kind: "sql-sketch" },
                    },
                },
            } as unknown as RuntimeLike,
        );

        const topic = next.topics?.["what-update-does"];
        expect(topic).toBeDefined();
        if (!topic) {
            throw new Error("Expected what-update-does progress to be persisted.");
        }

        expect(topic.runtimeStateV2!.cards!["sql:sql_module_12:section_12_1:what-update-does:sk1"].toolWorkspace).toEqual(workspace);
        expect(topic.toolState!["card:sql:sql_module_12:section_12_1:what-update-does:sk1"].workspace).toEqual(workspace);
        expect(topic.toolState!["card:sk1"]).toBeUndefined();
        expect(topic.toolState![legacyToolKey]).toBeUndefined();
        expect(topic.sketchState!.sk1).toEqual({ kind: "sql-sketch" });
    });
});
