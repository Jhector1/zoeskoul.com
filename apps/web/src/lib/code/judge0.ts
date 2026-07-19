import crypto from "node:crypto";
import type {
    RunPollResult,
    RunSubmitResult,
    WorkspaceSyncEntry,
} from "./types";
import { buildJudge0Headers } from "@zoeskoul/curriculum-runtime";
import {
    assertWorkspaceRelativePath,
    normalizeWorkspaceBase64,
    resolveWorkspaceFileCapability,
    workspaceBase64DecodedByteLength,
} from "@zoeskoul/code-contracts";
const SNAPSHOT_RE =
    /\r?\n?__ZOE_WORKSPACE_SNAPSHOT_B64__([A-Za-z0-9+/=]+)__END_ZOE_WORKSPACE_SNAPSHOT_B64__\r?\n?/g;
const MAX_SNAPSHOT_ENTRIES = 400;
const MAX_SNAPSHOT_TEXT_FILE_BYTES = 256 * 1024;
const MAX_SNAPSHOT_BINARY_FILE_BYTES = 5 * 1024 * 1024;
const MAX_SNAPSHOT_TEXT_TOTAL_BYTES = 5 * 1024 * 1024;
const MAX_SNAPSHOT_BINARY_TOTAL_BYTES = 8 * 1024 * 1024;

function fromB64(s: unknown): string | null {
    if (s == null) return null;
    if (typeof s !== "string") return String(s);

    try {
        return Buffer.from(s, "base64").toString("utf8");
    } catch {
        return s;
    }
}

function makeError(status: number, text: string, fallback: string) {
    try {
        const data = JSON.parse(text);
        return data?.error ?? data?.message ?? `${fallback} (${status})`;
    } catch {
        return `${fallback} (${status}): ${text.slice(0, 300)}`;
    }
}

function normalizeSnapshotEntry(entry: any): WorkspaceSyncEntry | null {
    let path: string;
    try {
        path = assertWorkspaceRelativePath(entry?.path ?? "");
    } catch {
        return null;
    }

    if (entry?.kind === "directory") {
        return {
            kind: "directory",
            path,
        };
    }

    const capability = resolveWorkspaceFileCapability(path);
    if (!capability) return null;

    if (entry?.encoding === "base64") {
        if (capability.storage !== "binary") return null;

        const data = normalizeWorkspaceBase64(entry?.data);
        const decodedSize = workspaceBase64DecodedByteLength(entry?.data);
        const sizeBytes = Number(entry?.sizeBytes);
        if (
            data == null ||
            decodedSize == null ||
            !Number.isInteger(sizeBytes) ||
            sizeBytes < 0 ||
            sizeBytes !== decodedSize ||
            sizeBytes > MAX_SNAPSHOT_BINARY_FILE_BYTES
        ) {
            return null;
        }

        const bytes = Buffer.from(data, "base64");
        if (
            bytes.byteLength !== sizeBytes ||
            bytes.toString("base64") !== data
        ) {
            return null;
        }

        const checksum =
            typeof entry?.checksum === "string" && entry.checksum.trim()
                ? entry.checksum.trim().toLowerCase()
                : undefined;
        if (checksum && !/^sha256:[a-f0-9]{64}$/.test(checksum)) return null;

        const actualChecksum = `sha256:${crypto
            .createHash("sha256")
            .update(bytes)
            .digest("hex")}`;
        if (checksum && checksum !== actualChecksum) return null;

        return {
            kind: "file",
            path,
            encoding: "base64",
            data,
            mimeType: capability.mimeType,
            sizeBytes,
            checksum: checksum ?? actualChecksum,
        };
    }

    if (capability.storage !== "text") return null;

    const content = String(entry?.content ?? "");
    if (Buffer.byteLength(content, "utf8") > MAX_SNAPSHOT_TEXT_FILE_BYTES) {
        return null;
    }

    return {
        kind: "file",
        path,
        content,
    };
}

