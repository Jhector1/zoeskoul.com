"use client";

import React, { useEffect, useMemo, useRef } from "react";
import ExplorerTree from "../ExplorerTree";
import { SQL_DIALECT_LABEL } from "../../constants";
import type { SqlDialect } from "@/lib/practice/types";
import type { CreateNodeHandler, IdeWorkspaceAccess } from "@/components/ide/workspaceHook/workspace.types";
import type {
    IdeWorkspacePolicy,
    ImportedWorkspaceFile,
} from "@/components/ide/workspaceHook/workspace.policy";
import type { Toast } from "@/components/ide/types";
import { IconFile, IconFolder } from "../icons";
import { cn } from "@/lib/cn";
import { PlusIcon, Redo2, Undo2 } from "lucide-react";
import Tooltip from "@/components/ui/Tooltip";

type Props = {
    isSql: boolean;
    sqlDialect: SqlDialect;
    entryPath: string;
    upgradeText: string | null;
    filter: string;
    nodes: any[];
    expanded: any;
    activeFileId: string;
    entryFileId: string;
    language: string;
    inlineEdit: any;
    stdin: string;
    access: IdeWorkspaceAccess;
    policy: IdeWorkspacePolicy;
    onUpgrade: () => void;
    onChangeFilter: (value: string) => void;
    onChangeStdin: (value: string) => void;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    actions: {
        setInlineEdit: (value: any) => void;
        setToast: React.Dispatch<React.SetStateAction<Toast>>;
        openFile: (id: string) => void;
        toggleFolder: (id: string) => void;
        startNewFile: CreateNodeHandler;
        startNewFolder: CreateNodeHandler;
        startRename: (id: string) => void;
        setEntry: (id: string) => void;
        requestDelete: (id: string) => void;
        commitInlineEdit: (...args: any[]) => void;
        cancelInlineEdit: () => void;
        moveNode: (id: string, parentId: string | null) => void;
        importExternalFiles: (files: ImportedWorkspaceFile[]) => void;
    };
};

type FsPickerWindow = Window & {
    showOpenFilePicker?: (options?: any) => Promise<any[]>;
    showDirectoryPicker?: (options?: any) => Promise<any>;
};

