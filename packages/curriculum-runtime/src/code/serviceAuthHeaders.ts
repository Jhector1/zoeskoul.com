export type ServiceHeaderEnv = Record<string, string | undefined>;

function clean(value: string | undefined): string {
    return String(value ?? "").trim();
}

export function buildJudge0Headers(args?: {
    env?: ServiceHeaderEnv;
    json?: boolean;
}): Record<string, string> {
    const env = args?.env ?? process.env;
    const headers: Record<string, string> = {};

    if (args?.json) {
        headers["Content-Type"] = "application/json";
    }

    const edgeSecret = clean(env.JUDGE0_EDGE_SECRET);

    if (edgeSecret) {
        headers["X-Judge0-Edge-Secret"] = edgeSecret;
        return headers;
    }

    const authHeader = clean(env.JUDGE0_AUTHN_HEADER);
    const authToken = clean(env.JUDGE0_AUTHN_TOKEN);

    if (authHeader && authToken) {
        headers[authHeader] = authToken;
    }

    return headers;
}

export function buildRunnerHeaders(args: {
    actorKey?: string;
    env?: ServiceHeaderEnv;
    json?: boolean;
}): Record<string, string> {
    const env = args.env ?? process.env;
    const headers: Record<string, string> = {};

    if (args.json !== false) {
        headers["content-type"] = "application/json";
    }

    const edgeSecret = clean(env.RUNNER_EDGE_SECRET);
    const sharedSecret = clean(env.RUNNER_SHARED_SECRET);

    if (edgeSecret) {
        headers["x-runner-edge-secret"] = edgeSecret;
    }

    if (!sharedSecret) {
        throw new Error("Missing RUNNER_SHARED_SECRET env var.");
    }

    headers["x-runner-secret"] = sharedSecret;

    const actorKey = clean(args.actorKey);

    if (actorKey) {
        headers["x-actor-key"] = actorKey;
    }

    return headers;
}