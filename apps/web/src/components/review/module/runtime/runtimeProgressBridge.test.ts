import { describe, expect, it } from "vitest";
import { mergeRuntimeIntoProgress } from "@/components/review/module/runtime/runtimeProgressBridge";
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
        const exerciseKey = "python:python-1:section-a:topic-a:q1";

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

        const topic = next.topics?.["topic-a"]!;
        expect(topic.runtimeStateV2!.exercises![exerciseKey].workspace).toEqual(workspace);
        expect(topic.runtimeStateV2!.exercises![exerciseKey].codeWorkspace).toEqual(workspace);
        expect(topic.runtimeStateV2!.exercises![exerciseKey].ideWorkspace).toEqual(workspace);

        const practicePatch = topic.quizState!.q1.practiceItemPatch![exerciseKey];
        expect(practicePatch.workspace).toEqual(workspace);
        expect(practicePatch.codeWorkspace).toEqual(workspace);
        expect(practicePatch.ideWorkspace).toEqual(workspace);
        expect(practicePatch.exerciseKey).toBe(exerciseKey);
        expect(practicePatch.topicId).toBe("topic-a");
        expect(practicePatch.cardId).toBe("q1");
        expect(practicePatch.stdin).toBe("9\n");
        expect(practicePatch.codeStdin).toBe("9\n");
        expect(practicePatch.language).toBe("python");
        expect(practicePatch.lang).toBe("python");
        expect(practicePatch.code).toBe("print('persist me')\n");
        expect(practicePatch.source).toBe("print('persist me')\n");
        const legacyPatch = topic.quizState!.q1.practiceItemPatch!["q1"];

        expect(legacyPatch).toMatchObject({
            exerciseKey,
            exerciseId: "q1",
            topicId: "topic-a",
            cardId: "q1",
            code: "print('persist me')\n",
            source: "print('persist me')\n",
            stdin: "9\n",
            codeStdin: "9\n",
            language: "python",
            lang: "python",
            userEdited: true,
            workspaceOrigin: "user",
        });

        expect(legacyPatch.workspace).toEqual(workspace);
        expect(legacyPatch.codeWorkspace).toEqual(workspace);
        expect(legacyPatch.ideWorkspace).toEqual(workspace);
    });

    it("persists sketch/card tool workspaces for refresh and navigation restore", () => {
        const workspace = buildWorkspace("sql");

        const next = mergeRuntimeIntoProgress(
            { topics: {} },
            {
                exercises: {},
                cards: {
                    sk1: {
                        cardKey: "sk1",
                        topicId: "what-update-does",
                        cardId: "sk1",
                        toolKey: "sql:sql_module_12:section_12_1:what-update-does:sk1:general",
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

        const topic = next.topics?.["what-update-does"]!;
        expect(topic.runtimeStateV2!.cards!.sk1.toolWorkspace).toEqual(workspace);
        expect(topic.toolState!["sql:sql_module_12:section_12_1:what-update-does:sk1:general"].workspace).toEqual(workspace);
        expect(topic.toolState!["card:sk1"].workspace).toEqual(workspace);
        expect(topic.sketchState!.sk1).toEqual({ kind: "sql-sketch" });
    });
});
