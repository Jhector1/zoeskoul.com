const RUNNER_BASE_URL = process.env.RUNNER_BASE_URL!;
const RUNNER_SHARED_SECRET = process.env.RUNNER_SHARED_SECRET!;

export class RunnerHttpError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

function runnerHeaders(actorKey: string) {
    return {
        "content-type": "application/json",
        "x-runner-secret": RUNNER_SHARED_SECRET,
        "x-actor-key": actorKey,
    };
}

export async function runnerPost<T>(
    path: string,
    actorKey: string,
    body?: unknown,
): Promise<T> {
    const res = await fetch(`${RUNNER_BASE_URL}${path}`, {
        method: "POST",
        headers: runnerHeaders(actorKey),
        body: body == null ? undefined : JSON.stringify(body),
        cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        throw new RunnerHttpError(
            res.status,
            (data as any)?.error ?? `Runner error: ${res.status}`,
        );
    }

    return data as T;
}