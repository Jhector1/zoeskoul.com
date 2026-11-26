import { evaluateHostedActivation, type HostedActivationInput,
  type HostedDeploymentRecord, type HostedRuntimeActivation } from "./hostedActivationEvidence";

/** Recovery decision contract for a FUTURE durable operation journal and fenced
 * provider. Not wired to the existing dev SSH transport, which has no durable
 * operation acknowledgement. Never manufacture acknowledgements from status().
 * No IO, route authorization, retries, or remote mutations occur here.
 */
const ID = /^[A-Za-z0-9_-]{4,128}$/;
const HEX = /^[a-f0-9]{64}$/;
const MAX = 9223372036854775807n;
const id = (s: unknown): s is string => typeof s === "string" && ID.test(s);
const digest = (s: unknown): s is string => typeof s === "string" && HEX.test(s);
export type HostedPublicationTarget = Readonly<{
  deploymentId: string; sourceVersion: number; artifactHash: string; objectSha256: string;
}>;
export type PendingHostedPublication = Readonly<{
  operationId: string; projectId: string; expectedGeneration: bigint;
}> & (Readonly<{action: "publish" | "rollback"; target: HostedPublicationTarget}> |
      Readonly<{action: "unpublish"; target: null}>);

/** A durable provider acknowledgement, not an ordinary runtime health receipt.
 * Provider must persist operation identity and fence with its mutation, including
 * inactive/unpublish tombstones, and reject stale fences under the runtime lock.
 * Only a trusted provider reader may construct this value.
 */
export type HostedOperationAcknowledgement = Readonly<{
  operationId: string; projectId: string; fence: bigint;
}> & (Readonly<{state: "applied-active"; activation: HostedRuntimeActivation}> |
      Readonly<{state: "applied-inactive"}>);
export type HostedPublicationRecoveryInput = Readonly<{
  operation: PendingHostedPublication;
  project: HostedActivationInput["project"];
  currentGeneration: bigint | null;
  deployment: HostedDeploymentRecord | null;
  acknowledgement: HostedOperationAcknowledgement | null;
}>;
export type HostedPublicationRecoveryDecision =
  | Readonly<{state: "await-provider"}>
  | Readonly<{state: "blocked"; reason: "INVALID_INTENT" | "PROJECT_INELIGIBLE" |
      "AUTHORITY_UNAVAILABLE" | "STALE_GENERATION" | "ACKNOWLEDGEMENT_MISMATCH" |
      "TARGET_MISMATCH"}>
  | Readonly<{state: "commit"; operationId: string; projectId: string;
      expectedGeneration: bigint; generation: bigint; deploymentId: string | null;
      activationToken: string | null}>;
const blocked = (reason: Extract<HostedPublicationRecoveryDecision,{state:"blocked"}>["reason"]): HostedPublicationRecoveryDecision => ({state:"blocked",reason});

/** The returned commit is a proposal only. The executor MUST atomically CAS
 * the pending journal operation AND expected generation, write selection and
 * mark the journal completed in one DB transaction. Recheck authorization and
 * target in that transaction. A pending journal blocks public route eligibility.
 * Never infer completion from a matching release or an advanced generation.
 */
export function planHostedPublicationRecovery(input: HostedPublicationRecoveryInput): HostedPublicationRecoveryDecision {
  const {operation:o,project:p,currentGeneration:g,deployment:d,acknowledgement:a} = input;
  if (!id(o.operationId) || !id(o.projectId) || typeof o.expectedGeneration !== "bigint" ||
      o.expectedGeneration < 0n || o.expectedGeneration >= MAX ||
      !["publish","rollback","unpublish"].includes(o.action)) return blocked("INVALID_INTENT");
  if (o.action === "unpublish" ? o.target !== null : (!o.target || !id(o.target.deploymentId) ||
      !Number.isSafeInteger(o.target.sourceVersion) || o.target.sourceVersion <= 0 ||
      !digest(o.target.artifactHash) || !digest(o.target.objectSha256))) return blocked("INVALID_INTENT");
  if (!p || p.id !== o.projectId || p.status === "archived" || p.stackId !== "tanstack-start-v1" ||
      p.codeProjectArchived !== false) return blocked("PROJECT_INELIGIBLE");
  if (typeof g !== "bigint" || g < 0n || g > MAX) return blocked("AUTHORITY_UNAVAILABLE");
  if (g !== o.expectedGeneration) return blocked("STALE_GENERATION");
  if (!a) return {state:"await-provider"}; // Unknown outcome: do not auto retry or adopt.
  const generation = g+1n;
  if (a.operationId !== o.operationId || a.projectId !== o.projectId || a.fence !== generation)
    return blocked("ACKNOWLEDGEMENT_MISMATCH");
  const base = {state:"commit" as const,operationId:o.operationId,projectId:o.projectId,
    expectedGeneration:g,generation};
  if (o.action === "unpublish") {
    if (a.state !== "applied-inactive") return blocked("TARGET_MISMATCH");
    return {...base,deploymentId:null,activationToken:null};
  }
  const t = o.target;
  if (a.state !== "applied-active" || !a.activation || a.activation.projectId !== o.projectId ||
      a.activation.sourceVersion !== t.sourceVersion || a.activation.artifactHash !== t.artifactHash ||
      a.activation.objectSha256 !== t.objectSha256) return blocked("TARGET_MISMATCH");
  const evidence = evaluateHostedActivation({project:p,deployment:d,
    selection:{state:"published",deploymentId:t.deploymentId,activation:a.activation},
    runtime:{state:"verified-active",activation:a.activation}});
  if (evidence.state !== "eligible") return blocked("TARGET_MISMATCH");
  return {...base,deploymentId:evidence.deploymentId,activationToken:evidence.activation.activatedAt};
}
