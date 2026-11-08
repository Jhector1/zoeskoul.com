"use client";

import { assertWorkspaceRelativePath } from "@zoeskoul/code-contracts";

/**
 * Browser-only, opt-in transport for the existing V6 Learning file proxy.
 * This is NOT a replacement for the V5 workspace controller. The caller owns
 * coordination with existing editor/terminal synchronization and conflict UI.
 * No Runner credentials or privileged service identity enter the browser.
 */
export type WorkspaceFileV6Operation =
    | Readonly<{ op: "list"; path: string }>
    | Readonly<{ op: "read"; path: string }>
    | Readonly<{ op: "inspect"; path: string }>
    | Readonly<{ op: "list_trash"; path: "" }>
    | Readonly<{ op: "trash_directory"; path: string; expectedRevision: string }>
    | Readonly<{ op: "restore_directory"; path: string; trashId: string; expectedRevision: null }>
    | Readonly<{
          op: "move_directory";
          path: string;
          destinationPath: string;
          /** SHA returned by `inspect`; never null for a nonempty folder. */
          expectedRevision: string;
      }>
    | Readonly<{ op: "mkdir"; path: string }>
    | Readonly<{ op: "rmdir"; path: string; expectedRevision: null }>
    | Readonly<{
          op: "move";
          path: string;
          destinationPath: string;
          /** SHA of last file read; null only for empty directory. */
          expectedRevision: string | null;
      }>
    | Readonly<{
          op: "write";
          path: string;
          /** null means the file must not exist; otherwise SHA-256 of last read. */
          expectedRevision: string | null;
          /** Canonical base64, not raw UTF-8. */
          data: string;
      }>
    | Readonly<{
          op: "delete";
          path: string;
          expectedRevision: string | null;
      }>;

export type WorkspaceFileV6Success = Readonly<{
    ok: true;
    [field: string]: unknown;
}>;

export class WorkspaceFileV6Error extends Error {
    constructor(
        public readonly code: string,
        public readonly status: number,
    ) {
        super(`Workspace file operation failed (${code}).`);
        this.name = "WorkspaceFileV6Error";
    }
}

export function isWorkspaceFileV6Conflict(error: unknown): error is WorkspaceFileV6Error {
    return error instanceof WorkspaceFileV6Error && error.code === "CONFLICT";
}

const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;
const REVISION = /^sha256:[a-f0-9]{64}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Encode Unicode safely; btoa(text) is not valid for non-ASCII user files. */
export function encodeWorkspaceFileV6Text(content: string): string {
    const bytes = new TextEncoder().encode(content);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    return btoa(binary);
}

