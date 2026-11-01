import type { RequestHandler } from "express";

export type RunnerExecutionPool = "zoeskoul-learning" | "zoebuild";

export function isExecutionPoolPathAllowed(
  pool: RunnerExecutionPool,
  method: string,
  pathname: string,
): boolean {
  const path = pathname.toLowerCase();
  if (path === "/health" || path === "/healthz" || path === "/metrics") {
    return method.toUpperCase() === "GET" || method.toUpperCase() === "HEAD";
  }
  if (pool === "zoebuild") {
    return path.startsWith("/build/");
  }
  return path.startsWith("/sessions/");
}

const configuredPool = process.env.RUNNER_EXECUTION_POOL;
if (
  process.env.NODE_ENV === "production" &&
  configuredPool !== "zoebuild" &&
  configuredPool !== "zoeskoul-learning"
) {
  throw new Error("RUNNER_EXECUTION_POOL must identify a dedicated runner pool");
}

export const executionPoolGuard: RequestHandler = (req, res, next) => {
  // Test/dev processes may load app.ts without the deployment's pool identity.
  // Production requires explicit identity at module initialization above.
  if (!configuredPool && process.env.NODE_ENV !== "production") {
    next();
    return;
  }
  if (
    (configuredPool === "zoebuild" || configuredPool === "zoeskoul-learning") &&
    isExecutionPoolPathAllowed(configuredPool, req.method, req.path)
  ) {
    next();
    return;
  }
  res.status(404).json({ error: "Not found" });
};
