// src/components/ide/fullide/runtime/startInteractiveProjectRun.ts
"use client";

import type {
    InteractiveRunReq,
    StartSessionResult,
} from "@/lib/code/types/session";

async function parseJsonSafe<T>(
    res: Response,
    fallbackPrefix: string,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
    const text = await res.text();

    try {
        return {
            ok: true,
            data: JSON.parse(text) as T,
        };
    } catch {
        return {
            ok: false,
            error: `${fallbackPrefix} (${res.status}): ${text.slice(0, 300)}`,
        };
    }
}

export async function startInteractiveProjectRun(
    req: InteractiveRunReq,
    signal?: AbortSignal,
): Promise<StartSessionResult> {
    try {
        const res = await fetch("/api/run/sessions/start", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(req),
            signal,
        });

        const parsed = await parseJsonSafe<StartSessionResult>(
            res,
            "Non-JSON interactive session response",
        );

        if (!parsed.ok) {
            return {
                ok: false,
                error: parsed.error,
            };
        }

        const data = parsed.data;

        if (!res.ok || !data.ok) {
            return {
                ok: false,
                error:
                    data.ok === false
                        ? data.error
                        : `Interactive session start failed (${res.status})`,
            };
        }

        return data;
    } catch (e: any) {
        if (e?.name === "AbortError") {
            return {
                ok: false,
                error: "Interactive run canceled by user.",
            };
        }

        return {
            ok: false,
            error: e?.message ?? "Failed to start interactive run.",
        };
    }
}