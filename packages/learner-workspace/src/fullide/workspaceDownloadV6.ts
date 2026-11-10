/**
 * Browser-side ZIP format and export policy for a single authenticated V6 workspace.
 *
 * This module deliberately does not fetch files. Callers must read the selected
 * file bytes from the *current* authenticated Runner session, after reconciling
 * pending editor writes. Never use a stale local editor snapshot as ZIP input.
 */
export type V6DownloadEntry = Readonly<{
    path: string;
    kind: "file" | "directory";
    /** Exact bytes from the authoritative Runner read. Required for files. */
    bytes?: Uint8Array;
}>;

export type V6PreparedDownload = Readonly<{
    filename: string;
    mimeType: string;
    bytes: Uint8Array;
}>;

/** Export payload is intentionally bounded to avoid freezing the browser. */
export const V6_DOWNLOAD_MAX_ENTRIES = 1_000;
export const V6_DOWNLOAD_MAX_TOTAL_BYTES = 40 * 1024 * 1024;
export const V6_DOWNLOAD_MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_PATH_BYTES = 512;
const UTF8 = new TextEncoder();
const CONTROL = /[\u0000-\u001f\u007f]/;
const FORBIDDEN = new Set([
    ".git", ".ssh", ".env", ".bash_history", ".zoe-v6-trash", ".DS_Store",
    ".npmrc", ".netrc", ".pypirc", ".aws", ".kube", ".gnupg",
    "node_modules", ".next",
]);

function isProtectedPart(segment: string): boolean {
    return FORBIDDEN.has(segment) || segment.startsWith(".env.") ||
        segment.startsWith(".zoe-v6-file-") ||
        segment.startsWith(".zoe-sync-");
}

export function isExportableV6Path(raw: string): boolean {
    if (typeof raw !== "string" || raw.length === 0 || raw.startsWith("/") ||
        raw.includes("\\") || /^[A-Za-z]:/.test(raw) || CONTROL.test(raw)) return false;
    const parts = raw.replace(/\/$/, "").split("/");
    if (parts.some(part => !part || part === "." || part === ".." || isProtectedPart(part))) return false;
    return UTF8.encode(raw).byteLength <= MAX_PATH_BYTES;
}

function safeDownloadName(raw: string, fallback: string): string {
    const cleaned = raw.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "-").trim();
    return cleaned && cleaned !== "." && cleaned !== ".." ? cleaned.slice(0, 100) : fallback;
}

/**
 * Single-file exports preserve their original bytes, name and extension.
 * The caller must verify the file's current revision at the Runner boundary.
 */
export function prepareV6FileDownload(file: V6DownloadEntry): V6PreparedDownload {
    if (file.kind !== "file" || !isExportableV6Path(file.path) || !(file.bytes instanceof Uint8Array)) {
        throw new Error("File is not available for download.");
    }
    if (file.bytes.length > V6_DOWNLOAD_MAX_FILE_BYTES) {
        throw new Error("File exceeds the browser download limit.");
    }
    const name = file.path.split("/").at(-1) ?? "file";
    const copy = Uint8Array.from(file.bytes);
    return { filename: safeDownloadName(name, "file"), mimeType: "application/octet-stream", bytes: copy };
}

const CRC_TABLE = (() => {
    const values = new Uint32Array(256);
    for (let i = 0; i < values.length; i++) {
        let c = i;
        for (let bit = 0; bit < 8; bit++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        values[i] = c >>> 0;
    }
    return values;
})();

function crc32(bytes: Uint8Array): number {
    let result = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) result = CRC_TABLE[(result ^ bytes[i]) & 255] ^ (result >>> 8);
    return (result ^ 0xffffffff) >>> 0;
}

function put16(target: Uint8Array, offset: number, value: number) {
    target[offset] = value & 255;
    target[offset + 1] = (value >>> 8) & 255;
}
function put32(target: Uint8Array, offset: number, value: number) {
    put16(target, offset, value & 0xffff);
    put16(target, offset + 2, value >>> 16);
}

/**
 * Safe, dependency-free ZIP (STORED; no compression). Standard readers can
 * extract text, binary files and empty directories without changing bytes.
 * The input is a single, reconciled Runner snapshot; paths under private
 * metadata or trash are never archived. Callers must not silently truncate
 * a Runner listing before passing it here.
 */