function validateOperation(operation: WorkspaceFileV6Operation): WorkspaceFileV6Operation {
    if (!operation || typeof operation !== "object") {
        throw new WorkspaceFileV6Error("INVALID_REQUEST", 400);
    }
    const { op } = operation;
    if (op !== "list" && op !== "read" && op !== "write" &&
        op !== "delete" && op !== "mkdir" && op !== "move" && op !== "rmdir" && op !== "inspect" && op !== "move_directory" && op !== "trash_directory" && op !== "list_trash" && op !== "restore_directory") {
        throw new WorkspaceFileV6Error("INVALID_REQUEST", 400);
    }
    let path: string;
    try {
        path = (op === "list" || op === "list_trash") && operation.path === ""
            ? ""
            : assertWorkspaceRelativePath(operation.path);
    } catch {
        throw new WorkspaceFileV6Error("INVALID_PATH", 400);
    }
    if (op === "list_trash") {
        if (path !== "") throw new WorkspaceFileV6Error("INVALID_PATH", 400);
        return { op, path: "" };
    }
    if (op === "write" || op === "delete" || op === "move" || op === "rmdir" || op === "move_directory" || op === "trash_directory" || op === "restore_directory") {
        if (operation.expectedRevision !== null &&
            (typeof operation.expectedRevision !== "string" ||
                !REVISION.test(operation.expectedRevision))) {
            throw new WorkspaceFileV6Error("INVALID_REVISION", 400);
        }
        if (op === "trash_directory") {
            if (operation.expectedRevision === null) {
                throw new WorkspaceFileV6Error("PRECONDITION_REQUIRED", 428);
            }
            return { op, path, expectedRevision: operation.expectedRevision };
        }
        if (op === "restore_directory") {
            if (operation.expectedRevision !== null || !/^[a-f0-9]{32}$/.test(operation.trashId)) {
                throw new WorkspaceFileV6Error("INVALID_REQUEST", 400);
            }
            return { op, path, trashId: operation.trashId, expectedRevision: null };
        }
        if (op === "rmdir") {
            if (operation.expectedRevision !== null) {
                throw new WorkspaceFileV6Error("INVALID_REVISION", 400);
            }
            return { op, path, expectedRevision: null };
        }
        if (op === "move" || op === "move_directory") {
            let destinationPath: string;
            try {
                destinationPath = assertWorkspaceRelativePath(operation.destinationPath);
            } catch {
                throw new WorkspaceFileV6Error("INVALID_PATH", 400);
            }
            if (path === destinationPath) throw new WorkspaceFileV6Error("INVALID_PATH", 400);
            if (op === "move_directory") {
                const expectedRevision = operation.expectedRevision;
                if (expectedRevision === null) {
                    throw new WorkspaceFileV6Error("PRECONDITION_REQUIRED", 428);
                }
                return { op, path, destinationPath, expectedRevision };
            }
            return { op, path, destinationPath, expectedRevision: operation.expectedRevision };
        }
        if (op === "write") {
            if (typeof operation.data !== "string" || !BASE64.test(operation.data)) {
                throw new WorkspaceFileV6Error("INVALID_DATA", 400);
            }
            return { op, path, expectedRevision: operation.expectedRevision, data: operation.data };
        }
        return { op, path, expectedRevision: operation.expectedRevision };
    }
    return { op, path };
}

/**
 * Always sends cookie-authenticated requests to the existing same-origin Web
 * proxy. The server independently verifies origin, actor and Runner ownership.
 * Intentionally no fallback to V5 when this endpoint is disabled or rejects a
 * request: a silent fallback could bypass revision checks and lose edits.
 */
export async function requestWorkspaceFileV6(
    sessionId: string,
    operation: WorkspaceFileV6Operation,
    options: Readonly<{ signal?: AbortSignal; fetchImpl?: typeof fetch }> = {},
): Promise<WorkspaceFileV6Success> {
    if (!SESSION_ID.test(sessionId)) {
        throw new WorkspaceFileV6Error("INVALID_SESSION", 400);
    }
    const request = validateOperation(operation);
    const api = options.fetchImpl ?? fetch;
    let response: Response;
    try {
        response = await api(
            `/api/run/pty/sessions/${encodeURIComponent(sessionId)}/files/operation`,
            {
                method: "POST",
                credentials: "same-origin",
                cache: "no-store",
                redirect: "error",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(request),
                signal: options.signal,
            },
        );
    } catch (error) {
        if (options.signal?.aborted) throw error;
        throw new WorkspaceFileV6Error("NETWORK_UNAVAILABLE", 0);
    }

    const reply: unknown = await response.json().catch(() => null);
    if (!reply || typeof reply !== "object" || Array.isArray(reply) ||
        typeof (reply as { ok?: unknown }).ok !== "boolean") {
        throw new WorkspaceFileV6Error("INVALID_RESPONSE", 502);
    }
    if (!response.ok || (reply as { ok: boolean }).ok !== true) {
        const rawCode = (reply as { code?: unknown }).code;
        const code = typeof rawCode === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(rawCode)
            ? rawCode
            : "REQUEST_REJECTED";
        throw new WorkspaceFileV6Error(code, response.status);
    }
    return reply as WorkspaceFileV6Success;
}
