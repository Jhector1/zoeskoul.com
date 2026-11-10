/** Canonical server-side PTY Runner WebSocket endpoint resolver. */
type RunnerEndpointEnvironment = {
  RUNNER_BASE_URL?: string;
  RUNNER_WS_BASE_URL?: string;
};

/**
 * The WebSocket endpoint can differ from the HTTP endpoint, e.g. under an ingress.
 * No browser-exposed environment aliases are accepted here.
 */
export function getRunnerWsBase(
  env: RunnerEndpointEnvironment = {
    RUNNER_BASE_URL: process.env.RUNNER_BASE_URL,
    RUNNER_WS_BASE_URL: process.env.RUNNER_WS_BASE_URL,
  },
): string {
  const explicit = env.RUNNER_WS_BASE_URL?.trim();
  if (explicit) {
    const normalized = explicit.replace(/\/+$/, "");
    if (!/^wss?:\/\//i.test(normalized)) {
      throw new Error("RUNNER_WS_BASE_URL must begin with ws:// or wss://");
    }
    return normalized;
  }

  const http = env.RUNNER_BASE_URL?.trim();
  if (!http) {
    throw new Error("Missing RUNNER_WS_BASE_URL or RUNNER_BASE_URL");
  }
  const normalized = http.replace(/\/+$/, "");
  if (/^https:\/\//i.test(normalized)) {
    return normalized.replace(/^https:/i, "wss:");
  }
  if (/^http:\/\//i.test(normalized)) {
    return normalized.replace(/^http:/i, "ws:");
  }
  throw new Error("RUNNER_BASE_URL must begin with http:// or https://");
}
