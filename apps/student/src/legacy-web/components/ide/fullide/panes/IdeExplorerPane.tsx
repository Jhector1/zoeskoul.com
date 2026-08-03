"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import ExplorerTree from "../ExplorerTree";
import { SQL_DIALECT_LABEL } from "../../constants";
import type { SqlDialect } from "@/lib/practice/types";
import type { CreateNodeHandler, IdeWorkspaceAccess } from "@/components/ide/workspaceHook/workspace.types";
import type {
    IdeWorkspacePolicy,
    ImportedWorkspaceFile,
} from "@/components/ide/workspaceHook/workspace.policy";
import type { Toast } from "@/components/ide/types";
import { IconChevronRight, IconFile, IconFolder } from "../icons";
import { cn } from "@/lib/cn";
import { PlusIcon, Redo2, Undo2 } from "lucide-react";
import Tooltip from "@/components/ui/Tooltip";
import type { FullIDEServices } from "@/components/ide/fullide/services";
import { resolveWorkspaceFileCapability } from "@zoeskoul/code-contracts";

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
    onToggleExplorer?: () => void;
    services: FullIDEServices;
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


function arrayBufferToBase64(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = "";

    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const chunk = bytes.subarray(offset, offset + chunkSize);
        binary += String.fromCharCode(...chunk);
    }

    return window.btoa(binary);
}

async function sha256Checksum(buffer: ArrayBuffer) {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return undefined;

    const digest = await subtle.digest("SHA-256", buffer);
    const hex = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
    ).join("");
    return `sha256:${hex}`;
}

type ImportReadLimits = {
    maxFiles: number;
    maxTextFileBytes: number;
    maxBinaryFileBytes: number;
    allowBinaryFiles: boolean;
};

function assertImportCount(count: number, limits: ImportReadLimits) {
    if (count > limits.maxFiles) {
        throw new Error(
            `You can import up to ${limits.maxFiles} file${limits.maxFiles === 1 ? "" : "s"} at a time.`,
        );
    }
}

async function readBrowserFile(
    file: File,
    path: string,
    limits: ImportReadLimits,
): Promise<ImportedWorkspaceFile> {
    const capability = resolveWorkspaceFileCapability(path);
    if (!capability) {
        throw new Error(`${path || file.name} is not a supported workspace file type.`);
    }

    if (capability.storage === "binary" && !limits.allowBinaryFiles) {
        throw new Error(
            `${path || file.name} requires a multi-file workspace to preserve binary assets.`,
        );
    }

    const maxBytes =
        capability.storage === "binary"
            ? limits.maxBinaryFileBytes
            : limits.maxTextFileBytes;
    if (file.size > maxBytes) {
        throw new Error(
            `${path || file.name} exceeds the ${(maxBytes / 1024 / 1024).toFixed(1)} MB ${capability.storage}-file limit.`,
        );
    }

    if (capability.storage === "text") {
        return { path, content: await file.text() };
    }

    const buffer = await file.arrayBuffer();
    const checksum = await sha256Checksum(buffer);
    return {
        path,
        content: "",
        binary: {
            encoding: "base64",
            data: arrayBufferToBase64(buffer),
            mimeType: capability.mimeType,
            sizeBytes: buffer.byteLength,
            ...(checksum ? { checksum } : {}),
        },
    };
}

type FsPickerWindow = Window & {
    showOpenFilePicker?: (options?: any) => Promise<any[]>;
    showDirectoryPicker?: (options?: any) => Promise<any>;
};

