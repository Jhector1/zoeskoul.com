/**
 * Runtime boundary for the canonical generated TanStack Start application.
 *
 * ZoeBuild's control plane never serves generated backend code in-process.
 * A published Worker and its secrets are per tenant/project; the existing
 * isolated runner performs previews and verification, not live production.
 * These types are not retrofitted onto a static-directory artifact.
 */
export const TANSTACK_START_STACK_ID = "tanstack-start-v1" as const;
export const TANSTACK_START_PREVIEW_PORT = 5173 as const;

export type TanstackStartArtifact = Readonly<{
  kind: "cloudflare-worker";
  stackId: typeof TANSTACK_START_STACK_ID;
  sourceVersion: number;
  contentSha256: string;
  workerEntrypoint: "@tanstack/react-start/server-entry";
  // The deployment adapter receives build output, not arbitrary workspace code.
  isolation: "per-project-worker";
}>;

export type TanstackStartReadiness = Readonly<{
  isolatedServerPreview: boolean;
  lockfileVerification: boolean;
  serverSideBuildVerification: boolean;
  perProjectSecrets: boolean;
  workerPublisher: boolean;
  deploymentReconciliation: boolean;
  previewVersionParity: boolean;
}>;

export const TANSTACK_START_CUTOVER_GATES = [
  "isolatedServerPreview",
  "lockfileVerification",
  "serverSideBuildVerification",
  "perProjectSecrets",
  "workerPublisher",
  "deploymentReconciliation",
  "previewVersionParity",
] as const satisfies readonly (keyof TanstackStartReadiness)[];

/** Fail closed rather than expose server-side code through a static publisher. */
export function assertTanstackStartCutoverReady(readiness: TanstackStartReadiness) {
  const missing = TANSTACK_START_CUTOVER_GATES.filter((gate) => readiness[gate] !== true);
  if (missing.length) {
    throw new Error(`TanStack Start cutover blocked: ${missing.join(", ")}`);
  }
}
