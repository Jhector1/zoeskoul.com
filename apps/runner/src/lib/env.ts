import { z } from "zod";

const envSchema = z.object({
    PORT: z.coerce.number().int().positive().default(4001),
    RUNNER_IMAGE: z.string().min(1).default("zoeskoul-runtime:latest"),
    DOCKER_SOCKET: z.string().min(1).default("/var/run/docker.sock"),
    RUN_WALL_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
    RUN_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
    APP_URL: z.string().url().optional(),
    WEB_URL: z.string().url().optional(),
    ALLOWED_WEB_ORIGINS: z.string().optional(),
    RUNNER_EXEC_UID: z.coerce.number().int().nonnegative().default(1000),
    RUNNER_EXEC_GID: z.coerce.number().int().nonnegative().default(1000),
});

const parsed = envSchema.parse(process.env);

export const env = {
    port: parsed.PORT,
    runnerImage: parsed.RUNNER_IMAGE,
    dockerSocket: parsed.DOCKER_SOCKET,
    wallTimeoutMsDefault: parsed.RUN_WALL_TIMEOUT_MS,
    idleTimeoutMsDefault: parsed.RUN_IDLE_TIMEOUT_MS,
    appUrl: parsed.APP_URL,
    webUrl: parsed.WEB_URL,
    allowedWebOriginsRaw: parsed.ALLOWED_WEB_ORIGINS,
    execUid: parsed.RUNNER_EXEC_UID,
    execGid: parsed.RUNNER_EXEC_GID,
} as const;