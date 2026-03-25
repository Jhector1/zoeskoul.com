import type { RunPollResult, RunSubmitResult } from "./types";

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
            error: data?.error ?? data?.message ?? `Judge0 submission failed (${res.status})`,
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

    return {
        ok: accepted,
        done,
        token: data?.token ? String(data.token) : undefined,
        statusId,
        status: data?.status?.description ?? (accepted ? "Accepted" : "Not Accepted"),
        stdout: fromB64(data?.stdout),
        stderr: fromB64(data?.stderr),
        compile_output: fromB64(data?.compile_output),
        message: fromB64(data?.message),
        time: data?.time ?? null,
        memory: data?.memory ?? null,
        error: data?.error ?? undefined,
    };
}