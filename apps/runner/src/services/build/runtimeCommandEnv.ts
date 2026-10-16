/**
 * Canonical command contract for ghcr.io/jhector1/zoeskoul-runtime.
 *
 * The runtime image entrypoint fails closed unless RUN_CMD_JSON is present.
 * Commands passed here are runner-owned registered argv. No shell string and
 * no browser/user-provided env crosses this boundary.
 */
export function trustedRuntimeCommandEnv(
  command: readonly string[],
): string {
  if (
    command.length === 0 ||
    command.some(
      (part) =>
        typeof part !== "string" ||
        part.length === 0 ||
        part.includes("\0"),
    )
  ) {
    throw new Error(
      "Trusted runtime command requires non-empty safe argv.",
    );
  }

  return `RUN_CMD_JSON=${JSON.stringify(command)}`;
}
