"use client";

import { WorkspaceFileV6Error, type WorkspaceFileV6Success } from "./workspaceFileClientV6";

const REVISION = /^sha256:[a-f0-9]{64}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MAX_BINARY_BYTES = 5 * 1024 * 1024;

/** A binary read never decodes bytes as UTF-8 or silently replaces characters. */
export type WorkspaceFileV6BinaryRead = Readonly<{
    exists: true;
    revision: string;
    data: string;
    sizeBytes: number;
    mode: number;
}>;
export type WorkspaceFileV6BinaryReadResult =
    | WorkspaceFileV6BinaryRead
    | Readonly<{ exists: false }>;

/**
 * Canonical base64 and exact length are required. In particular, never accept
 * a truncated or corrupted local image and then persist it into a sandbox.
 */
export function assertWorkspaceFileV6BinaryData(data: string, expectedSize?: number): number {
    if (typeof data !== "string" || data.length > Math.ceil(MAX_BINARY_BYTES / 3) * 4 + 4 || !BASE64.test(data)) {
        throw new WorkspaceFileV6Error("INVALID_DATA", 400);
    }
    if (expectedSize !== undefined && (!Number.isSafeInteger(expectedSize) || expectedSize < 0 || expectedSize > MAX_BINARY_BYTES)) {
        throw new WorkspaceFileV6Error("INVALID_DATA", 400);
    }
    try {
        const bytes = atob(data);
        if (bytes.length > MAX_BINARY_BYTES || btoa(bytes) !== data ||
            (expectedSize !== undefined && bytes.length !== expectedSize)) {
            throw new WorkspaceFileV6Error("INVALID_DATA", 400);
        }
        return bytes.length;
    } catch (error) {
        if (error instanceof WorkspaceFileV6Error) throw error;
        throw new WorkspaceFileV6Error("INVALID_DATA", 400);
    }
}

/** Worker read envelope is {ok, revision, mode, data}, not MIME metadata. */
export function decodeWorkspaceFileV6BinaryRead(reply: WorkspaceFileV6Success): WorkspaceFileV6BinaryRead {
    if (reply.ok !== true || typeof reply.revision !== "string" || !REVISION.test(reply.revision) ||
        !Number.isInteger(reply.mode) || (reply.mode as number) < 0 || (reply.mode as number) > 0o777 ||
        typeof reply.data !== "string") {
        throw new WorkspaceFileV6Error("INVALID_RESPONSE", 502);
    }
    let sizeBytes: number;
    try {
        sizeBytes = assertWorkspaceFileV6BinaryData(reply.data);
    } catch {
        throw new WorkspaceFileV6Error("INVALID_RESPONSE", 502);
    }
    return { exists: true, revision: reply.revision, mode: reply.mode as number, data: reply.data, sizeBytes };
}
