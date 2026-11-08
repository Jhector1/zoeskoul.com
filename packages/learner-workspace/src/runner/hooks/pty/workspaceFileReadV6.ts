"use client";

import { WorkspaceFileV6Error, type WorkspaceFileV6Success } from "./workspaceFileClientV6";

/** Strictly mirror workspace-file-worker.py's read/list success envelopes. */
const REVISION = /^sha256:[a-f0-9]{64}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_DIRECTORY_ENTRIES = 256;

export type WorkspaceFileV6TextRead = Readonly<{
    exists: true;
    revision: string;
    content: string;
    mode: number;
}>;

export type WorkspaceFileV6MissingRead = Readonly<{ exists: false }>;

export type WorkspaceFileV6ReadResult = WorkspaceFileV6TextRead | WorkspaceFileV6MissingRead;

export type WorkspaceFileV6DirectoryEntry = Readonly<{
    name: string;
    kind: "file" | "directory";
    size: number;
}>;

function malformed(): never {
    throw new WorkspaceFileV6Error("INVALID_RESPONSE", 502);
}

/** Worker returns canonical base64 bytes, not a `content` field. Reject invalid UTF-8. */
export function decodeWorkspaceFileV6TextRead(reply: WorkspaceFileV6Success): WorkspaceFileV6TextRead {
    const revision = reply.revision;
    const mode = reply.mode;
    const encoded = reply.data;
    if (reply.ok !== true || typeof revision !== "string" || !REVISION.test(revision) ||
        !Number.isInteger(mode) || (mode as number) < 0 || (mode as number) > 0o777 ||
        typeof encoded !== "string" || encoded.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 + 4 ||
        !BASE64.test(encoded)) {
        return malformed();
    }
    let bytes: Uint8Array;
    try {
        const binary = atob(encoded);
        if (binary.length > MAX_FILE_BYTES || btoa(binary) !== encoded) return malformed();
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        return { exists: true, revision, content, mode: mode as number };
    } catch (error) {
        if (error instanceof WorkspaceFileV6Error) throw error;
        return malformed();
    }
}

/** Directory lists contain names/kinds/sizes only; they are NOT revision snapshots. */
export function decodeWorkspaceFileV6Directory(reply: WorkspaceFileV6Success): WorkspaceFileV6DirectoryEntry[] {
    const entries = reply.entries;
    if (reply.ok !== true || !Array.isArray(entries) || entries.length > MAX_DIRECTORY_ENTRIES) {
        return malformed();
    }
    const seen = new Set<string>();
    const result: WorkspaceFileV6DirectoryEntry[] = [];
    for (const candidate of entries) {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return malformed();
        const { name, kind, size } = candidate as Record<string, unknown>;
        if (typeof name !== "string" || !name || name === "." || name === ".." ||
            name.includes("/") || name.includes("\\") || name.includes("\0") ||
            (kind !== "file" && kind !== "directory") ||
            typeof size !== "number" || !Number.isSafeInteger(size) || size < 0 ||
            seen.has(name)) return malformed();
        seen.add(name);
        result.push({ name, kind, size });
    }
    return result;
}
