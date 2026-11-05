/**
 * Automatic resolution is limited to pinned manifests and missing first
 * TanStack locks. A bad/mismatched existing signature is NEVER self-approved.
 * The authenticated bootstrap endpoint still validates ownership, exact
 * versions, current saved revision and the runner-generated lock.
 */
export function mayAutoRecoverReactPreviewDependencies(input: Readonly<{
  status: number;
  code?: string;
  message?: string;
}>): boolean {
  if (input.status !== 409) return false;

  if (input.code === "BUILD_DEPENDENCY_MANIFEST_UNSUPPORTED") {
    return input.message ===
      "Project dependencies require owner-approved, versioned resolution.";
  }

  return input.code === "BUILD_DEPENDENCY_LOCK_INVALID" &&
    input.message === "TanStack preview requires one-time trusted dependency preparation.";
}
