"use client";

import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import {
    isExportableV6Path, prepareV6FileDownload, prepareV6ZipDownload,
    V6_DOWNLOAD_MAX_ENTRIES, V6_DOWNLOAD_MAX_FILE_BYTES, V6_DOWNLOAD_MAX_TOTAL_BYTES,
    type V6DownloadEntry, type V6PreparedDownload,
} from "./workspaceDownloadV6";

export type V6DownloadSelection =
    | Readonly<{kind:"project";projectName:string}>
    | Readonly<{kind:"file" | "folder";path:string}>;

/**
 * Convert one authenticated Runner snapshot. Never use local browser nodes or
 * an unverified editor cache for downloads. Reject malformed data instead of
 * quietly omitting files or returning a partial archive.
 */
export function prepareV6SessionDownload(
    snapshot: readonly WorkspaceSyncEntry[], selection: V6DownloadSelection,
): V6PreparedDownload {
    if (!Array.isArray(snapshot) || snapshot.length > V6_DOWNLOAD_MAX_ENTRIES) {
        throw new Error("Workspace download exceeds its entry limit.");
    }
    const entries: V6DownloadEntry[] = [];
    let total = 0;
    for (const item of snapshot) {
        if (!item || typeof item.path !== "string") throw new Error("Invalid workspace snapshot entry.");
        // The Runner's private files are intentionally absent from its snapshot.
        // Defense in depth: skip recognized private paths if a newer Runner adds them.
        if (!isExportableV6Path(item.path)) continue;
        if (item.kind === "directory") {
            entries.push({kind:"directory",path:item.path});
            continue;
        }
        if (item.kind !== "file") throw new Error("Invalid workspace snapshot file type.");
        let bytes: Uint8Array;
        if ("encoding" in item && item.encoding === "base64") {
            const data = item.data;
            const sizeBytes = item.sizeBytes;
            if (typeof data !== "string" ||
                !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data) ||
                data.length > Math.ceil(V6_DOWNLOAD_MAX_FILE_BYTES / 3) * 4 + 4 ||
                typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) ||
                sizeBytes < 0 || sizeBytes > V6_DOWNLOAD_MAX_FILE_BYTES) {
                throw new Error("Invalid binary content in workspace snapshot.");
            }
            const binary = atob(data);
            if (binary.length !== sizeBytes || btoa(binary) !== data) {
                throw new Error("Corrupted binary content in workspace snapshot.");
            }
            bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
        } else if ("content" in item && typeof item.content === "string") {
            bytes = new TextEncoder().encode(item.content);
        } else {
            throw new Error("Workspace snapshot is missing file contents.");
        }
        if (bytes.byteLength > V6_DOWNLOAD_MAX_FILE_BYTES) {
            throw new Error("A file exceeds the workspace export limit.");
        }
        total += bytes.byteLength;
        if (total > V6_DOWNLOAD_MAX_TOTAL_BYTES) {
            throw new Error("Workspace exceeds the browser export limit.");
        }
        entries.push({kind:"file",path:item.path,bytes});
    }
    if (selection.kind === "project") {
        return prepareV6ZipDownload(entries,{projectName:selection.projectName});
    }
    if (!isExportableV6Path(selection.path)) {
        throw new Error("Invalid download selection.");
    }
    if (selection.kind === "folder") {
        return prepareV6ZipDownload(entries,{folderPath:selection.path});
    }
    const file = entries.find(item => item.path === selection.path && item.kind === "file");
    if (!file) throw new Error("Selected file is not in the terminal snapshot.");
    return prepareV6FileDownload(file);
}

/** Trigger a regular browser download; no data or URL is uploaded elsewhere. */
export function saveV6BrowserDownload(download: V6PreparedDownload): void {
    const buffer = new ArrayBuffer(download.bytes.byteLength);
    new Uint8Array(buffer).set(download.bytes);
    const blob = new Blob([buffer], {type: download.mimeType});
    const url = URL.createObjectURL(blob);
    try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = download.filename;
        anchor.style.display = "none";
        document.body.appendChild(anchor);
        try { anchor.click(); }
        finally { anchor.remove(); }
    } finally {
        // Safari/Chrome need the object URL to survive the click dispatch.
        window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }
}
