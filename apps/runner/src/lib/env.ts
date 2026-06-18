// apps/runner/src/lib/env.ts
import { z } from "zod";

const intEnv = (defaultValue: number) =>
  z.coerce.number().int().positive().default(defaultValue);

const boolFlag = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (value == null || value === "") return defaultValue;
    if (value === true || value === "true" || value === "1") return true;
    if (value === false || value === "false" || value === "0") return false;
    return value;
  }, z.boolean());

const envSchema = z.object({
  PORT: intEnv(4001),

  RUNNER_IMAGE: z.string().min(1).default("zoeskoul-runtime:latest"),

  DOCKER_SOCKET: z.string().min(1).default("/var/run/docker.sock"),
  DOCKER_HOST: z.string().optional(),

  RUN_WALL_TIMEOUT_MS: intEnv(15000),
  RUN_IDLE_TIMEOUT_MS: intEnv(20000),

  /**
   * How long a completed/canceled run workspace stays available
   * for snapshot after process exit.
   */
  RUNNER_WORKSPACE_TTL_MS: intEnv(10 * 60 * 1000),

  RUNNER_SHARED_SECRET: z.string().min(32),

  RUNNER_EXEC_UID: z.coerce.number().int().nonnegative().default(1000),
  RUNNER_EXEC_GID: z.coerce.number().int().nonnegative().default(1000),

  RUNNER_MAX_FILES: intEnv(32),
  RUNNER_MAX_TOTAL_BYTES: intEnv(262144),
  RUNNER_MAX_FILE_BYTES: intEnv(65536),
  RUNNER_MAX_ENTRIES: intEnv(200),
  RUNNER_MAX_CONCURRENT_PER_ACTOR: z.coerce.number().int().positive().optional(),
  MAX_ACTIVE_SESSIONS_PER_USER: intEnv(4),
  RUNNER_MAX_CONCURRENT_GLOBAL: intEnv(40),
  RUNNER_STARTS_PER_MINUTE_PER_ACTOR: intEnv(60),

  RUNNER_CHILD_NETWORK: z.string().min(1).default("none"),
  RUNNER_DISABLE_NETWORK: boolFlag(true),
  RUNNER_MEMORY_LIMIT_MB: intEnv(128),
  RUNNER_CPU_QUOTA: intEnv(50000),
  RUNNER_PIDS_LIMIT: intEnv(128),

  RUNNER_MIN_FREE_BYTES: intEnv(1024 * 1024 * 1024),
  RUNNER_MAX_WORKSPACE_ROOT_BYTES: intEnv(5 * 1024 * 1024 * 1024),

  PTY_ATTACH_TOKEN_TTL_SECONDS: intEnv(60),
  PTY_ATTACH_REPLAY_TTL_MS: intEnv(5 * 60 * 1000),
  PTY_IDLE_TIMEOUT_MS: intEnv(15 * 60 * 1000),
  PTY_MAX_LIFETIME_MS: intEnv(2 * 60 * 60 * 1000),
  PTY_CLEANUP_INTERVAL_MS: intEnv(60 * 1000),

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
  maxFileBytes: parsed.RUNNER_MAX_FILE_BYTES,
  maxEntries: parsed.RUNNER_MAX_ENTRIES,
  maxConcurrentPerActor:
    parsed.RUNNER_MAX_CONCURRENT_PER_ACTOR ??
    parsed.MAX_ACTIVE_SESSIONS_PER_USER,
  maxConcurrentGlobal: parsed.RUNNER_MAX_CONCURRENT_GLOBAL,
  startsPerMinutePerActor: parsed.RUNNER_STARTS_PER_MINUTE_PER_ACTOR,

  childNetwork: parsed.RUNNER_DISABLE_NETWORK
    ? "none"
    : parsed.RUNNER_CHILD_NETWORK,
  disableNetwork: parsed.RUNNER_DISABLE_NETWORK,
  memoryLimitBytes: parsed.RUNNER_MEMORY_LIMIT_MB * 1024 * 1024,
  cpuQuota: parsed.RUNNER_CPU_QUOTA,
  pidsLimit: parsed.RUNNER_PIDS_LIMIT,

  minFreeBytes: parsed.RUNNER_MIN_FREE_BYTES,
  maxWorkspaceRootBytes: parsed.RUNNER_MAX_WORKSPACE_ROOT_BYTES,

  attachTokenTtlSeconds: parsed.PTY_ATTACH_TOKEN_TTL_SECONDS,
  attachReplayTtlMs: parsed.PTY_ATTACH_REPLAY_TTL_MS,
  ptyIdleTimeoutMs: parsed.PTY_IDLE_TIMEOUT_MS,
  ptyMaxLifetimeMs: parsed.PTY_MAX_LIFETIME_MS,
  ptyCleanupIntervalMs: parsed.PTY_CLEANUP_INTERVAL_MS,

  allowedWebOriginsRaw: parsed.ALLOWED_WEB_ORIGINS,
  webUrl: parsed.WEB_URL,
  workspaceRoot: parsed.RUNNER_WORKSPACE_ROOT,
} as const;