export function prepareV6ZipDownload(
    entries: readonly V6DownloadEntry[],
    options: Readonly<{ projectName?: string; folderPath?: string }> = {},
): V6PreparedDownload {
    if (entries.length > V6_DOWNLOAD_MAX_ENTRIES) throw new Error("Too many files to download.");
    const folder = options.folderPath?.replace(/\/$/, "");
    if (folder && !isExportableV6Path(folder)) throw new Error("Invalid folder selection.");
    if (folder && !entries.some(entry => entry.path.replace(/\/$/, "") === folder && entry.kind === "directory")) {
        throw new Error("Selected folder is not in this workspace snapshot.");
    }

    const selected: Array<{ path: string; name: Uint8Array; bytes: Uint8Array; isDir: boolean; crc: number }> = [];
    const observed = new Set<string>();
    let totalBytes = 0;
    for (const entry of entries) {
        // A protected subtree is internal Runner state, never learner content.
        if (!isExportableV6Path(entry.path)) continue;
        const path = entry.path.replace(/\/$/, "");
        if (folder && path !== folder && !path.startsWith(`${folder}/`)) continue;
        if (observed.has(path)) throw new Error("Duplicate workspace path in download snapshot.");
        observed.add(path);
        const isDir = entry.kind === "directory";
        if (!isDir && entry.kind !== "file") throw new Error("Unknown workspace file type.");
        if (!isDir && !(entry.bytes instanceof Uint8Array)) throw new Error("Workspace snapshot is missing file bytes.");
        const bytes = isDir ? new Uint8Array() : Uint8Array.from(entry.bytes!);
        if (bytes.length > V6_DOWNLOAD_MAX_FILE_BYTES) throw new Error("A file exceeds the browser download limit.");
        totalBytes += bytes.length;
        if (totalBytes > V6_DOWNLOAD_MAX_TOTAL_BYTES) throw new Error("Workspace download exceeds the browser limit.");
        const name = UTF8.encode(path + (isDir ? "/" : ""));
        if (name.length > MAX_PATH_BYTES) throw new Error("Workspace path is too long.");
        selected.push({path, name, bytes, isDir, crc: crc32(bytes)});
    }
    // Never silently produce an empty ZIP after filtering or mismatched selection.
    if (!selected.length) throw new Error("There are no exportable files in this selection.");
    for (const entry of selected) {
        if (!entry.isDir && Array.from(observed).some(p => p.startsWith(`${entry.path}/`))) {
            throw new Error("Workspace snapshot contains a file/directory path collision.");
        }
    }
    selected.sort((a, b) => a.path.localeCompare(b.path));

    const localSize = selected.reduce((n, e) => n + 30 + e.name.length + e.bytes.length, 0);
    const centralSize = selected.reduce((n, e) => n + 46 + e.name.length, 0);
    if (localSize + centralSize + 22 > 0xffffffff) throw new Error("ZIP exceeds format limits.");
    const out = new Uint8Array(localSize + centralSize + 22);
    let pos = 0;
    const offsets: number[] = [];
    for (const entry of selected) {
        offsets.push(pos);
        put32(out, pos, 0x04034b50); // Local file header
        put16(out, pos + 4, 20); // version needed
        put16(out, pos + 6, 0x0800); // UTF-8 filenames
        put16(out, pos + 8, 0); // stored, no compression
        put16(out, pos + 10, 0); // DOS time (1980-01-01)
        put16(out, pos + 12, 33); // DOS date
        put32(out, pos + 14, entry.crc);
        put32(out, pos + 18, entry.bytes.length);
        put32(out, pos + 22, entry.bytes.length);
        put16(out, pos + 26, entry.name.length);
        put16(out, pos + 28, 0);
        pos += 30;
        out.set(entry.name, pos); pos += entry.name.length;
        out.set(entry.bytes, pos); pos += entry.bytes.length;
    }
    const centralOffset = pos;
    for (let i = 0; i < selected.length; i++) {
        const entry = selected[i];
        put32(out, pos, 0x02014b50);
        put16(out, pos + 4, 20);
        put16(out, pos + 6, 20);
        put16(out, pos + 8, 0x0800);
        put16(out, pos + 10, 0);
        put16(out, pos + 12, 0);
        put16(out, pos + 14, 33);
        put32(out, pos + 16, entry.crc);
        put32(out, pos + 20, entry.bytes.length);
        put32(out, pos + 24, entry.bytes.length);
        put16(out, pos + 28, entry.name.length);
        put16(out, pos + 30, 0);
        put16(out, pos + 32, 0);
        put16(out, pos + 34, 0);
        put16(out, pos + 36, 0);
        put32(out, pos + 38, entry.isDir ? 0x10 : 0);
        put32(out, pos + 42, offsets[i]);
        pos += 46;
        out.set(entry.name, pos); pos += entry.name.length;
    }
    put32(out, pos, 0x06054b50);
    put16(out, pos + 4, 0);
    put16(out, pos + 6, 0);
    put16(out, pos + 8, selected.length);
    put16(out, pos + 10, selected.length);
    put32(out, pos + 12, centralSize);
    put32(out, pos + 16, centralOffset);
    put16(out, pos + 20, 0);
    pos += 22;
    if (pos !== out.length) throw new Error("ZIP size mismatch.");
    const label = folder?.split("/").at(-1) ?? options.projectName ?? "project";
    return {
        filename: `${safeDownloadName(label, "project")}.zip`,
        mimeType: "application/zip",
        bytes: out,
    };
}
