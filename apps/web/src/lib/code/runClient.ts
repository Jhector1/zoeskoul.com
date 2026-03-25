import type { RunPollResult, RunReq, RunResult, RunSubmitResult } from "@/lib/code/types";

const POLL_INTERVAL_MS = 250;
const MAX_POLLS = 120;

function sleep(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        const cleanup = () => signal?.removeEventListener("abort", onAbort);

        const id = globalThis.setTimeout(() => {
            cleanup();
            resolve();
        }, ms);

        const onAbort = () => {
            globalThis.clearTimeout(id);
            cleanup();
            reject(new DOMException("Aborted", "AbortError"));
        };

        signal?.addEventListener("abort", onAbort);
    });
}

async function parseJsonResponse<T>(
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

export async function runViaApi(req: RunReq, signal?: AbortSignal): Promise<RunResult> {
    try {
        const submitRes = await fetch("/api/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(req),
            signal,
        });

        const submitParsed = await parseJsonResponse<RunSubmitResult>(
            submitRes,
            "Non-JSON submit response",
        );

        if (!submitParsed.ok) {
            return {
                ok: false,
                status: "Error",
                error: submitParsed.error,
            };
        }

        const submitData = submitParsed.data;

        if (!submitData.ok) {
            return {
                ok: false,
                status: "Error",
                error: submitData.error,
            };
        }

        if (submitData.mode === "immediate") {
            return submitData.result;
        }

        for (let i = 0; i < MAX_POLLS; i++) {
            const pollRes = await fetch(`/api/run/${encodeURIComponent(submitData.token)}`, {
                method: "GET",
                signal,
            });

            const pollParsed = await parseJsonResponse<RunPollResult>(
                pollRes,
                "Non-JSON poll response",
            );

            if (!pollParsed.ok) {
                return {
                    ok: false,
                    status: "Error",
                    error: pollParsed.error,
                };
            }

            const pollData = pollParsed.data;

            if (pollData.done) return pollData;

            await sleep(POLL_INTERVAL_MS, signal);
        }

        return {
            ok: false,
            status: "Timeout",
            error: "Execution timed out while waiting for Judge0.",
        };
    } catch (e: any) {
        if (e?.name === "AbortError") {
            return {
                ok: false,
                status: "Canceled",
                error: "Run canceled by user.",
            };
        }

        return {
            ok: false,
            status: "Error",
            error: e?.message ?? "Run failed.",
        };
    }
}