function parseWorkspaceSnapshot(stdout: string | null | undefined): {
    stdout: string | null;
    workspaceFiles?: WorkspaceSyncEntry[];
} {
    if (!stdout) {
        return { stdout: stdout ?? null };
    }

    let match: RegExpExecArray | null = null;
    let last: RegExpExecArray | null = null;

    SNAPSHOT_RE.lastIndex = 0;

    while ((match = SNAPSHOT_RE.exec(stdout))) {
        last = match;
    }

    if (!last) {
        return { stdout };
    }

    const cleaned = stdout.replace(SNAPSHOT_RE, "");

    try {
        const decoded = Buffer.from(last[1] ?? "", "base64").toString("utf8");
        const parsed = JSON.parse(decoded);

        if (!Array.isArray(parsed)) {
            return { stdout: cleaned };
        }

        if (parsed.length > MAX_SNAPSHOT_ENTRIES) {
            return { stdout: cleaned };
        }

        const workspaceFiles: WorkspaceSyncEntry[] = [];
        let textBytes = 0;
        let binaryBytes = 0;

        for (const rawEntry of parsed) {
            const entry = normalizeSnapshotEntry(rawEntry);
            if (!entry) continue;

            if (entry.kind !== "directory" && entry.encoding === "base64") {
                binaryBytes += entry.sizeBytes;
                if (binaryBytes > MAX_SNAPSHOT_BINARY_TOTAL_BYTES) {
                    return { stdout: cleaned };
                }
            } else if (entry.kind !== "directory") {
                textBytes += Buffer.byteLength(entry.content, "utf8");
                if (textBytes > MAX_SNAPSHOT_TEXT_TOTAL_BYTES) {
                    return { stdout: cleaned };
                }
            }

            workspaceFiles.push(entry);
        }

        return {
            stdout: cleaned,
            workspaceFiles,
        };
    } catch {
        return { stdout: cleaned };
    }
}

export async function createJudge0Submission(
    url: string,
    body: unknown,
): Promise<RunSubmitResult> {
    const res = await fetch(url, {
        method: "POST",
        headers: buildJudge0Headers({ json: true }),
        body: JSON.stringify(body),
    });

    const text = await res.text();
    let data: any;
    if (process.env.NODE_ENV !== "production") {
        console.log("[judge0 submit env]", {
            url,
            judge0Url: process.env.JUDGE0_URL,
            hasEdgeSecret: Boolean(process.env.JUDGE0_EDGE_SECRET),
            edgeSecretLength: process.env.JUDGE0_EDGE_SECRET?.length ?? 0,
        });
    }
    try {
        data = JSON.parse(text);
    } catch {
        return {
            ok: false,
            error: `Non-JSON response (${res.status}): ${text.slice(0, 300)}`,
        };
    }

    if (!res.ok || !data?.token) {
        return {
            ok: false,
            error:
                data?.error ??
                data?.message ??
                `Judge0 submission failed (${res.status})`,
        };
    }

    return {
        ok: true,
        mode: "queued",
        token: String(data.token),
    };
}

export async function getJudge0Submission(url: string): Promise<RunPollResult> {
    const res = await fetch(url, {
        method: "GET",
        headers: buildJudge0Headers(),
    });
    const text = await res.text();

    if (!res.ok) {
        return {
            ok: false,
            done: true,
            status: "Error",
            error: makeError(res.status, text, "Judge0 poll failed"),
        };
    }

    let data: any;

    try {
        data = JSON.parse(text);
    } catch {
        return {
            ok: false,
            done: true,
            status: "Error",
            error: `Non-JSON response (${res.status}): ${text.slice(0, 300)}`,
        };
    }

    const statusId = Number(data?.status?.id ?? 0);
    const accepted = statusId === 3;
    const done = ![1, 2].includes(statusId);

    const parsedStdout = parseWorkspaceSnapshot(fromB64(data?.stdout));

    return {
        ok: accepted,
        done,
        token: data?.token ? String(data.token) : undefined,
        statusId,
        status:
            data?.status?.description ??
            (accepted ? "Accepted" : "Not Accepted"),
        stdout: parsedStdout.stdout,
        stderr: fromB64(data?.stderr),
        compile_output: fromB64(data?.compile_output),
        message: fromB64(data?.message),
        time: data?.time ?? null,
        memory: data?.memory ?? null,
        error: data?.error ?? undefined,
        ...(parsedStdout.workspaceFiles
            ? { workspaceFiles: parsedStdout.workspaceFiles }
            : {}),
    };
}