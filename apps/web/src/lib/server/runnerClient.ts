import { buildRunnerHeaders } from "@zoeskoul/curriculum-runtime";

const RUNNER_BASE_URL = process.env.RUNNER_BASE_URL!;

export class RunnerHttpError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

export async function runnerPost<T>(
    path: string,
    actorKey: string,
    body?: unknown,
): Promise<T> {
    const res = await fetch(`${RUNNER_BASE_URL}${path}`, {
        method: "POST",
        headers: buildRunnerHeaders({ actorKey }),
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