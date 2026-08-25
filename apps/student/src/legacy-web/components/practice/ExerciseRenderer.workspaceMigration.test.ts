import { describe, expect, it } from "vitest";
import { shouldSkipEmbeddedEnsureExercise } from "./ExerciseRenderer";

function makeWorkspace(args: {
    main: string;
    includeCompanion: boolean;
}) {
    return {
        version: 2 as const,
        language: "python",
        nodes: [
            {
                id: "file:main.py",
                kind: "file" as const,
                name: "main.py",
                parentId: null,
                content: args.main,
                createdAt: 0,
                updatedAt: 0,
            },
            ...(args.includeCompanion
                ? [
                      {
                          id: "folder:models",
                          kind: "folder" as const,
                          name: "models",
                          parentId: null,
                          createdAt: 0,
                          updatedAt: 0,
                      },
                      {
                          id: "file:models-transaction.py",
                          kind: "file" as const,
                          name: "transaction.py",
                          parentId: "folder:models",
                          content: [
                              "class Transaction:",
                              "    def __init__(self, amount):",
                              "        self.amount = amount",
                              "",
                          ].join("\n"),
                          createdAt: 0,
                          updatedAt: 0,
                      },
                  ]
                : []),
        ],
        openTabs: ["file:main.py"],
        activeFileId: "file:main.py",
        entryFileId: "file:main.py",
        expanded: [],
        stdin: "",
    };
}

const manifestWorkspace = makeWorkspace({
    main: [
        "from models.transaction import Transaction",
        'print(Transaction(10).amount)',
        "",
    ].join("\n"),
    includeCompanion: true,
});

describe("legacy saved workspace ensure gate", () => {
    it("does not skip shared ensure when learner-owned saved work is missing an authored companion file", () => {
        const savedMainOnly = makeWorkspace({
            main: [
                "from models.transaction import Transaction",
                'print("learner edit stays")',
                "",
            ].join("\n"),
            includeCompanion: false,
        });

        expect(
            shouldSkipEmbeddedEnsureExercise({
                existing: {
                    language: "python",
                    lang: "python",
                    workspace: savedMainOnly,
                    codeWorkspace: savedMainOnly,
                    ideWorkspace: savedMainOnly,
                    userEdited: true,
                    workspaceOrigin: "saved",
                    code: 'print("learner edit stays")\n',
                    ideConfig: null,
                },
                manifestLanguage: "python",
                manifestStarterWorkspace: manifestWorkspace as any,
                manifestStarterCode:
                    "from models.transaction import Transaction\n",
                manifestIdeConfig: null,
            }),
        ).toBe(false);
    });

    it("still skips redundant ensure when learner-owned saved work already covers every authored file", () => {
        const savedComplete = makeWorkspace({
            main: [
                "from models.transaction import Transaction",
                'print("learner complete workspace")',
                "",
            ].join("\n"),
            includeCompanion: true,
        });

        expect(
            shouldSkipEmbeddedEnsureExercise({
                existing: {
                    language: "python",
                    lang: "python",
                    workspace: savedComplete,
                    codeWorkspace: savedComplete,
                    ideWorkspace: savedComplete,
                    userEdited: true,
                    workspaceOrigin: "saved",
                    code: 'print("learner complete workspace")\n',
                    ideConfig: null,
                },
                manifestLanguage: "python",
                manifestStarterWorkspace: manifestWorkspace as any,
                manifestStarterCode:
                    "from models.transaction import Transaction\n",
                manifestIdeConfig: null,
            }),
        ).toBe(true);
    });
});
