import { describe, expect, it, vi } from "vitest";

import type { WorkspaceStateV2 } from "@/components/ide/types";
import {
    buildWorkspaceModelReplacements,
    replaceMountedWorkspaceModels,
} from "./EditorPane";

const workspace: WorkspaceStateV2 = {
    version: 2,
    language: "python",
    nodes: [
        {
            id: "main",
            kind: "file",
            name: "main.py",
            parentId: null,
            content: "print('solution')\n",
            createdAt: 0,
            updatedAt: 0,
        },
        {
            id: "helper",
            kind: "file",
            name: "helper.py",
            parentId: null,
            content: "ANSWER = 42\n",
            createdAt: 0,
            updatedAt: 0,
        },
    ],
    openTabs: ["main", "helper"],
    activeFileId: "main",
    entryFileId: "main",
    stdin: "",
    expanded: [],
    leftPct: 26,
};

describe("mounted Monaco workspace replacement", () => {
    it("builds deterministic replacements for every text file", () => {
        const replacements = buildWorkspaceModelReplacements({
            workspace,
            exerciseStateKey: "review:exercise-1",
        });

        expect(replacements).toHaveLength(2);
        expect(replacements.map((entry) => entry.content)).toEqual([
            "print('solution')\n",
            "ANSWER = 42\n",
        ]);
        expect(replacements.every((entry) =>
            entry.path.startsWith(
                "inmemory://zoeskoul-runner/review-exercise-1/",
            ),
        )).toBe(true);
    });

    it("updates all mounted models once and leaves unrelated models alone", () => {
        const replacements = buildWorkspaceModelReplacements({
            workspace,
            exerciseStateKey: "review:exercise-1",
        });
        const models = new Map(
            replacements.map((replacement) => {
                let value = "learner content\n";
                return [
                    replacement.path,
                    {
                        isDisposed: () => false,
                        getValue: () => value,
                        setValue: vi.fn((next: string) => {
                            value = next;
                        }),
                    },
                ] as const;
            }),
        );
        const unrelatedSetValue = vi.fn();
        models.set("inmemory://zoeskoul-runner/unrelated.py", {
            isDisposed: () => false,
            getValue: () => "keep me",
            setValue: unrelatedSetValue,
        });
        const monaco = {
            Uri: { parse: (path: string) => path },
            editor: { getModel: (path: string) => models.get(path) ?? null },
        };

        expect(replaceMountedWorkspaceModels({ monaco, replacements })).toBe(2);
        expect(replaceMountedWorkspaceModels({ monaco, replacements })).toBe(0);
        expect(unrelatedSetValue).not.toHaveBeenCalled();
    });
});
