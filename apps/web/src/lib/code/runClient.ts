import type { RunPollResult, RunReq, RunResult, RunSubmitResult } from "@/lib/code/types";

const POLL_INTERVAL_MS = 250;
const MAX_POLLS = 120;
const REQUEST_TIMEOUT_MS = 15000;

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

function anySignal(signals: (AbortSignal | undefined)[]) {
    const ctrl = new AbortController();

    const onAbort = () => {
        if (!ctrl.signal.aborted) {
            ctrl.abort();
        }
        cleanup();
    };

    const cleanup = () => {
        for (const s of signals) {
            s?.removeEventListener("abort", onAbort);
        }
    };

    for (const s of signals) {
        if (!s) continue;
        if (s.aborted) {
            ctrl.abort();
            return ctrl.signal;
        }
        s.addEventListener("abort", onAbort);
    }

    return ctrl.signal;
}

async function fetchWithTimeout(
    input: RequestInfo | URL,
    init: RequestInit = {},
    timeoutMs = REQUEST_TIMEOUT_MS,
    outerSignal?: AbortSignal,
): Promise<Response> {
    const timeoutCtrl = new AbortController();
    const timeoutId = globalThis.setTimeout(() => timeoutCtrl.abort(), timeoutMs);

    try {
        return await fetch(input, {
            ...init,
            signal: anySignal([outerSignal, init.signal as AbortSignal | undefined, timeoutCtrl.signal]),
            cache: "no-store",
        });
    } finally {
        globalThis.clearTimeout(timeoutId);
    }
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
        const submitRes = await fetchWithTimeout(
            "/api/run/judge0",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(req),
            },
            REQUEST_TIMEOUT_MS,
            signal,
        );

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
            const pollRes = await fetchWithTimeout(
                `/api/run/judge0/${encodeURIComponent(submitData.token)}`,
                {
                    method: "GET",
                },
                REQUEST_TIMEOUT_MS,
                signal,
            );

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
