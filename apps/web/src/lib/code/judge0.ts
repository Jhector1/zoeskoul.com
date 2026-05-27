import type {
    RunPollResult,
    RunSubmitResult,
    WorkspaceSyncEntry,
} from "./types";

const SNAPSHOT_RE =
    /\r?\n?__ZOE_WORKSPACE_SNAPSHOT_B64__([A-Za-z0-9+/=]+)__END_ZOE_WORKSPACE_SNAPSHOT_B64__\r?\n?/g;

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
    const path = String(entry?.path ?? "")
        .replace(/\\/g, "/")
        .trim();

    if (!path) return null;
    if (path.startsWith("/") || path.includes("\0")) return null;

    const parts = path.split("/");

    if (
        parts.some(
            (part) =>
                !part ||
                part === "." ||
                part === ".." ||
                part.includes("\0"),
        )
    ) {
        return null;
    }

    if (entry?.kind === "directory") {
        return {
            kind: "directory",
            path: parts.join("/"),
        };
    }

    return {
        kind: "file",
        path: parts.join("/"),
        content: String(entry?.content ?? ""),
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

        const workspaceFiles = parsed
            .map(normalizeSnapshotEntry)
            .filter((entry): entry is WorkspaceSyncEntry => Boolean(entry));

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    const text = await res.text();
    let data: any;

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
    const res = await fetch(url, { method: "GET" });
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