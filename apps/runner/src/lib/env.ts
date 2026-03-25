import { z } from "zod";

const envSchema = z.object({
    PORT: z.coerce.number().int().positive().default(4001),
    RUNNER_IMAGE: z.string().min(1).default("zoeskoul-runtime:latest"),
    DOCKER_SOCKET: z.string().min(1).default("/var/run/docker.sock"),
    RUN_WALL_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
    RUN_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
    APP_URL: z.url().optional(),
    WEB_URL: z.url().optional(),
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
} as const;