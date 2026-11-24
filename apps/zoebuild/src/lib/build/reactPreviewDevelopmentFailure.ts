/** Public, allowlisted persistent capacity failures. Never render upstream text. */
export function developmentCapacityFailure(code: unknown) {
  if (code === "RUNNER_DISK_LOW") return {code, message:
    "The preview server is low on disk space. Your saved project is unchanged. Retry after an administrator frees storage."} as const;
  if (code === "RUNNER_WORKSPACE_STORAGE_LIMIT") return {code, message:
    "The preview server has reached its workspace storage limit. Your saved project is unchanged. Retry after an administrator restores capacity."} as const;
  return null;
}

export function developmentFailureRequestId(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
