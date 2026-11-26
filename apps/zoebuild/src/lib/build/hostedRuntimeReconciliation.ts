import "server-only";
import type { PrismaClient } from "@zoeskoul/db";
import type { HostedRuntimeActivation, HostedRuntimeEvidence } from "./hostedActivationEvidence";
import { observeOwnedHostedSelection, type HostedSelectionObservation } from "./hostedActivationSelection";
import { hostedPublishSelection, invokeHostedPublishControl, type PrivatePublishReceipt } from "./privatePublishControl";

// Observation only. Never a route lease, deployment mutation or HTTP authorization.
// The existing pilot transport is development-only; do not relax its selection gate.
const ID = /^[A-Za-z0-9_-]{4,128}$/;
const HEX = /^[a-f0-9]{64}$/;
// Bound each observation cycle independently, and bound the entire operation.
// These are control-plane read budgets, not gateway route leases.
export const HOSTED_OBSERVATION_BUDGET_MS = 10_000;
export const HOSTED_RECONCILIATION_BUDGET_MS = 20_000;
type Scope = Readonly<{ownerId:string;buildProjectId:string}>;
type Denial = "PILOT_DISABLED" | "SELECTION_CHANGED" | "OBSERVATION_EXPIRED" | "RUNTIME_CHANGED";
export type HostedRuntimeObservation = HostedSelectionObservation | Readonly<{
  generation:null; evidence:Readonly<{state:"denied";reason:Denial}>;
}>;
type Readers = Readonly<{
  observe:(runtime:HostedRuntimeEvidence)=>Promise<HostedSelectionObservation>;
  status:()=>Promise<HostedRuntimeEvidence>;
  now:()=>number;
}>;
const unavailable = {state:"unavailable"} as const;
const deny = (reason:Denial):HostedRuntimeObservation => ({generation:null,evidence:{state:"denied",reason}});
const authorityUnavailable = ():HostedSelectionObservation => ({generation:null,evidence:{state:"denied",reason:"AUTHORITY_UNAVAILABLE"}});

/** Convert only a server-returned status receipt, never browser-supplied evidence.
 * The pilot's deploymentId is the object digest, NOT a BuildDeployment id.
 */
export function hostedEvidenceFromStatus(projectId:string, receipt:PrivatePublishReceipt|null):HostedRuntimeEvidence {
  if (typeof projectId !== "string" || !ID.test(projectId)) return unavailable;
  if (receipt === null) return {state:"inactive"};
  if (!receipt || receipt.privatePilot !== true || typeof receipt.deploymentId !== "string" ||
      !HEX.test(receipt.deploymentId) || typeof receipt.artifactHash !== "string" || !HEX.test(receipt.artifactHash) ||
      !Number.isSafeInteger(receipt.sourceVersion) || receipt.sourceVersion < 1 ||
      typeof receipt.deployedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(receipt.deployedAt) ||
      !Number.isFinite(Date.parse(receipt.deployedAt))) return unavailable;
  return {state:"verified-active",activation:Object.freeze({projectId,sourceVersion:receipt.sourceVersion,
    artifactHash:receipt.artifactHash,objectSha256:receipt.deploymentId,activatedAt:receipt.deployedAt})};
}
function same(a:HostedRuntimeActivation,b:HostedRuntimeActivation):boolean {
  return a.projectId===b.projectId && a.sourceVersion===b.sourceVersion && a.artifactHash===b.artifactHash &&
    a.objectSha256===b.objectSha256 && a.activatedAt===b.activatedAt;
}

/** Internal testable orchestration. Readers must be server-owned. No cached fallback.
 * Re-read both authorities before returning matching evidence; this does not lock
 * the two systems together, so a serving boundary must still revalidate identity.
 */
export async function reconcileHostedRuntimeObservation(readers:Readers):Promise<HostedRuntimeObservation> {
  const start = readers.now();
  if (!Number.isFinite(start)) return deny("OBSERVATION_EXPIRED");
  let cycleStart = start;
  let last = start;
  const fresh = () => {
    const now = readers.now();
    if (!Number.isFinite(now) || now < last) return false;
    last = now;
    return now-start < HOSTED_RECONCILIATION_BUDGET_MS && now-cycleStart < HOSTED_OBSERVATION_BUDGET_MS;
  };
  const readStatus = async ():Promise<HostedRuntimeEvidence> => {try {return await readers.status();} catch {return unavailable;}};
  try {
    const initial=await readers.observe(unavailable);
    if (!fresh()) return deny("OBSERVATION_EXPIRED");
    // Do not contact the runtime for unpublished, unauthorized or invalid rows.
    if (initial.evidence.state!=="denied" || initial.evidence.reason!=="RUNTIME_UNAVAILABLE")
      return initial.evidence.state==="denied" ? initial : authorityUnavailable();
    if (initial.generation===null || initial.generation<=0n) return authorityUnavailable();
    const first=await readStatus();
    if (!fresh()) return deny("OBSERVATION_EXPIRED");
    const a=await readers.observe(first);
    if (!fresh()) return deny("OBSERVATION_EXPIRED");
    if (a.evidence.state==="denied") return a;
    if (a.generation!==initial.generation) return deny("SELECTION_CHANGED");
    if (first.state!=="verified-active" || !same(first.activation,a.evidence.activation)) return deny("RUNTIME_CHANGED");
    // The first full cycle has already been verified. Start a new, bounded
    // observation cycle, retaining the original overall deadline and identity.
    // A slow second status or final database read cannot return eligibility.
    cycleStart = last;
    const second=await readStatus();
    if (!fresh()) return deny("OBSERVATION_EXPIRED");
    const b=await readers.observe(second);
    if (!fresh()) return deny("OBSERVATION_EXPIRED");
    if (b.evidence.state==="denied") return b;
    if (b.generation!==a.generation || b.evidence.deploymentId!==a.evidence.deploymentId) return deny("SELECTION_CHANGED");
    if (second.state!=="verified-active" || !same(second.activation,b.evidence.activation) ||
        !same(a.evidence.activation,b.evidence.activation)) return deny("RUNTIME_CHANGED");
    return b;
  } catch {return authorityUnavailable();}
}

/** Development observation only. Existing trusted SSH status validates the active
 * pointer, receipt, approved runtime and home health on the VM. No new command or
 * environment flag. Owner scope is checked before contacting the runtime.
 */
export async function reconcileOwnedHostedRuntime(client:PrismaClient, scope:Scope):Promise<HostedRuntimeObservation> {
  if (typeof scope.ownerId!=="string" || typeof scope.buildProjectId!=="string" ||
      !ID.test(scope.ownerId) || !ID.test(scope.buildProjectId)) return deny("PILOT_DISABLED");
  const selected=hostedPublishSelection("http://localhost:3004",scope.buildProjectId,process.env);
  if (!selected || selected.ownerId!==scope.ownerId) return deny("PILOT_DISABLED");
  return reconcileHostedRuntimeObservation({
    observe:runtime=>observeOwnedHostedSelection(client,scope,runtime),
    status:async()=>hostedEvidenceFromStatus(scope.buildProjectId,await invokeHostedPublishControl("status",{projectId:scope.buildProjectId})),
    now:()=>performance.now(),
  });
}
