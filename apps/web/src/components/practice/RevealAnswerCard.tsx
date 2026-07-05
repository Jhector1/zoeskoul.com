"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Exercise } from "@/lib/practice/types";
import type { QItem } from "./practiceType";
import type { FSNode, NodeId, WorkspaceStateV2 } from "@/components/ide/types";

import MathMarkdown from "@/components/markdown/MathMarkdown";
import MatrixInputPanel from "./MatrixInputPanel";
import { defaultMainFile } from "@/components/ide/languageDefaults";
import { scrollIntoViewSmart } from "@/lib/ui/flowScroll";
import { useTaggedT } from "@/i18n/tagged";
import { resolveDeepTagged } from "@/i18n/resolveDeepTagged";
import { useOptionalReviewTools } from "@/components/review/module/context/ReviewToolsContext";

async function copyToClipboard(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        try {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.left = "-9999px";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            return true;
        } catch {
            return false;
        }
    }
}

function matrixToText(values: number[][]) {
    return values.map((r) => r.join(" ")).join("\n");
}

type NormalizedSolutionFile = {
    path: string;
    content: string;
    entry?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableSolutionNodeId(kind: "file" | "folder", path: string): NodeId {
    const safe = String(path || "root")
        .replace(/\\/g, "/")
        .replace(/[^a-zA-Z0-9._/-]+/g, "-")
        .replace(/^\/+/, "")
        .replace(/\/+$/g, "")
        .replace(/\//g, "__");

    return `${kind}:${safe || "root"}`;
}

export function normalizeSolutionPath(input: unknown, fallback: string): string {
    const raw = typeof input === "string" && input.trim() ? input : fallback;
    const parts = raw
        .replace(/\\/g, "/")
        .replace(/^\/+/, "")
        .split("/")
        .map((part) => part.trim())
        .filter((part) => part && part !== "." && part !== "..");

    return parts.join("/") || fallback;
}

export function normalizeSolutionFiles(args: {
    raw: unknown;
    language: string;
    entryFile: string;
    solutionCode: string;
}): NormalizedSolutionFile[] {
    const normalizedLanguage = String(args.language || "python") as any;
    const fallbackEntry = normalizeSolutionPath(
        args.entryFile,
        defaultMainFile(normalizedLanguage),
    );
    const filesByPath = new Map<string, NormalizedSolutionFile>();

    const pushFile = (pathInput: unknown, value: unknown, entry = false) => {
        const path = normalizeSolutionPath(pathInput, fallbackEntry);
        const content =
            typeof value === "string"
                ? value
                : isRecord(value) && typeof value.content === "string"
                    ? value.content
                    : isRecord(value) && typeof value.source === "string"
                        ? value.source
                        : isRecord(value) && typeof value.code === "string"
                            ? value.code
                            : isRecord(value) && typeof value.text === "string"
                                ? value.text
                                : "";

        const existing = filesByPath.get(path);
        filesByPath.set(path, {
            path,
            content,
            entry: existing?.entry || entry || undefined,
        });
    };

    if (Array.isArray(args.raw)) {
        for (const item of args.raw) {
            if (typeof item === "string") {
                pushFile(item, "");
                continue;
            }

            if (!isRecord(item)) continue;

            pushFile(
                item.path ?? item.filePath ?? item.filename ?? item.name,
                item,
                item.entry === true || item.isEntry === true || item.main === true,
            );
        }
    } else if (isRecord(args.raw)) {
        for (const [path, value] of Object.entries(args.raw)) {
            pushFile(path, value);
        }
    }

    return Array.from(filesByPath.values());
}

function workspacePathForNode(nodes: FSNode[], nodeId: NodeId): string {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return "";

    const names: string[] = [node.name];
    let parentId = node.parentId ?? null;

    while (parentId) {
        const parent = nodes.find((candidate) => candidate.id === parentId);
        if (!parent) break;
        names.unshift(parent.name);
        parentId = parent.parentId ?? null;
    }

    return names.join("/");
}

export function getWorkspaceEntryCode(
    workspace: WorkspaceStateV2 | null | undefined,
): string {
    if (!workspace?.nodes?.length || !workspace.entryFileId) return "";

    const entryNode = workspace.nodes.find(
        (node) => node.kind === "file" && node.id === workspace.entryFileId,
    );

    return entryNode?.kind === "file" ? entryNode.content ?? "" : "";
}

function getWorkspaceFilePaths(
    workspace: WorkspaceStateV2 | null | undefined,
): string[] {
    if (!workspace?.nodes?.length) return [];

    return workspace.nodes
        .filter((node) => node.kind === "file")
        .map((node) => workspacePathForNode(workspace.nodes, node.id))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
}

function getWorkspaceFileEntries(
    workspace: WorkspaceStateV2 | null | undefined,
): Array<{ path: string; content: string }> {
    if (!workspace?.nodes?.length) return [];

    return workspace.nodes
        .filter((node): node is Extract<FSNode, { kind: "file" }> => node.kind === "file")
        .map((node) => ({
            path: workspacePathForNode(workspace.nodes, node.id),
            content: node.content ?? "",
        }))
        .filter((entry) => Boolean(entry.path))
        .sort((a, b) => a.path.localeCompare(b.path));
}

function formatWorkspaceFilesForCopy(
    workspace: WorkspaceStateV2 | null | undefined,
): string {
    const entries = getWorkspaceFileEntries(workspace);
    if (entries.length <= 1) return entries[0]?.content ?? "";

    return entries
        .map((entry) => `# ${entry.path}\n${entry.content}`.trimEnd())
        .join("\n\n");
}

function firstPresentValue(...values: unknown[]) {
    for (const value of values) {
        if (value !== undefined && value !== null) return value;
    }
    return undefined;
}


export function buildSolutionWorkspace(args: {
    language: string;
    solutionCode: string;
    stdin: string;
    solutionFiles: unknown;
    entryFile?: string;
}): WorkspaceStateV2 | null {
    const language = String(args.language || "python") as any;
    const defaultEntryFile = defaultMainFile(language);
    const requestedEntryFile = normalizeSolutionPath(
        args.entryFile,
        defaultEntryFile,
    );
    const normalizedFiles = normalizeSolutionFiles({
        raw: args.solutionFiles,
        language,
        entryFile: requestedEntryFile,
        solutionCode: args.solutionCode,
    });

    const explicitEntryPath = normalizedFiles.find((file) => file.entry)?.path ?? null;
    const pythonMainPath = normalizeSolutionPath("main.py", requestedEntryFile);
    const defaultEntryPath = normalizeSolutionPath(defaultEntryFile, requestedEntryFile);

    let entryPath =
        explicitEntryPath ??
        requestedEntryFile ??
        (language === "python" ? pythonMainPath : defaultEntryPath);

    if (!normalizedFiles.some((file) => file.path === entryPath)) {
        if (
            language === "python" &&
            normalizedFiles.some((file) => file.path === pythonMainPath)
        ) {
            entryPath = pythonMainPath;
        } else if (normalizedFiles.some((file) => file.path === defaultEntryPath)) {
            entryPath = defaultEntryPath;
        } else if (args.solutionCode.trim()) {
            normalizedFiles.push({
                path: entryPath,
                content: args.solutionCode,
                entry: true,
            });
        } else if (normalizedFiles[0]) {
            entryPath = normalizedFiles[0].path;
        } else {
            return null;
        }
    }

    const files = normalizedFiles.map((file) =>
        file.path === entryPath
            ? {
                ...file,
                // Prefer the explicit multi-file solution content. Only fall back to
                // solutionCode when the entry file was not included or has no content.
                content: file.content || args.solutionCode,
                entry: true,
            }
            : file,
    );

    if (!files.length) return null;

    const now = 0;
    const nodes: FSNode[] = [];
    const expanded = new Set<NodeId>();
    const folderByPath = new Map<string, NodeId>();
    const fileByPath = new Map<string, NodeId>();

    const ensureFolder = (parts: string[]) => {
        let parentId: NodeId | null = null;
        let currentPath = "";

        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            const existing = folderByPath.get(currentPath);

            if (existing) {
                parentId = existing;
                continue;
            }

            const id = stableSolutionNodeId("folder", currentPath);
            nodes.push({
                id,
                kind: "folder",
                name: part,
                parentId,
                createdAt: now,
                updatedAt: now,
            });
            folderByPath.set(currentPath, id);
            expanded.add(id);
            parentId = id;
        }

        return parentId;
    };

    for (const file of files) {
        const parts = file.path.split("/").filter(Boolean);
        const name = parts.pop() || defaultEntryFile;
        const parentId = ensureFolder(parts);
        const id = stableSolutionNodeId("file", file.path);

        nodes.push({
            id,
            kind: "file",
            name,
            parentId,
            content: file.content,
            createdAt: now,
            updatedAt: now,
        });
        fileByPath.set(file.path, id);
    }

    const entryFileId = fileByPath.get(entryPath) ?? fileByPath.get(files[0]?.path ?? "") ?? "";
    if (!entryFileId) return null;

    return {
        version: 2,
        language,
        nodes,
        openTabs: [entryFileId],
        activeFileId: entryFileId,
        entryFileId,
        stdin: args.stdin,
        expanded: Array.from(expanded),
        leftPct: 26,
    };
}



type RevealFillPatch = Partial<QItem> & Record<string, unknown>;

export function buildRevealFillPatches(args: {
    fillPatch: RevealFillPatch;
    isCodeInput: boolean;
}) {
    const itemPatch: RevealFillPatch = {
        ...args.fillPatch,
        ...(args.isCodeInput ? { codeTouched: true } : {}),
        // Fill answer is a study action after reveal. Keep the question
        // finalized so grading/XP cannot reopen and navigation stays enabled.
        submitted: true,
        revealed: true,
        feedbackDismissed: false,
        dismissFeedbackOnEdit: false,
        updateOrigin: "user",
    };

    const toolsPatch: RevealFillPatch = args.isCodeInput
        ? {
            ...itemPatch,
            userEdited: true,
            preferSnapshot: true,
            workspaceOrigin: "user",
        }
        : itemPatch;

    return {
        itemPatch,
        toolsPatch,
    };
}

export function applyRevealFillAnswer(args: {
    fillPatch: RevealFillPatch;
    isCodeInput: boolean;
    codeInputId?: string;
    updateCurrent: (patch: Partial<QItem>) => void;
    patchCodeInput?: (id: string, patch: any) => void;
}) {
    const { itemPatch, toolsPatch } = buildRevealFillPatches({
        fillPatch: args.fillPatch,
        isCodeInput: args.isCodeInput,
    });

    args.updateCurrent(itemPatch as Partial<QItem>);

    if (args.isCodeInput && args.codeInputId) {
        args.patchCodeInput?.(args.codeInputId, toolsPatch);
    }

    return {
        itemPatch,
        toolsPatch,
    };
}







function matrixToGridStrings(values: number[][]) {
    return values.map((row) => row.map((v) => String(v)));
}

type RevealModel = {
    title: string;
    copyText: string;
    fillPatch: RevealFillPatch | null;
    node: React.ReactNode;
};

const REVEAL_PANEL = "ui-surface-muted p-3";
const REVEAL_CHIP =
    "ui-pill-neutral max-w-full min-w-0 h-auto items-start px-2 py-1 text-left leading-relaxed whitespace-normal break-words [overflow-wrap:anywhere]";
const REVEAL_PRE =
    "mt-1 overflow-x-auto rounded-md border p-3 font-mono text-xs leading-relaxed ui-border ui-bg-surface ui-text";
const REVEAL_SMALL_LABEL = "ui-meta-strong";

export default function RevealAnswerCard({
                                             exercise,
                                             current,
                                             reveal,
                                             title = "Revealed answer",
                                             updateCurrent,
                                             autoScroll = true,
                                             codeInputId,
                                         }: {
    exercise: Exercise | null;
    current: QItem;
    reveal: any;
    title?: string;
    updateCurrent: (patch: Partial<QItem>) => void;
    autoScroll?: boolean;
    codeInputId?: string;
}) {
    const [copied, setCopied] = useState(false);
    const [filled, setFilled] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const tools = useOptionalReviewTools();

    const { raw } = useTaggedT();
    const resolveTaggedValue = useCallback(
        (key: string) => raw(key, `@:${key}`) as string,
        [raw],
    );
    const exT: Exercise | null = useMemo(() => {
        if (!exercise) return null;
        return resolveDeepTagged(exercise, resolveTaggedValue) as Exercise;
    }, [exercise, resolveTaggedValue]);

    const revealT: any | null = useMemo(() => {
        if (!reveal || typeof reveal !== "object") return reveal ?? null;
        return resolveDeepTagged(reveal, resolveTaggedValue) as any;
    }, [reveal, resolveTaggedValue]);

    const model: RevealModel | null = useMemo(() => {
        if (!revealT || typeof revealT !== "object") return null;

        const kind = String(revealT.kind ?? exT?.kind ?? exercise?.kind);

        if (kind === "numeric") {
            const v = revealT.value;
            const copyText = v == null ? "" : String(v);
            return {
                title: "Answer",
                copyText,
                fillPatch: copyText ? ({ num: copyText } as Partial<QItem>) : null,
                node: (
                    <div className={REVEAL_PANEL}>
                        <MathMarkdown
                            content={`$$${copyText || "\\text{(empty)}"}$$`}
                            className="max-w-none [&_.katex]:text-[rgb(var(--ui-text)/0.96)]"
                        />
                    </div>
                ),
            };
        }

        if (kind === "code_input") {
            const lang = String(
                revealT.codeLang ??
                    revealT.language ??
                    revealT.lang ??
                    current.codeLang ??
                    "python",
            );
            const code = String(
                revealT.solutionCode ?? revealT.code ?? revealT.source ?? "",
            );
            const stdin = String(revealT.codeStdin ?? revealT.stdin ?? "");
            const explicitWorkspace =
                revealT.workspace && typeof revealT.workspace === "object"
                    ? revealT.workspace
                    : revealT.solutionWorkspace && typeof revealT.solutionWorkspace === "object"
                        ? revealT.solutionWorkspace
                        : revealT.codeWorkspace && typeof revealT.codeWorkspace === "object"
                            ? revealT.codeWorkspace
                            : revealT.ideWorkspace && typeof revealT.ideWorkspace === "object"
                            ? revealT.ideWorkspace
                            : null;
            const revealWorkspace = isRecord(revealT.workspace) ? revealT.workspace : null;
            const exWorkspace = isRecord((exT as any)?.workspace) ? (exT as any).workspace : null;
            const revealRecipe = isRecord(revealT.recipe) ? revealT.recipe : null;
            const exRecipe = isRecord((exT as any)?.recipe) ? (exT as any).recipe : null;
            const solutionFiles = firstPresentValue(
                revealT.solutionFiles,
                revealRecipe?.solutionFiles,
                revealWorkspace?.solutionFiles,
                (exT as any)?.solutionFiles,
                exRecipe?.solutionFiles,
                exWorkspace?.solutionFiles,
            );
            const entryFile =
                typeof revealWorkspace?.entryFilePath === "string"
                    ? revealWorkspace.entryFilePath
                    : typeof revealWorkspace?.entryFile === "string"
                        ? revealWorkspace.entryFile
                        : typeof exWorkspace?.entryFilePath === "string"
                            ? exWorkspace.entryFilePath
                            : typeof exWorkspace?.entryFile === "string"
                                ? exWorkspace.entryFile
                                : undefined;
            const workspace =
                explicitWorkspace ??
                buildSolutionWorkspace({
                    language: lang,
                    solutionCode: code,
                    stdin,
                    solutionFiles,
                    entryFile,
                });
            const workspaceFiles = getWorkspaceFilePaths(workspace);
            const workspaceFileEntries = getWorkspaceFileEntries(workspace);
            const entryCode = getWorkspaceEntryCode(workspace) || code;
            const copyText =
                workspaceFileEntries.length > 1
                    ? formatWorkspaceFilesForCopy(workspace)
                    : entryCode;
            const entryPath =
                workspace && workspace.entryFileId
                    ? workspacePathForNode(workspace.nodes, workspace.entryFileId)
                    : entryFile ?? defaultMainFile(lang as any);

            return {
                title: `Solution code (${lang})`,
                copyText,
                fillPatch: entryCode || workspace
                    ? ({
                        // Keep code/source as the entry file for legacy single-file state,
                        // but pass the full workspace so Fill answer updates every file.
                        code: entryCode,
                        source: entryCode,
                        codeLang: lang,
                        language: lang,
                        lang,
                        codeStdin: stdin,
                        stdin,
                        ...(workspace
                            ? {
                                workspace,
                                codeWorkspace: workspace,
                                ideWorkspace: workspace,
                            }
                            : {}),
                    } as Partial<QItem>)
                    : null,
                node: (
                    <div className="ui-surface-muted overflow-hidden @container">
                        <div className="flex flex-col gap-1.5 border-b px-3 py-2 ui-border ui-bg-surface-soft @md:flex-row @md:items-center @md:justify-between">
                            <div className="ui-meta-strong">{lang.toUpperCase()}</div>
                            <div className="min-w-0 ui-meta [overflow-wrap:anywhere]">
                                Copy it into the editor, run it, then check your answer.
                            </div>
                        </div>

                        {workspaceFiles.length > 1 ? (
                            <div className="border-b px-3 py-2 ui-border">
                                <div className={REVEAL_SMALL_LABEL}>Files included</div>
                                <div className="mt-2 flex flex-col gap-1 font-mono text-xs ui-text">
                                    {workspaceFiles.map((path) => (
                                        <span key={path}>{path}</span>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {workspaceFileEntries.length > 1 ? (
                            <div className="divide-y ui-border">
                                {workspaceFileEntries.map((file) => (
                                    <div key={file.path}>
                                        <div className="border-b px-3 py-2 font-mono text-xs font-semibold ui-border ui-bg-surface-soft ui-text">
                                            {file.path}
                                        </div>
                                        <pre className="p-3 overflow-x-auto font-mono text-xs leading-relaxed ui-text">
                                            <code>{file.content?.trim() ? file.content : "# (empty file)"}</code>
                                        </pre>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <pre className="p-3 overflow-x-auto font-mono text-xs leading-relaxed ui-text">
                                <code>{entryCode?.trim() ? entryCode : "// (no solutionCode provided)"}</code>
                            </pre>
                        )}

                        {workspaceFiles.length > 1 ? (
                            <div className="border-t px-3 py-2 ui-border">
                                <div className={REVEAL_SMALL_LABEL}>Entry file</div>
                                <div className="mt-1 font-mono text-xs ui-text">{entryPath}</div>
                            </div>
                        ) : null}

                        {stdin ? (
                            <div className="border-t px-3 py-2 ui-border">
                                <div className={REVEAL_SMALL_LABEL}>stdin</div>
                                <pre className={REVEAL_PRE}>
                                    <code>{stdin}</code>
                                </pre>
                            </div>
                        ) : null}
                    </div>
                ),
            };
        }

        if (kind === "matrix_input") {
            const values = Array.isArray(revealT.values) ? (revealT.values as number[][]) : [];
            const rows = values.length;
            const cols = values[0]?.length ?? 0;

            const copyText = rows && cols ? matrixToText(values) : "";
            return {
                title: "Matrix answer",
                copyText,
                fillPatch:
                    rows && cols
                        ? ({
                            matRows: rows,
                            matCols: cols,
                            mat: matrixToGridStrings(values),
                        } as Partial<QItem>)
                        : null,
                node: (
                    <div className={REVEAL_PANEL}>
                        <MatrixInputPanel
                            labelLatex={(revealT.labelLatex as string) ?? String.raw`\mathbf{A}=`}
                            rows={rows}
                            cols={cols}
                            allowResize={false}
                            value={matrixToGridStrings(values)}
                            readOnly={true}
                            requiredRows={rows}
                            requiredCols={cols}
                            onShapeChange={() => {}}
                            onChange={() => {}}
                        />
                    </div>
                ),
            };
        }

        if (kind === "voice_input") {
            const transcript =
                String(revealT.preferred ?? revealT.transcript ?? "").trim() ||
                String((Array.isArray(revealT.answers) ? revealT.answers[0] : "") ?? "").trim();

            const answers = Array.isArray(revealT.answers) ? revealT.answers.map(String) : [];
            const copyText = transcript;

            return {
                title: "Correct transcript",
                copyText,
                fillPatch: transcript ? ({ voiceTranscript: transcript } as Partial<QItem>) : null,
                node: (
                    <div className={REVEAL_PANEL}>
                        <div className={REVEAL_SMALL_LABEL}>Transcript</div>
                        <div className="mt-1 ui-title-sm">{transcript || "—"}</div>

                        {answers.length ? (
                            <>
                                <div className="mt-3 ui-meta">Also accepted</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {answers.map((a: string) => (
                                        <span key={a} className={REVEAL_CHIP}>
                                            {a}
                                        </span>
                                    ))}
                                </div>
                            </>
                        ) : null}
                    </div>
                ),
            };
        }

        if (kind === "drag_reorder") {
            const order = Array.isArray(revealT.order) ? revealT.order.map(String) : [];
            const tokens = Array.isArray((exT as any)?.tokens) ? (exT as any).tokens : [];
            const byId = new Map(tokens.map((t: any) => [String(t.id), String(t.text ?? t.label ?? t.id)]));

            const copyText = order
                .map((raw: any) => {
                    const sid = String(raw);
                    return byId.get(sid) ?? sid;
                })
                .join(" ");

            return {
                title: "Correct order",
                copyText,
                fillPatch: order.length ? ({ reorder: order, reorderIds: order } as Partial<QItem>) : null,
                node: (
                    <div className={REVEAL_PANEL}>
                        <div className={REVEAL_SMALL_LABEL}>Correct order</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {order.length ? (
                                order.map((raw: any) => {
                                    const sid = String(raw);
                                    const label = String(byId.get(sid) ?? sid);
                                    return (
                                        <span key={sid} className={REVEAL_CHIP}>
                                            {label}
                                        </span>
                                    );
                                })
                            ) : (
                                <span className="ui-meta">—</span>
                            )}
                        </div>
                    </div>
                ),
            };
        }

        if (
            kind === "text_input" ||
            kind === "listen_build" ||
            kind === "word_bank_arrange" ||
            kind === "fill_blank_choice"
        ) {
            const answers = Array.isArray(revealT.answers) ? revealT.answers.map(String) : [];
            const preferred = String(revealT.preferred ?? revealT.value ?? (answers[0] ?? "")).trim();
            const copyText = preferred || (answers[0] ?? "");

            return {
                title:
                    kind === "fill_blank_choice"
                        ? "Correct choice"
                        : kind === "listen_build"
                            ? "Correct sentence"
                            : kind === "word_bank_arrange"
                                ? "Correct sentence"
                                : "Accepted answers",
                copyText,
                fillPatch: copyText ? ({ text: copyText, single: copyText } as Partial<QItem>) : null,
                node: (
                    <div className={`${REVEAL_PANEL} min-w-0`}>
                        <div className={REVEAL_SMALL_LABEL}>
                            {kind === "text_input" ? "Accepted" : "Answer"}
                        </div>

                        <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                            {answers.length ? (
                                answers.map((a: string) => (
                                    <span key={a} className={REVEAL_CHIP}>
                                        {a}
                                    </span>
                                ))
                            ) : copyText ? (
                                <span className={REVEAL_CHIP}>{copyText}</span>
                            ) : (
                                <span className="ui-meta">—</span>
                            )}
                        </div>
                    </div>
                ),
            };
        }

        if (kind === "single_choice") {
            const optionId = String(revealT.optionId ?? "");
            const options = (exT as any)?.options ?? [];
            const found = options.find((o: any) => String(o.id) === optionId);
            const label = found?.label ?? found?.text ?? found?.markdown ?? found?.latex ?? optionId;

            return {
                title: "Correct choice",
                copyText: optionId,
                fillPatch: optionId ? ({ single: optionId } as Partial<QItem>) : null,
                node: (
                    <div className={REVEAL_PANEL}>
                        <div className={REVEAL_SMALL_LABEL}>Option</div>
                        <div className="mt-1 text-sm ui-text">
                            <MathMarkdown
                                content={String(label)}
                                className="max-w-none [&_.katex]:text-[rgb(var(--ui-text)/0.96)]"
                            />
                        </div>
                        <div className="mt-2 ui-meta">id: {optionId}</div>
                    </div>
                ),
            };
        }

        if (kind === "multi_choice") {
            const optionIds = Array.isArray(revealT.optionIds) ? revealT.optionIds.map(String) : [];
            const options = (exT as any)?.options ?? [];
            const byId = new Map(options.map((o: any) => [String(o.id), String(o.text ?? o.label ?? o.id)]));

            const copyText = optionIds.join(", ");

            return {
                title: "Correct choices",
                copyText,
                fillPatch: optionIds.length ? ({ multi: optionIds } as Partial<QItem>) : null,
                node: (
                    <div className={`${REVEAL_PANEL} min-w-0`}>
                        <div className={REVEAL_SMALL_LABEL}>Options</div>

                        {optionIds.length ? (
                            <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                                {optionIds.map((id: any) => (
                                    <span key={id} className={REVEAL_CHIP}>
                                        {byId.get(id) ?? id}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <div className="mt-1 ui-meta">—</div>
                        )}
                    </div>
                ),
            };
        }

        if (kind === "vector_drag_target" || kind === "vector_drag_dot") {
            const sol = revealT.solutionA ?? revealT.targetA ?? null;
            const b = revealT.b ?? null;
            const copyText = sol ? JSON.stringify(sol) : "";

            return {
                title: "One valid vector answer",
                copyText,
                fillPatch: sol ? ({ dragA: sol, ...(b ? { dragB: b } : {}) } as Partial<QItem>) : null,
                node: (
                    <div className={REVEAL_PANEL}>
                        <div className={REVEAL_SMALL_LABEL}>a</div>
                        <pre className={REVEAL_PRE}>{JSON.stringify(sol, null, 2)}</pre>
                        {b ? (
                            <>
                                <div className="mt-3 ui-meta-strong">b</div>
                                <pre className={REVEAL_PRE}>{JSON.stringify(b, null, 2)}</pre>
                            </>
                        ) : null}
                    </div>
                ),
            };
        }

        return null;
    }, [revealT, exT, exercise, current.codeLang]);

    useEffect(() => {
        if (!autoScroll) return;
        if (!model) return;

        const el = rootRef.current;
        if (!el) return;

        requestAnimationFrame(() => {
            scrollIntoViewSmart(el, {
                block: "end",
                force: true,
                offsetPx: 12,
            });
        });
    }, [autoScroll, model]);

    if (!model) return null;
    const m = model;

    async function onCopy() {
        if (!m.copyText) return;
        const ok = await copyToClipboard(m.copyText);
        if (!ok) return;
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
    }

    function onFill() {
        if (!m.fillPatch) return;

        const fillPatchAny = m.fillPatch as Record<string, unknown>;
        const hasCodeWorkspace =
            Boolean(fillPatchAny.workspace) ||
            Boolean(fillPatchAny.codeWorkspace) ||
            Boolean(fillPatchAny.ideWorkspace);
        const hasCodeValue =
            typeof fillPatchAny.code === "string" || typeof fillPatchAny.source === "string";
        const isCodeInput =
            String(revealT?.kind ?? reveal?.kind ?? exT?.kind ?? exercise?.kind ?? "") ===
                "code_input" ||
            hasCodeWorkspace ||
            hasCodeValue;
        const fillCodeInputId = codeInputId ?? tools?.boundId ?? undefined;

        applyRevealFillAnswer({
            fillPatch: m.fillPatch,
            isCodeInput,
            codeInputId: fillCodeInputId,
            updateCurrent,
            patchCodeInput: tools?.patchCodeInput,
        });

        setFilled(true);
        window.setTimeout(() => setFilled(false), 1200);
    }
    return (
        <div ref={rootRef} className="mt-3 min-w-0 @container">
            <div className="flex flex-col gap-2 @md:flex-row @md:flex-wrap @md:items-center @md:justify-between">
                <div className="min-w-0 ui-meta-strong">{title}</div>

                <div className="flex w-full flex-wrap gap-2 @md:w-auto @md:justify-end">
                    <button
                        onClick={onCopy}
                        disabled={!m.copyText}
                        className="ui-btn-secondary min-w-[8.5rem] flex-1 justify-center whitespace-normal px-3 text-center @sm:flex-none"
                    >
                        {copied ? "Copied ✓" : "Copy"}
                    </button>

                    <button
                        onClick={onFill}
                        disabled={!m.fillPatch}
                        className="ui-btn-secondary min-w-[8.5rem] flex-1 justify-center whitespace-normal px-3 text-center @sm:flex-none"
                        title="Fill the input with the revealed answer"
                    >
                        {filled ? "Filled ✓" : "Fill answer"}
                    </button>
                </div>
            </div>

            <div className="mt-2 min-w-0">{m.node}</div>
        </div>
    );
}
