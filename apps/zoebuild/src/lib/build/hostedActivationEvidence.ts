/** Pure, fail-closed contract for future server-managed TanStack hosting.
 * No database reads, runtime calls, mutation, environment fallback or routing.
 * Callers must obtain all inputs from trusted control-plane/runtime readers.
 * These provider/kind values are proposed for new records, not the static lane.
 */
export const HOSTED_RUNTIME_PROVIDER = "zoebuild-hosted-runtime-v1";
export const HOSTED_RUNTIME_KIND = "tanstack-runtime-v1";
const ID = /^[A-Za-z0-9_-]{4,128}$/;
const HEX = /^[a-f0-9]{64}$/;

export type HostedRuntimeActivation = Readonly<{
  projectId: string;
  sourceVersion: number;
  artifactHash: string;
  objectSha256: string;
  // Preserve the exact runtime-issued token (Python can emit microseconds).
  activatedAt: string;
}>;
export type HostedActivationSelection =
  | Readonly<{ state: "unavailable" }>
  | Readonly<{ state: "unpublished" }>
  | Readonly<{ state: "published"; deploymentId: string; activation: HostedRuntimeActivation }>;
export type HostedRuntimeEvidence =
  | Readonly<{ state: "unavailable" }>
  | Readonly<{ state: "inactive" }>
  | Readonly<{ state: "verified-active"; activation: HostedRuntimeActivation }>;
export type HostedDeploymentRecord = Readonly<{
  id: string; buildProjectId: string; sourceVersion: number;
  environment: string; provider: string; kind: string; status: string;
  artifactHash: string | null; providerRef: string | null;
}>;
export type HostedActivationInput = Readonly<{
  project: Readonly<{ id: string; status: string; stackId: string | null;
    codeProjectArchived: boolean }> | null;
  selection: HostedActivationSelection;
  deployment: HostedDeploymentRecord | null;
  runtime: HostedRuntimeEvidence;
}>;
export type HostedActivationDenial =
  | "PROJECT_INELIGIBLE" | "AUTHORITY_UNAVAILABLE" | "UNPUBLISHED"
  | "INVALID_SELECTION" | "DEPLOYMENT_MISMATCH" | "RUNTIME_UNAVAILABLE"
  | "RUNTIME_INACTIVE" | "RUNTIME_MISMATCH";
export type HostedActivationResult =
  | Readonly<{ state: "denied"; reason: HostedActivationDenial }>
  | Readonly<{ state: "eligible"; deploymentId: string; activation: HostedRuntimeActivation }>;

function validActivation(a: HostedRuntimeActivation): boolean {
  return ID.test(a.projectId) && Number.isSafeInteger(a.sourceVersion) && a.sourceVersion > 0
    && HEX.test(a.artifactHash) && HEX.test(a.objectSha256)
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(a.activatedAt)
    && Number.isFinite(Date.parse(a.activatedAt));
}
function sameActivation(a: HostedRuntimeActivation, b: HostedRuntimeActivation): boolean {
  return a.projectId === b.projectId && a.sourceVersion === b.sourceVersion
    && a.artifactHash === b.artifactHash && a.objectSha256 === b.objectSha256
    && a.activatedAt === b.activatedAt;
}
const denied = (reason: HostedActivationDenial): HostedActivationResult => ({state: "denied", reason});

/** Evaluates a committed selection, NOT a pending build or the latest ready row.
 * A matching result is only release evidence: hostname authorization, snapshot
 * freshness, admission, runtime isolation and request-time checks remain required.
 */
export function evaluateHostedActivation(input: HostedActivationInput): HostedActivationResult {
  const {project, selection, deployment, runtime} = input;
  if (!project || !ID.test(project.id) || project.status === "archived"
    || project.codeProjectArchived !== false || project.stackId !== "tanstack-start-v1") {
    return denied("PROJECT_INELIGIBLE");
  }
  if (selection.state === "unavailable") return denied("AUTHORITY_UNAVAILABLE");
  if (selection.state === "unpublished") return denied("UNPUBLISHED");
  const a = selection.activation;
  if (!ID.test(selection.deploymentId) || !validActivation(a) || a.projectId !== project.id) {
    return denied("INVALID_SELECTION");
  }
  // Proposed mapping: providerRef is the immutable R2 bundle/object digest.
  if (!deployment || deployment.id !== selection.deploymentId || deployment.buildProjectId !== project.id
    || deployment.environment !== "production" || deployment.provider !== HOSTED_RUNTIME_PROVIDER
    || deployment.kind !== HOSTED_RUNTIME_KIND || deployment.status !== "ready"
    || deployment.sourceVersion !== a.sourceVersion || deployment.artifactHash !== a.artifactHash
    || deployment.providerRef !== a.objectSha256) return denied("DEPLOYMENT_MISMATCH");
  if (runtime.state === "unavailable") return denied("RUNTIME_UNAVAILABLE");
  if (runtime.state === "inactive") return denied("RUNTIME_INACTIVE");
  if (!validActivation(runtime.activation) || !sameActivation(a, runtime.activation)) {
    return denied("RUNTIME_MISMATCH");
  }
  return Object.freeze({state: "eligible", deploymentId: deployment.id, activation: Object.freeze({...a})});
}
