import type {
    BatchRunReq,
    BatchRunResult,
} from "@zoeskoul/code-contracts";

export type ExecuteRunnerOptions = {
    actorKey?: string;
    baseUrl?: string;
    sharedSecret?: string;
    edgeSecret?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
};

function clean(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function resolveBaseUrl(options: ExecuteRunnerOptions) {
    const raw =
        clean(options.baseUrl) ||
        clean(process.env.RUNNER_BASE_URL) ||
        clean(process.env.RUNNER_URL);

    if (!raw) throw new Error("Missing RUNNER_BASE_URL");

    const normalized = raw.replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(normalized)) {
        throw new Error(
            `RUNNER_BASE_URL must start with http:// or https://. Got: ${normalized}`,
        );
    }
    return normalized;
}

function resolveSecret(options: ExecuteRunnerOptions) {
    const secret =
        clean(options.sharedSecret) ||
        clean(process.env.RUNNER_SHARED_SECRET);
    if (!secret) throw new Error("Missing RUNNER_SHARED_SECRET");
    return secret;
}

function resolveEdgeSecret(options: ExecuteRunnerOptions) {
    return (
        clean(options.edgeSecret) ||
        clean(process.env.RUNNER_EDGE_SECRET)
    );
}

export class RunnerHttpError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

export function buildRunnerRequestHeaders(
    actorKey: string,
    options: ExecuteRunnerOptions = {},
    json = true,
): Record<string, string> {
    const headers: Record<string, string> = {
        "x-runner-secret": resolveSecret(options),
        "x-actor-key": actorKey,
    };

    const edgeSecret = resolveEdgeSecret(options);
    if (edgeSecret) {
        headers["x-runner-edge-secret"] = edgeSecret;
    }

    if (json) {
        headers["content-type"] = "application/json";
    }

    return headers;
}

function combinedSignal(
    outer: AbortSignal | undefined,
    timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
    const timeout = new AbortController();
    const id = setTimeout(() => timeout.abort(), timeoutMs);

    if (!outer) {
        return { signal: timeout.signal, cleanup: () => clearTimeout(id) };
    }

    const combined = new AbortController();
    const abort = () => {
        if (!combined.signal.aborted) combined.abort();
    };

    outer.addEventListener("abort", abort);
    timeout.signal.addEventListener("abort", abort);
    if (outer.aborted || timeout.signal.aborted) abort();

    return {
        signal: combined.signal,
        cleanup: () => {
            clearTimeout(id);
            outer.removeEventListener("abort", abort);
            timeout.signal.removeEventListener("abort", abort);
        },
    };
}

/**
 * Canonical authenticated HTTP transport for the ZoeSkoul runner service.
 *
 * Both one-shot /runs execution and interactive PTY server routes use this
 * helper so base-URL handling, shared-secret auth, edge auth, errors, and
 * timeouts cannot drift between callers.
 */
export async function runnerPost<T>(
    path: string,
    actorKey: string,
    body?: unknown,
    options: ExecuteRunnerOptions = {},
): Promise<T> {
    const baseUrl = resolveBaseUrl(options);
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const timeout = combinedSignal(
        options.signal,
        Math.max(1_000, options.timeoutMs ?? 70_000),
    );

    try {
        let response: Response;
        try {
            response = await fetch(`${baseUrl}${normalizedPath}`, {
                method: "POST",
                headers: buildRunnerRequestHeaders(
                    actorKey,
                    options,
                    body != null,
                ),
                body: body == null ? undefined : JSON.stringify(body),
                cache: "no-store",
                signal: timeout.signal,
            });
        } catch (error: any) {
            if (error?.name === "AbortError") {
                throw new Error(
                    `Runner request timed out or was canceled for ${normalizedPath}`,
                );
            }

            const cause = error?.cause?.message
                ? `: ${error.cause.message}`
                : "";
            throw new Error(
                `Runner fetch failed for ${normalizedPath}${cause}`,
            );
        }

        const text = await response.text();
        let data: any;

        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            throw new RunnerHttpError(
                response.status,
                `Non-JSON runner response (${response.status}): ${text.slice(0, 300)}`,
            );
        }

        if (!response.ok) {
            throw new RunnerHttpError(
                response.status,
                data?.error ??
                    data?.message ??
                    `Runner error: ${response.status}`,
            );
        }

        return data as T;
    } finally {
        timeout.cleanup();
    }
}

/**
 * The canonical one-shot learner execution helper.
 *
 * Callers must not select Judge0, local Python, node:sqlite, better-sqlite3,
 * Rscript, or another execution engine themselves.
 */
export async function executeRunner(
    request: BatchRunReq,
    options: ExecuteRunnerOptions = {},
): Promise<BatchRunResult> {
    const actorKey =
        clean(options.actorKey) ||
        clean(process.env.RUNNER_ACTOR_KEY) ||
        "system:batch";

    const data = await runnerPost<unknown>(
        "/runs",
        actorKey,
        request,
        options,
    );

    if (
        !data ||
        typeof data !== "object" ||
        ((data as any).kind !== "code" && (data as any).kind !== "sql") ||
        typeof (data as any).ok !== "boolean"
    ) {
        throw new Error("Runner returned an invalid batch result.");
    }

    return data as BatchRunResult;
}

export function createRunnerCodeAdapter(options: ExecuteRunnerOptions = {}) {
    return async (args: {
        language: string;
        code: string;
        entry?: string;
        stdin?: string;
        files?: any;
        limits?: { timeoutMs?: number } & Record<string, unknown>;
    }) => {
        const result = await executeRunner(
            {
                kind: "code",
                language: args.language as any,
                code: args.code,
                ...(args.entry ? { entry: args.entry } : {}),
                ...(args.files ? { files: args.files } : {}),
                ...(args.stdin != null ? { stdin: args.stdin } : {}),
                ...(typeof args.limits?.timeoutMs === "number"
                    ? { wallTimeoutMs: args.limits.timeoutMs }
                    : {}),
            } as BatchRunReq,
            options,
        );

        if (result.kind !== "code") {
            return {
                ok: false,
                status: "Error",
                error: "Runner returned SQL for a code request.",
            };
        }
        return result;
    };
}

export function createRunnerSqlAdapter(options: ExecuteRunnerOptions = {}) {
    return async (args: {
        code: string;
        checkSql?: string;
        dialect: string;
        schemaSql?: string;
        seedSql?: string;
        datasetId?: string;
        limits?: {
            statementTimeoutMs?: number;
            maxRows?: number;
            maxBytes?: number;
        };
    }) =>
        await executeRunner(
            {
                kind: "sql",
                language: "sql",
                dialect: args.dialect,
                code: args.code,
                ...(args.checkSql ? { checkSql: args.checkSql } : {}),
                ...(args.schemaSql ? { schemaSql: args.schemaSql } : {}),
                ...(args.seedSql ? { seedSql: args.seedSql } : {}),
                ...(args.datasetId ? { datasetId: args.datasetId } : {}),
                ...(args.limits ? { limits: args.limits } : {}),
            },
            options,
        );
}
