"use client";

import { useCallback, useEffect, useState } from "react";
import CodeRunner from "@/components/code/CodeRunner";
import type { WorkspaceStateV2 } from "@/components/ide/types";

const initialWorkspace: WorkspaceStateV2 = {
    version: 2,
    language: "python",
    nodes: [
        {
            id: "file:main.py",
            kind: "file",
            name: "main.py",
            parentId: null,
            content: "",
            createdAt: 0,
            updatedAt: 0,
        },
    ],
    openTabs: ["file:main.py"],
    activeFileId: "file:main.py",
    entryFileId: "file:main.py",
    stdin: "",
    expanded: [],
    leftPct: 26,
} as WorkspaceStateV2;

function getEntryCode(workspace: WorkspaceStateV2) {
    const entryId = workspace.entryFileId || workspace.activeFileId;

    const entryNode = workspace.nodes.find(
        (node: any) => node.kind === "file" && node.id === entryId,
    ) as any;

    return entryNode?.content ?? "";
}

function getRestoredWorkspace(state: any): WorkspaceStateV2 | null {
    const restoredWorkspace =
        state?.topics?.e2e_topic?.runtimeStateV2?.cards?.e2e_card
            ?.toolWorkspace ??
        state?.topics?.e2e_topic?.toolState?.["e2e_card:general"]?.workspace;

    if (restoredWorkspace?.version === 2 && Array.isArray(restoredWorkspace.nodes)) {
        return restoredWorkspace as WorkspaceStateV2;
    }

    return null;
}

export default function E2ESketchSavePage() {
    const [workspace, setWorkspace] = useState<WorkspaceStateV2>(initialWorkspace);
    const [code, setCode] = useState("");
    const [stdin, setStdin] = useState("");
    const [saveCount, setSaveCount] = useState(0);
    const [restoreStatus, setRestoreStatus] = useState<
        "idle" | "restoring" | "restored" | "empty" | "failed"
    >("idle");

    useEffect(() => {
        let cancelled = false;

        async function restoreProgress() {
            setRestoreStatus("restoring");

            try {
                const res = await fetch(
                    "/api/review/progress?subjectSlug=e2e&moduleSlug=e2e",
                    {
                        method: "GET",
                        headers: {
                            accept: "application/json",
                        },
                    },
                );

                if (!res.ok) {
                    if (!cancelled) setRestoreStatus("failed");
                    return;
                }

                const data = await res.json();
                const restoredWorkspace = getRestoredWorkspace(data?.state);

                if (!restoredWorkspace) {
                    if (!cancelled) setRestoreStatus("empty");
                    return;
                }

                if (!cancelled) {
                    const restoredCode = getEntryCode(restoredWorkspace);
                    const restoredStdin = restoredWorkspace.stdin ?? "";

                    setWorkspace(restoredWorkspace);
                    setCode(restoredCode);
                    setStdin(restoredStdin);
                    setRestoreStatus("restored");
                }
            } catch {
                if (!cancelled) setRestoreStatus("failed");
            }
        }

        void restoreProgress();

        return () => {
            cancelled = true;
        };
    }, []);

    const saveWorkspace = useCallback((nextWorkspace: WorkspaceStateV2) => {
        const nextCode = getEntryCode(nextWorkspace);
        const nextStdin = nextWorkspace.stdin ?? "";

        setWorkspace(nextWorkspace);
        setCode(nextCode);
        setStdin(nextStdin);
        setSaveCount((count) => count + 1);

        void fetch("/api/review/progress", {
            method: "PUT",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                subjectSlug: "e2e",
                moduleSlug: "e2e",
                revision: Date.now(),
                state: {
                    topics: {
                        e2e_topic: {
                            runtimeStateV2: {
                                cards: {
                                    e2e_card: {
                                        cardKey: "e2e_card",
                                        topicId: "e2e_topic",
                                        cardId: "e2e_card",
                                        visited: true,
                                        completed: false,
                                        workspaceStatus: "ready",
                                        workspaceSeedMode: "restored",
                                        workspaceOrigin: "user",
                                        userEdited: true,
                                        toolWorkspace: nextWorkspace,
                                        toolCode: nextCode,
                                        toolStdin: nextStdin,
                                        toolLang: nextWorkspace.language,
                                        updatedAt: Date.now(),
                                        toolKey: "e2e_card:general",
                                    },
                                },
                                exercises: {},
                            },
                            toolState: {
                                "e2e_card:general": {
                                    lang: nextWorkspace.language,
                                    code: nextCode,
                                    stdin: nextStdin,
                                    workspace: nextWorkspace,
                                    userEdited: true,
                                    workspaceOrigin: "user",
                                    updatedAt: Date.now(),
                                },
                            },
                            sketchState: {},
                            cardsDone: {},
                            quizzesDone: {},
                            quizState: {},
                        },
                    },
                    quizVersion: 0,
                    moduleCompleted: false,
                    activeTopicId: "e2e_topic",
                    __saveRevision: Date.now(),
                },
            }),
        });
    }, []);

    return (
        <main className="min-h-screen p-6" data-testid="e2e-sketch-save-page">
            <div className="mx-auto max-w-5xl">
                <h1 className="text-xl font-semibold">E2E Sketch Save Harness</h1>

                <p className="mt-2 text-sm text-neutral-500">
                    This page bypasses auth, curriculum navigation, card-read state, and
                    DB seed. It still uses CodeRunner and the real workspace change path.
                </p>

                <div className="mt-4 flex gap-4 text-sm">
                    <div data-testid="e2e-save-count">Saves: {saveCount}</div>
                    <div data-testid="e2e-restore-status">Restore: {restoreStatus}</div>
                </div>

                <div className="mt-6">
                    <CodeRunner
                        testId="code-runner"
                        editorTestId="code-editor"
                        stdinTestId="code-stdin"
                        outputTestId="code-output"
                        mobileEditorTabTestId="code-mobile-editor-tab"
                        mobileOutputTabTestId="code-mobile-output-tab"
                        title="E2E Sketch Tools"
                        frame="plain"
                        height={420}
                        language="python"
                        fixedLanguage="python"
                        showLanguagePicker={false}
                        code={code}
                        stdin={stdin}
                        workspace={workspace}
                        onChangeCode={setCode}
                        onChangeStdin={setStdin}
                        onChangeLanguage={() => {}}
                        onChangeWorkspace={saveWorkspace}
                        runtime={{ backend: "judge0", terminalView: "plain" }}
                        allowRun={false}
                        showStdinEditor
                    />
                </div>

                {process.env.NODE_ENV !== "production" ? (
                    <pre
                        data-testid="e2e-workspace-debug"
                        className="mt-6 max-h-80 overflow-auto rounded border p-3 text-xs"
                    >
            {JSON.stringify(
                {
                    code,
                    stdin,
                    workspace,
                    saveCount,
                    restoreStatus,
                },
                null,
                2,
            )}
          </pre>
                ) : null}
            </div>
        </main>
    );
}