"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLearnerWorkspaceTranslations as useTranslations } from "@zoeskoul/learner-workspace/runtime/appRuntime";
import ExplorerTree from "@zoeskoul/learner-workspace/fullide/ExplorerTree";
import { SQL_DIALECT_LABEL } from "@zoeskoul/learner-workspace/ide/constants";
import type { SqlDialect } from "@zoeskoul/learner-workspace/contracts/practiceTypes";
import type { CreateNodeHandler, IdeWorkspaceAccess } from "@zoeskoul/learner-workspace/ide/workspaceHook/workspace.types";
import type {
    IdeWorkspacePolicy,
    ImportedWorkspaceFile,
} from "@zoeskoul/learner-workspace/ide/workspaceHook/workspace.policy";
import type { Toast } from "@zoeskoul/learner-workspace/ide/types";
import { IconChevronRight, IconFile, IconFolder } from "@zoeskoul/learner-workspace/ide/fullide/icons";
import { cn } from "@zoeskoul/learner-ui/lib/cn";
import { CircleHelp, Download, PlusIcon, Redo2, Undo2 } from "lucide-react";
import Tooltip from "@zoeskoul/learner-workspace/ui/Tooltip";
import type { FullIDEServices } from "@zoeskoul/learner-workspace/ide/fullide/services";
import type { EditorSplitPlacement } from "@zoeskoul/learner-workspace/runner/types";
import { resolveWorkspaceFileCapability } from "@zoeskoul/code-contracts";
import { shouldSkipV6FolderImportPath } from "../v6FolderImportFilter";

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
    onV6ListTrash?: () => Promise<ReadonlyArray<Readonly<{originalPath:string;trashId:string}>>>;
    onV6RestoreTrash?: (entry: Readonly<{originalPath:string;trashId:string}>) => Promise<boolean>;
    onV6Download?: (selection: import("../workspaceDownloadV6Session").V6DownloadSelection) => Promise<void>;
    services: FullIDEServices;
    actions: {
        setInlineEdit: (value: any) => void;
        setToast: React.Dispatch<React.SetStateAction<Toast>>;
        openFile: (id: string) => void;
        openFileInSplit: (id: string, placement: EditorSplitPlacement) => void;
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

function importedFolderSummary(skipped: string[]): string {
    const names = skipped.slice(0, 3).join(", ");
    return `${skipped.length} generated/private item${skipped.length === 1 ? "" : "s"} excluded${names ? ` (e.g. ${names})` : ""}.`;
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
    const selected = useRelativePath ? files.filter(file => !shouldSkipV6FolderImportPath(file.webkitRelativePath || file.name)) : files;
    assertImportCount(selected.length, limits);
    return Promise.all(
        selected.map(async (file) => {
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
    skipped: string[] = [],
): Promise<ImportedWorkspaceFile[]> {
    for await (const entry of handle.values()) {
        const nextPath = basePath ? `${basePath}/${entry.name}` : entry.name;
        if (shouldSkipV6FolderImportPath(nextPath)) {
            skipped.push(nextPath);
            continue;
        }

        if (entry.kind === "file") {
            assertImportCount(out.length + 1, limits);
            const file = await entry.getFile();
            out.push(await readBrowserFile(file, nextPath, limits));
            continue;
        }

        if (entry.kind === "directory") {
            await readDirectoryHandleRecursive(entry, nextPath, limits, out, skipped);
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
                                            onV6ListTrash,
                                            onV6RestoreTrash,
                                            onV6Download,
                                            services,
}: Props) {
    const t = useTranslations("ide.explorer.pane");
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const folderInputRef = useRef<HTMLInputElement | null>(null);
    const [trashEntries, setTrashEntries] = useState<ReadonlyArray<Readonly<{originalPath:string;trashId:string}>> | null>(null);
    const [trashBusy, setTrashBusy] = useState(false);
    const [folderImportNote, setFolderImportNote] = useState<string | null>(null);
    const [helpOpen, setHelpOpen] = useState(false);
    const [helpPosition, setHelpPosition] = useState({ top: 44, left: 8 });
    const helpButtonRef = useRef<HTMLButtonElement | null>(null);
    const helpPanelRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!helpOpen) return;
        const updatePosition = () => {
            const rect = helpButtonRef.current?.getBoundingClientRect();
            if (!rect) return;
            const width = Math.min(320, window.innerWidth - 16);
            setHelpPosition({
                top: Math.min(rect.bottom + 8, Math.max(8, window.innerHeight - 180)),
                left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
            });
        };
        const closeOnOutside = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (helpButtonRef.current?.contains(target) || helpPanelRef.current?.contains(target)) return;
            setHelpOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setHelpOpen(false);
                helpButtonRef.current?.focus();
            }
        };
        updatePosition();
        window.addEventListener("resize", updatePosition);
        window.addEventListener("scroll", updatePosition, true);
        document.addEventListener("pointerdown", closeOnOutside);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            window.removeEventListener("resize", updatePosition);
            window.removeEventListener("scroll", updatePosition, true);
            document.removeEventListener("pointerdown", closeOnOutside);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [helpOpen]);
    const loadV6Trash = async () => {
        if (!onV6ListTrash || trashBusy) return;
        setTrashBusy(true);
        try { setTrashEntries(await onV6ListTrash()); }
        catch (error) {
            actions.setToast({kind:"error",text:error instanceof Error ? error.message : "Unable to list recoverable folders."});
        }
        finally { setTrashBusy(false); }
    };
    const restoreV6Folder = async (entry: Readonly<{originalPath:string;trashId:string}>) => {
        if (!onV6RestoreTrash || trashBusy) return;
        setTrashBusy(true);
        try {
            if (await onV6RestoreTrash(entry)) {
                setTrashEntries((items) => items?.filter((item) => item.trashId !== entry.trashId) ?? null);
            }
        } finally { setTrashBusy(false); }
    };
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
    // Visibility follows the actual import capability, not the unrelated footer.
    const showOpenFile = services.explorer.showActions &&
        services.explorer.fileActions.enabled && policy.canUploadFiles;
    const showOpenFolder = services.explorer.showActions &&
        services.explorer.fileActions.enabled && policy.canUploadFiles && policy.canCreateFolders;

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
                const skipped: string[] = [];
                const imported = await readDirectoryHandleRecursive(
                    handle, handle.name, importReadLimits, [], skipped,
                );
                if (!imported.length) throw new Error("No supported files found in this folder.");
                setFolderImportNote(skipped.length ? importedFolderSummary(skipped) : null);
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
                    {onV6ListTrash && onV6RestoreTrash ? (
                        <>
                            <button
                                ref={helpButtonRef}
                                type="button"
                                aria-label="Workspace help"
                                aria-expanded={helpOpen}
                                aria-controls="zoelearning-workspace-help"
                                title="Workspace help"
                                onClick={() => setHelpOpen(open => !open)}
                                className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-600 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-white/10 dark:text-neutral-300 dark:hover:bg-white/10"
                            >
                                <CircleHelp className="h-4 w-4" aria-hidden="true" />
                            </button>
                            {helpOpen && typeof document !== "undefined" ? createPortal(
                                <div
                                    ref={helpPanelRef}
                                    id="zoelearning-workspace-help"
                                    role="region"
                                    aria-label="Workspace help"
                                    className="fixed z-[9999] w-[min(20rem,calc(100vw-1rem))] max-h-[min(18rem,calc(100vh-2rem))] overflow-y-auto rounded-lg border border-neutral-200 bg-white p-3 text-left text-xs leading-relaxed text-neutral-700 shadow-xl dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
                                    style={{ top: helpPosition.top, left: helpPosition.left }}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <strong className="font-semibold text-neutral-900 dark:text-neutral-50">Workspace help</strong>
                                        <button type="button" onClick={() => { setHelpOpen(false); helpButtonRef.current?.focus(); }} aria-label="Close workspace help" className="rounded px-2 py-1 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 dark:hover:bg-white/10">Close</button>
                                    </div>
                                    <p className="mt-2">Files synchronize with this terminal session. Use <strong>Save Project</strong> to save a separate cloud version when available.</p>
                                    <p className="mt-2">Other tabs may have different terminal sessions. If a synchronization conflict appears, preserve your draft before retrying.</p>
                                    <p className="mt-2">Recovery options below can restore deleted folders.</p>
                                </div>, document.body
                            ) : null}
                        </>
                    ) : null}
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

            {onV6ListTrash && onV6RestoreTrash ? (
                <div className="border-b border-neutral-200 px-3 py-2 dark:border-white/10">
                    <details className="text-xs text-neutral-600 dark:text-white/70">
                        <summary className="cursor-pointer font-medium">Recovery options</summary>
                        <button type="button" disabled={trashBusy} onClick={() => void loadV6Trash()}
                            className="mt-2 text-xs font-semibold underline disabled:opacity-50">
                            {trashBusy ? "Checking recoverable folders…" : "Browse previously deleted folders"}
                        </button>
                    {trashEntries !== null ? (
                        <div className="mt-2 space-y-1 text-xs" aria-live="polite">
                            {trashEntries.length === 0 ? <p>No recoverable folders.</p> : trashEntries.map((entry) => (
                                <div key={entry.trashId} className="flex items-center justify-between gap-2">
                                    <span className="min-w-0 truncate" title={entry.originalPath}>{entry.originalPath}</span>
                                    <button type="button" disabled={trashBusy}
                                        onClick={() => void restoreV6Folder(entry)}
                                        className="rounded border px-2 py-1 font-medium disabled:opacity-50">Restore</button>
                                </div>
                            ))}
                        </div>
                    ) : null}
                    </details>
                </div>
            ) : null}

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

            {(onV6Download || (services.explorer.showActions && (showNewFile || showNewFolder || showOpenFile || showOpenFolder))) ? (
                <details data-testid="explorer-file-actions" className="group border-b border-neutral-200 dark:border-white/10">
                    <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 dark:text-white/75 dark:hover:bg-white/[0.04]">
                        <span>File actions</span>
                        <span className="flex items-center gap-2 text-[11px] font-normal text-neutral-500 dark:text-white/50">New · Open · Download <IconChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" /></span>
                    </summary>
                    <div className="border-t border-neutral-200/70 dark:border-white/10">
            {onV6Download ? (
                <div className="px-3 py-2">
                    <button type="button" onClick={()=>void onV6Download({kind:"project",projectName:"project"})}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/75 dark:hover:bg-white/[0.08]">
                        <Download className="h-3.5 w-3.5" /> Download project ZIP
                    </button>
                </div>
            ) : null}

            {services.explorer.showActions && (showNewFile || showNewFolder || showOpenFile || showOpenFolder) ? (
                <div className="px-3 py-2">
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
                                    if (!imported.length) throw new Error("No files selected.");
                                    setFolderImportNote(null);
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
                                    if (!imported.length) throw new Error("No supported files found in this folder.");
                                    const skipped = Array.from(input.files ?? []).filter(file => shouldSkipV6FolderImportPath(file.webkitRelativePath || file.name)).map(file => file.webkitRelativePath || file.name);
                                    setFolderImportNote(skipped.length ? importedFolderSummary(skipped) : null);
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

                    {folderImportNote ? (
                        <p role="status" className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">{folderImportNote}</p>
                    ) : null}
                    {showOpenFile || showOpenFolder ? (
                        <div className="mt-2 text-[11px] font-semibold text-neutral-500 dark:text-white/50">
                            {uploadHint}
                        </div>
                    ) : null}
                </div>
            ) : null}

                    </div>
                </details>
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
                    openFileInSplit={actions.openFileInSplit}
                    toggleFolder={actions.toggleFolder}
                    startNewFile={actions.startNewFile}
                    startNewFolder={actions.startNewFolder}
                    startRename={actions.startRename}
                    setEntry={actions.setEntry}
                    requestDelete={actions.requestDelete}
                    onDownloadNode={onV6Download ? (path,kind)=>void onV6Download({kind,path}) : undefined}
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
