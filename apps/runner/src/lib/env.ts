// apps/runner/src/lib/env.ts
import { z } from "zod";

const envSchema = z.object({
    PORT: z.coerce.number().int().positive().default(4001),

    RUNNER_IMAGE: z.string().min(1).default("zoeskoul-runtime:latest"),

    DOCKER_SOCKET: z.string().min(1).default("/var/run/docker.sock"),
    DOCKER_HOST: z.string().optional(),

    RUN_WALL_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
    RUN_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),

    /**
     * How long a completed/canceled run workspace stays available
     * for snapshot after process exit.
     */
    RUNNER_WORKSPACE_TTL_MS: z.coerce
        .number()
        .int()
        .positive()
        .default(10 * 60 * 1000),

    RUNNER_SHARED_SECRET: z.string().min(1),

    RUNNER_EXEC_UID: z.coerce.number().int().nonnegative().default(1000),
    RUNNER_EXEC_GID: z.coerce.number().int().nonnegative().default(1000),

    RUNNER_MAX_FILES: z.coerce.number().int().positive().default(32),
    RUNNER_MAX_TOTAL_BYTES: z.coerce.number().int().positive().default(262144),
    RUNNER_MAX_CONCURRENT_PER_ACTOR: z.coerce.number().int().positive().default(3),

    ALLOWED_WEB_ORIGINS: z.string().optional(),
    WEB_URL: z.string().optional(),
    RUNNER_WORKSPACE_ROOT: z.string().min(1).default("/workspaces"),
});

const parsed = envSchema.parse(process.env);

export const env = {
    port: parsed.PORT,
    runnerImage: parsed.RUNNER_IMAGE,

    dockerSocket: parsed.DOCKER_SOCKET,
    dockerHost: parsed.DOCKER_HOST ?? "",

    wallTimeoutMsDefault: parsed.RUN_WALL_TIMEOUT_MS,
    idleTimeoutMsDefault: parsed.RUN_IDLE_TIMEOUT_MS,
    workspaceTtlMs: parsed.RUNNER_WORKSPACE_TTL_MS,

    runnerSharedSecret: parsed.RUNNER_SHARED_SECRET,

    execUid: parsed.RUNNER_EXEC_UID,
    execGid: parsed.RUNNER_EXEC_GID,

    maxFiles: parsed.RUNNER_MAX_FILES,
    maxTotalBytes: parsed.RUNNER_MAX_TOTAL_BYTES,
    maxConcurrentPerActor: parsed.RUNNER_MAX_CONCURRENT_PER_ACTOR,

    allowedWebOriginsRaw: parsed.ALLOWED_WEB_ORIGINS,
    webUrl: parsed.WEB_URL,
    workspaceRoot: parsed.RUNNER_WORKSPACE_ROOT,
} as const;