async function readFileList(
    list: FileList | null,
    useRelativePath: boolean,
    limits: ImportReadLimits,
): Promise<ImportedWorkspaceFile[]> {
    const files = Array.from(list ?? []);
    assertImportCount(files.length, limits);
    return Promise.all(
        files.map(async (file) => {
            const relative =
                useRelativePath &&
                "webkitRelativePath" in file &&
                typeof (file as File & { webkitRelativePath?: string }).webkitRelativePath ===
                "string"
                    ? (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
                    : file.name;

            return readBrowserFile(file, relative || file.name, limits);
        }),
    );
}

async function readDirectoryHandleRecursive(
    handle: any,
    basePath: string,
    limits: ImportReadLimits,
    out: ImportedWorkspaceFile[] = [],
): Promise<ImportedWorkspaceFile[]> {
    for await (const entry of handle.values()) {
        const nextPath = basePath ? `${basePath}/${entry.name}` : entry.name;

        if (entry.kind === "file") {
            assertImportCount(out.length + 1, limits);
            const file = await entry.getFile();
            out.push(await readBrowserFile(file, nextPath, limits));
            continue;
        }

        if (entry.kind === "directory") {
            await readDirectoryHandleRecursive(entry, nextPath, limits, out);
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
                                            onToggleExplorer,
                                            services,
}: Props) {
    const t = useTranslations("ide.explorer.pane");
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const folderInputRef = useRef<HTMLInputElement | null>(null);
    const importReadLimits = useMemo<ImportReadLimits>(
        () => ({
            maxFiles: policy.maxImportFiles,
            maxTextFileBytes: policy.maxFileContentBytes,
            maxBinaryFileBytes: policy.maxUploadFileBytes,
            allowBinaryFiles: policy.canUploadBinaryFiles,
        }),
        [
            policy.canUploadBinaryFiles,
            policy.maxFileContentBytes,
            policy.maxImportFiles,
            policy.maxUploadFileBytes,
        ],
    );

    const showNewFile = policy.canCreateFiles;
    const showNewFolder = policy.canCreateFolders;
    const showOpenFile =
        services.explorer.showFooter &&
        services.explorer.fileActions.enabled &&
        policy.canUploadFiles;
    const showOpenFolder =
        services.explorer.showFooter &&
        services.explorer.fileActions.enabled &&
        policy.canUploadFiles &&
        policy.canCreateFolders;

    const uploadHint = useMemo(() => {
        if (!policy.canUploadFiles) {
            return access.hasUser
                ? t("uploadDisabled")
                : t("logInToUpload");
        }

        const textPerFile = formatMb(policy.maxFileContentBytes);
        const binaryPerFile = formatMb(policy.maxUploadFileBytes);
        const atOnce = policy.maxImportFiles;
        return t("uploadLimit", {
            textPerFile,
            binaryPerFile,
            count: atOnce,
            fileWord: atOnce === 1 ? "file" : "files",
        });
    }, [policy, access, t]);

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
                    ? t("uploadUnavailable")
                    : t("logInToUpload"),
            });
            return;
        }

        try {
            const w = window as FsPickerWindow;

            if (typeof w.showOpenFilePicker === "function") {
                const handles = await w.showOpenFilePicker({
                    multiple: policy.maxImportFiles > 1,
                });

                assertImportCount(handles.length, importReadLimits);
                const imported = await Promise.all(
                    handles.map(async (handle) => {
                        const file = await handle.getFile();
                        return readBrowserFile(file, file.name, importReadLimits);
                    }),
                );

                actions.importExternalFiles(imported);
                return;
            }

            fileInputRef.current?.click();
        } catch (err: any) {
            if (err?.name === "AbortError") return;
            console.error("[explorer] open local files failed", err);
            actions.setToast({
                kind: "error",
                text: err instanceof Error ? err.message : t("uploadUnavailable"),
            });
        }
    };

    const handleOpenLocalFolder = async () => {
        if (!policy.canUploadFiles || !policy.canCreateFolders) {
            actions.setToast({
                kind: "error",
                text: t("folderImportUnavailable"),
            });
            return;
        }

        try {
            const w = window as FsPickerWindow;

            if (typeof w.showDirectoryPicker === "function") {
                const handle = await w.showDirectoryPicker();
                const imported = await readDirectoryHandleRecursive(
                    handle,
                    handle.name,
                    importReadLimits,
                );
                actions.importExternalFiles(imported);
                return;
            }

            folderInputRef.current?.click();
        } catch (err: any) {
            if (err?.name === "AbortError") return;
            console.error("[explorer] open local folder failed", err);
            actions.setToast({
                kind: "error",
                text: err instanceof Error ? err.message : t("folderImportUnavailable"),
            });
        }
    };

    return (
        <div
            className="flex h-full min-h-0 flex-col bg-neutral-50/70 dark:bg-black/20"
            data-testid="tools-file-tree"
        >
            <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-3 dark:border-white/10">
                <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-neutral-600 dark:text-white/60">
                    {isSql ? t("sqlWorkspace") : t("title")}
                </div>

                <div className="flex items-center gap-2">
                    {services.explorer.showHistoryControls ? (
                        <div className="flex items-center gap-1">
                            <Tooltip tip={t("undoTip")} side="bottom">
                                <span className="inline-flex">
                                    <button
                                        type="button"
                                        onClick={onUndo}
                                        disabled={!canUndo}
                                        aria-label={t("undo")}
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

                            <Tooltip tip={t("redoTip")} side="bottom">
                                <span className="inline-flex">
                                    <button
                                        type="button"
                                        onClick={onRedo}
                                        disabled={!canRedo}
                                        aria-label={t("redo")}
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
                    ) : null}

                    <div className="min-w-0 text-[11px] font-extrabold text-neutral-500 dark:text-white/50">
                        {isSql ? (
                            <span className="truncate text-neutral-800 dark:text-white/80">
                {SQL_DIALECT_LABEL[sqlDialect]}
              </span>
                        ) : null}
                    </div>
                    {onToggleExplorer ? (
                        <Tooltip tip={t("collapseExplorer")} side="bottom">
                            <button
                                type="button"
                                onClick={onToggleExplorer}
                                aria-label={t("collapseExplorer")}
                                className="grid h-8 w-8 place-items-center rounded-lg border border-neutral-200 bg-white text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]"
                            >
                                <IconChevronRight className="h-4 w-4 rotate-180" />
                            </button>
                        </Tooltip>
                    ) : null}

                </div>
            </div>

            {services.explorer.showFilter ? (
                <div className="border-b border-neutral-200 p-3 dark:border-white/10">
                    <input
                        value={filter}
                        onChange={(e) => onChangeFilter(e.target.value)}
                        placeholder={isSql ? t("filterSqlFiles") : t("filterFiles")}
                        className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-emerald-400 dark:border-white/10 dark:bg-black/30 dark:text-white/80"
                    />
                </div>
            ) : null}

            {services.explorer.showActions && (showNewFile || showNewFolder || showOpenFile || showOpenFolder) ? (
                <div className="border-b border-neutral-200 p-3 dark:border-white/10">
                    <div className="grid grid-cols-2 gap-1.5">
                        {showNewFile ? (
                            <button
                                type="button"
                                onClick={() => actions.startNewFile(null)}
                                className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-neutral-200/80 bg-white px-2.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]"
                            >
                                <PlusIcon className="h-3.5 w-3.5" />
                                {t("newFile")}
                            </button>
                        ) : null}

                        {showNewFolder ? (
                            <button
                                type="button"
                                onClick={() => actions.startNewFolder(null)}
                                className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-neutral-200/80 bg-white px-2.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]"
                            >
                                <PlusIcon className="h-3.5 w-3.5" />
                                {t("newFolder")}
                            </button>
                        ) : null}

                        {showOpenFile ? (
                            <button
                                type="button"
                                onClick={() => void handleOpenLocalFiles()}
                                className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-neutral-200/80 bg-white px-2.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]"
                            >
                                <IconFile className="h-3.5 w-3.5" />
                                {t("openFile")}
                            </button>
                        ) : null}

                        {showOpenFolder ? (
                            <button
                                type="button"
                                onClick={() => void handleOpenLocalFolder()}
                                className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-neutral-200/80 bg-white px-2.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]"
                            >
                                <IconFolder className="h-3.5 w-3.5" />
                                {t("openFolder")}
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
                                const input = e.currentTarget;
                                try {
                                    const imported = await readFileList(
                                        input.files,
                                        false,
                                        importReadLimits,
                                    );
                                    actions.importExternalFiles(imported);
                                } catch (error) {
                                    actions.setToast({
                                        kind: "error",
                                        text:
                                            error instanceof Error
                                                ? error.message
                                                : t("uploadUnavailable"),
                                    });
                                } finally {
                                    input.value = "";
                                }
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
                                const input = e.currentTarget;
                                try {
                                    const imported = await readFileList(
                                        input.files,
                                        true,
                                        importReadLimits,
                                    );
                                    actions.importExternalFiles(imported);
                                } catch (error) {
                                    actions.setToast({
                                        kind: "error",
                                        text:
                                            error instanceof Error
                                                ? error.message
                                                : t("folderImportUnavailable"),
                                    });
                                } finally {
                                    input.value = "";
                                }
                            }}
                        />
                    ) : null}

                    {showOpenFile || showOpenFolder ? (
                        <div className="mt-2 text-[11px] font-semibold text-neutral-500 dark:text-white/50">
                            {uploadHint}
                        </div>
                    ) : null}
                </div>
            ) : null}

            {upgradeText ? (
                <div className="border-b border-neutral-200 px-3 py-3 dark:border-white/10">
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-semibold text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
                        {upgradeText}
                        <div className="mt-2">
                            <button type="button" onClick={onUpgrade} className="ui-btn ui-btn-secondary">
                                {t("upgrade")}
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
                    allowSetEntry={services.editor.showEditor}
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

            {services.explorer.showFooter && isSql ? (
                <div className="border-t border-neutral-200 p-3 dark:border-white/10">
                    <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-neutral-600 dark:text-white/60">
                        {t("sqlMode")}
                    </div>
                    <div className="mt-2 space-y-2 text-xs font-semibold text-neutral-600 dark:text-white/60">
                        <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-white/10 dark:bg-black/30">
                            {t("activeDialect")}{" "}
                            <span className="font-black text-neutral-900 dark:text-white/85">
                {SQL_DIALECT_LABEL[sqlDialect]}
              </span>
                        </div>
                        <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-white/10 dark:bg-black/30">
                            {t("sqlModeHelp")}
                        </div>
                    </div>
                </div>
            ) : services.explorer.showFooter && language === "web" ? (
                <div className="border-t border-neutral-200 p-3 dark:border-white/10">
                    <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-neutral-600 dark:text-white/60">
                        {t("webPreview")}
                    </div>
                    <div className="mt-2 space-y-2 text-xs font-semibold text-neutral-600 dark:text-white/60">
                        <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-white/10 dark:bg-black/30">
                            {t("webPreviewFiles")}
                        </div>
                        <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-white/10 dark:bg-black/30">
                            {t("webPreviewHelp")}
                        </div>
                    </div>
                </div>
            ) : services.explorer.showFooter && services.explorer.showStdin ? (
                <div className="border-t border-neutral-200 p-3 dark:border-white/10">
                    <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-neutral-600 dark:text-white/60">
                        {t("sharedStdin")}
                    </div>
                    <textarea
                        value={stdin}
                        onChange={(e) => onChangeStdin(e.target.value)}
                        placeholder={t("sharedInputPlaceholder")}
                        className="mt-2 h-28 w-full resize-none rounded-lg border border-neutral-200 bg-white p-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-emerald-400 dark:border-white/10 dark:bg-black/30 dark:text-white/80"
                    />
                </div>
            ) : null}
        </div>
    );
}