async function readFileList(
    list: FileList | null,
    useRelativePath: boolean,
): Promise<ImportedWorkspaceFile[]> {
    const files = Array.from(list ?? []);
    return Promise.all(
        files.map(async (file) => {
            const relative =
                useRelativePath &&
                "webkitRelativePath" in file &&
                typeof (file as File & { webkitRelativePath?: string }).webkitRelativePath ===
                "string"
                    ? (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
                    : file.name;

            return {
                path: relative || file.name,
                content: await file.text(),
            };
        }),
    );
}

async function readDirectoryHandleRecursive(
    handle: any,
    basePath = handle?.name ?? "",
): Promise<ImportedWorkspaceFile[]> {
    const out: ImportedWorkspaceFile[] = [];

    for await (const entry of handle.values()) {
        const nextPath = basePath ? `${basePath}/${entry.name}` : entry.name;

        if (entry.kind === "file") {
            const file = await entry.getFile();
            out.push({
                path: nextPath,
                content: await file.text(),
            });
            continue;
        }

        if (entry.kind === "directory") {
            out.push(...(await readDirectoryHandleRecursive(entry, nextPath)));
        }
    }

    return out;
}

function formatMb(bytes: number) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function IdeExplorerPane({
                                            isSql,
                                            sqlDialect,
                                            entryPath,
                                            upgradeText,
                                            filter,
                                            nodes,
                                            expanded,
                                            activeFileId,
                                            entryFileId,
                                            language,
                                            inlineEdit,
                                            stdin,
                                            access,
                                            policy,
                                            onUpgrade,
                                            onChangeFilter,
                                            onChangeStdin,
                                            actions,
                                            canUndo,
                                            canRedo,
                                            onUndo,
                                            onRedo,
                                        }: Props) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const folderInputRef = useRef<HTMLInputElement | null>(null);

    const showNewFile = policy.canCreateFiles;
    const showNewFolder = policy.canCreateFolders;
    const showOpenFile = policy.canUploadFiles;
    const showOpenFolder = policy.canUploadFiles && policy.canCreateFolders;

    const uploadHint = useMemo(() => {
        if (!policy.canUploadFiles) {
            return access.hasUser
                ? "Uploads are disabled for this workspace."
                : "Log in to upload files.";
        }

        const perFile = formatMb(policy.maxUploadFileBytes);
        const atOnce = policy.maxImportFiles;
        return `Upload limit: ${perFile} per file, ${atOnce} file${atOnce === 1 ? "" : "s"} at a time.`;
    }, [policy, access]);

    useEffect(() => {
        const folderInput = folderInputRef.current;
        if (!folderInput) return;

        if (!showOpenFolder) return;

        folderInput.setAttribute("webkitdirectory", "");
        folderInput.setAttribute("directory", "");
    }, [showOpenFolder]);

    const handleOpenLocalFiles = async () => {
        if (!policy.canUploadFiles) {
            actions.setToast({
                kind: "error",
                text: access.hasUser
                    ? "Uploading files is not available in this workspace."
                    : "Log in to upload files.",
            });
            return;
        }

        try {
            const w = window as FsPickerWindow;

            if (typeof w.showOpenFilePicker === "function") {
                const handles = await w.showOpenFilePicker({
                    multiple: policy.maxImportFiles > 1,
                });

                const imported = await Promise.all(
                    handles.map(async (handle) => {
                        const file = await handle.getFile();
                        return {
                            path: file.name,
                            content: await file.text(),
                        };
                    }),
                );

                actions.importExternalFiles(imported);
                return;
            }

            fileInputRef.current?.click();
        } catch (err: any) {
            if (err?.name === "AbortError") return;
            console.error("[explorer] open local files failed", err);
        }
    };

    const handleOpenLocalFolder = async () => {
        if (!policy.canUploadFiles || !policy.canCreateFolders) {
            actions.setToast({
                kind: "error",
                text: "Folder import is not available in this workspace.",
            });
            return;
        }

        try {
            const w = window as FsPickerWindow;

            if (typeof w.showDirectoryPicker === "function") {
                const handle = await w.showDirectoryPicker();
                const imported = await readDirectoryHandleRecursive(handle, handle.name);
                actions.importExternalFiles(imported);
                return;
            }

            folderInputRef.current?.click();
        } catch (err: any) {
            if (err?.name === "AbortError") return;
            console.error("[explorer] open local folder failed", err);
        }
    };

    return (
        <div className="flex h-full min-h-0 flex-col bg-neutral-50/70 dark:bg-black/20">
            <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-3 dark:border-white/10">
                <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-neutral-600 dark:text-white/60">
                    {isSql ? "SQL Workspace" : "Explorer"}
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                        <Tooltip tip="Undo (Ctrl/Cmd+Z)" side="bottom">
              <span className="inline-flex">
                <button
                    type="button"
                    onClick={onUndo}
                    disabled={!canUndo}
                    aria-label="Undo"
                    className={cn(
                        "grid h-8 w-8 place-items-center rounded-lg border transition-colors",
                        canUndo
                            ? "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]"
                            : "cursor-not-allowed border-neutral-200/70 bg-neutral-100 text-neutral-400 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/25",
                    )}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
              </span>
                        </Tooltip>

                        <Tooltip tip="Redo (Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y)" side="bottom">
              <span className="inline-flex">
                <button
                    type="button"
                    onClick={onRedo}
                    disabled={!canRedo}
                    aria-label="Redo"
                    className={cn(
                        "grid h-8 w-8 place-items-center rounded-lg border transition-colors",
                        canRedo
                            ? "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]"
                            : "cursor-not-allowed border-neutral-200/70 bg-neutral-100 text-neutral-400 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/25",
                    )}
                >
                  <Redo2 className="h-3.5 w-3.5" />
                </button>
              </span>
                        </Tooltip>
                    </div>

                    <div className="min-w-0 text-[11px] font-extrabold text-neutral-500 dark:text-white/50">
                        {isSql ? (
                            <span className="truncate text-neutral-800 dark:text-white/80">
                {SQL_DIALECT_LABEL[sqlDialect]}
              </span>
                        ) : null}
                    </div>
                </div>
            </div>

            <div className="border-b border-neutral-200 p-3 dark:border-white/10">
                <input
                    value={filter}
                    onChange={(e) => onChangeFilter(e.target.value)}
                    placeholder={isSql ? "Filter SQL files…" : "Filter files…"}
                    className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-emerald-400 dark:border-white/10 dark:bg-black/30 dark:text-white/80"
                />
            </div>

            {(showNewFile || showNewFolder || showOpenFile || showOpenFolder) ? (
                <div className="border-b border-neutral-200 p-3 dark:border-white/10">
                    <div className="grid grid-cols-2 gap-1.5">
                        {showNewFile ? (
                            <button
                                type="button"
                                onClick={() => actions.startNewFile(null)}
                                className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-neutral-200/80 bg-white px-2.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]"
                            >
                                <PlusIcon className="h-3.5 w-3.5" />
                                New file
                            </button>
                        ) : null}

                        {showNewFolder ? (
                            <button
                                type="button"
                                onClick={() => actions.startNewFolder(null)}
                                className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-neutral-200/80 bg-white px-2.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]"
                            >
                                <PlusIcon className="h-3.5 w-3.5" />
                                New folder
                            </button>
                        ) : null}

                        {showOpenFile ? (
                            <button
                                type="button"
                                onClick={() => void handleOpenLocalFiles()}
                                className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-neutral-200/80 bg-white px-2.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]"
                            >
                                <IconFile className="h-3.5 w-3.5" />
                                Open file
                            </button>
                        ) : null}

                        {showOpenFolder ? (
                            <button
                                type="button"
                                onClick={() => void handleOpenLocalFolder()}
                                className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-neutral-200/80 bg-white px-2.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]"
                            >
                                <IconFolder className="h-3.5 w-3.5" />
                                Open folder
                            </button>
                        ) : null}
                    </div>

                    {showOpenFile ? (
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple={policy.maxImportFiles > 1}
                            className="hidden"
                            onChange={async (e) => {
                                const imported = await readFileList(e.currentTarget.files, false);
                                actions.importExternalFiles(imported);
                                e.currentTarget.value = "";
                            }}
                        />
                    ) : null}

                    {showOpenFolder ? (
                        <input
                            ref={folderInputRef}
                            type="file"
                            multiple
                            className="hidden"
                            onChange={async (e) => {
                                const imported = await readFileList(e.currentTarget.files, true);
                                actions.importExternalFiles(imported);
                                e.currentTarget.value = "";
                            }}
                        />
                    ) : null}

                    <div className="mt-2 text-[11px] font-semibold text-neutral-500 dark:text-white/50">
                        {uploadHint}
                    </div>
                </div>
            ) : null}

            {upgradeText ? (
                <div className="border-b border-neutral-200 px-3 py-3 dark:border-white/10">
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-semibold text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
                        {upgradeText}
                        <div className="mt-2">
                            <button type="button" onClick={onUpgrade} className="ui-btn ui-btn-secondary">
                                Upgrade
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
                <ExplorerTree
                    nodes={nodes}
                    expanded={expanded}
                    activeFileId={activeFileId}
                    entryFileId={entryFileId}
                    isSql={language === "sql"}
                    filter={filter}
                    inlineEdit={inlineEdit}
                    policy={policy}
                    setInlineEdit={actions.setInlineEdit}
                    openFile={actions.openFile}
                    toggleFolder={actions.toggleFolder}
                    startNewFile={actions.startNewFile}
                    startNewFolder={actions.startNewFolder}
                    startRename={actions.startRename}
                    setEntry={actions.setEntry}
                    requestDelete={actions.requestDelete}
                    moveNode={actions.moveNode}
                    commitInlineEdit={actions.commitInlineEdit}
                    cancelInlineEdit={actions.cancelInlineEdit}
                />
            </div>

            {isSql ? (
                <div className="border-t border-neutral-200 p-3 dark:border-white/10">
                    <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-neutral-600 dark:text-white/60">
                        SQL Mode
                    </div>
                    <div className="mt-2 space-y-2 text-xs font-semibold text-neutral-600 dark:text-white/60">
                        <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-white/10 dark:bg-black/30">
                            Active dialect:{" "}
                            <span className="font-black text-neutral-900 dark:text-white/85">
                {SQL_DIALECT_LABEL[sqlDialect]}
              </span>
                        </div>
                        <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-white/10 dark:bg-black/30">
                            SQL runs use the current editor file as the query source and show structured query
                            results in the output pane.
                        </div>
                    </div>
                </div>
            ) : language === "web" ? (
                <div className="border-t border-neutral-200 p-3 dark:border-white/10">
                    <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-neutral-600 dark:text-white/60">
                        Web Preview
                    </div>
                    <div className="mt-2 space-y-2 text-xs font-semibold text-neutral-600 dark:text-white/60">
                        <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-white/10 dark:bg-black/30">
                            Use <span className="font-black text-neutral-900 dark:text-white/85">index.html</span>,
                            <span className="font-black text-neutral-900 dark:text-white/85"> styles.css</span>, and
                            <span className="font-black text-neutral-900 dark:text-white/85"> script.js</span>.
                        </div>
                        <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-white/10 dark:bg-black/30">
                            The right pane is a live browser preview. Changes refresh automatically.
                        </div>
                    </div>
                </div>
            ) : (
                <div className="border-t border-neutral-200 p-3 dark:border-white/10">
                    <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-neutral-600 dark:text-white/60">
                        Shared stdin
                    </div>
                    <textarea
                        value={stdin}
                        onChange={(e) => onChangeStdin(e.target.value)}
                        placeholder="Shared input…"
                        className="mt-2 h-28 w-full resize-none rounded-lg border border-neutral-200 bg-white p-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-emerald-400 dark:border-white/10 dark:bg-black/30 dark:text-white/80"
                    />
                </div>
            )}
        </div>
    );
}