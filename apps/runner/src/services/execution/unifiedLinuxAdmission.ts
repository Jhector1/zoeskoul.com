import {createHash} from "node:crypto";
import {isLinuxPolicy, linuxCapabilities, linuxLimits, type LinuxPolicy} from "./unifiedLinuxPolicy.js";
/** Future environment identity is derived from authenticated actor and authorized
 * workspace. A browser host, tab, terminal or privilege mode is not an identity. */
export type EnvironmentScope = Readonly<{tenantId: string; actorId: string; workspaceId: string}>;
export type EnvironmentRecord = Readonly<{
  id: string; scope: EnvironmentScope; policy: LinuxPolicy;
  state: "creating" | "running" | "stopping" | "stopped" | "cleanup_pending";
  terminalCount: number;
}>;
export function environmentScopeKey(scope: EnvironmentScope): string {
  const parts = [scope.tenantId, scope.actorId, scope.workspaceId];
  if (!parts.every(v => typeof v === "string" && v.trim() === v && v.length > 0 && v.length <= 256)) throw new Error("INVALID_SCOPE");
  return JSON.stringify(parts);
}
function samePolicy(a: LinuxPolicy, b: LinuxPolicy): boolean {
  return linuxCapabilities.every(k => a.capabilities[k] === b.capabilities[k]) && linuxLimits.every(k => a.limits[k] === b.limits[k]);
}
export type EnvironmentAdmission = Readonly<{action:"create"}> |
  Readonly<{action:"resume" | "attach-terminal"; environmentId:string}> |
  Readonly<{action:"blocked"; reason:"POLICY_CHANGED" | "TRANSITION_IN_PROGRESS" | "TERMINAL_LIMIT" | "INVALID_REGISTRY" | "UNAUTHORIZED_SCOPE" | "STOPPED_ENVIRONMENT"}>;
/** Pure planning only. Future caller must hold the per-scope lock and commit
 * changes atomically against the authoritative registry. Never destroy a live
 * environment on open, reconnect, capacity pressure or a configuration change. */
export function planUnifiedLinuxAdmission(scope: EnvironmentScope, effective: LinuxPolicy,
  existing: readonly EnvironmentRecord[], intent: "open" | "add-terminal"): EnvironmentAdmission {
  if (!isLinuxPolicy(effective)) return {action:"blocked",reason:"INVALID_REGISTRY"};
  const key = environmentScopeKey(scope);
  if (existing.some(r => environmentScopeKey(r.scope) !== key)) return {action:"blocked",reason:"UNAUTHORIZED_SCOPE"};
  if (existing.length > 1 || existing.some(r => !r.id || !isLinuxPolicy(r.policy) ||
      !Number.isSafeInteger(r.terminalCount) || r.terminalCount < 0 ||
      !["creating","running","stopping","stopped","cleanup_pending"].includes(r.state))) {
    return {action:"blocked",reason:"INVALID_REGISTRY"};
  }
  const current = existing[0];
  if (!current) return {action:"create"};
  if (!samePolicy(current.policy,effective)) return {action:"blocked",reason:"POLICY_CHANGED"};
  if (current.state === "stopped") return {action:"blocked",reason:"STOPPED_ENVIRONMENT"};
  if (current.state !== "running") return {action:"blocked",reason:"TRANSITION_IN_PROGRESS"};
  if (intent === "open") return {action:"resume",environmentId:current.id};
  if (current.terminalCount >= effective.limits.maxTerminals) return {action:"blocked",reason:"TERMINAL_LIMIT"};
  return {action:"attach-terminal",environmentId:current.id};
}

// One authoritative persistent Linux environment. The same contract can support
// Docker, system containers or VMs without exposing a runtime choice to a guest.
// This is a pure, unwired planner. The trusted controller must hold a durable
// per-scope lease, compare-and-swap the registry transition BEFORE any side
// effect, and record the provider-assigned immutable ID before reconciliation.
export type PersistentBackend = "docker" | "incus" | "microvm";
export type PersistentState = "reserved" | "allocating" | "running" | "stopped" |
  "starting" | "stopping" | "recovery_required";
export type PersistentEnvironmentRecord = Readonly<{
  scope: EnvironmentScope; generation: string; providerId: string; backend: PersistentBackend;
  policy: LinuxPolicy; state: PersistentState; resourceId: string | null;
}>;
export type PersistentEnvironmentSpec = Readonly<{
  scopeDigest: string; generation: string; providerId: string; backend: PersistentBackend;
  resourceName: string; diskMiB: number;
}>;
const generationPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const providerPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,95}$/;
const validProvider = (v:unknown):v is string => typeof v==="string" && providerPattern.test(v);
const validBackend = (v:unknown):v is PersistentBackend => v==="docker" || v==="incus" || v==="microvm";
function validResourceId(backend:PersistentBackend, id:unknown):id is string {
  return typeof id==="string" && (backend==="docker" ? /^[a-f0-9]{64}$/ : /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{7,127}$/).test(id);
}
export function persistentEnvironmentSpec(record:PersistentEnvironmentRecord):PersistentEnvironmentSpec {
  if(typeof record.generation!=="string" || !generationPattern.test(record.generation) ||
     !validProvider(record.providerId) || !validBackend(record.backend) || !isLinuxPolicy(record.policy) ||
     !record.policy.capabilities.persistentStorage ||
     !["reserved","allocating","running","stopped","starting","stopping","recovery_required"].includes(record.state) ||
     (record.state==="reserved" && record.resourceId!==null) ||
     (record.resourceId===null ? !["reserved","allocating","recovery_required"].includes(record.state) :
       !validResourceId(record.backend,record.resourceId))) throw Error("INVALID_PERSISTENT_ENVIRONMENT_RECORD");
  const scopeDigest=createHash("sha256").update(environmentScopeKey(record.scope)).digest("hex");
  const nameDigest=createHash("sha256").update(JSON.stringify([scopeDigest,record.generation])).digest("hex");
  return Object.freeze({scopeDigest,generation:record.generation,providerId:record.providerId,
    backend:record.backend,resourceName:`zoe-learn-p-${nameDigest.slice(0,48)}`,diskMiB:record.policy.limits.diskMiB});
}
export type PersistentEnvironmentEvidence = Readonly<{
  providerId: string; backend: PersistentBackend; scopeLeaseHeld: boolean; registryReadVerified: boolean;
  // Provider evidence, NOT configuration: actual hard limit covering all guest
  // writable persistent data and verified non-root isolation. Independent from
  // lifecycle proof. All persistent containers must exclude volatile mounts
  // from authoritative student paths and preserve the system writable layer.
  hardQuotaVerified: boolean; nonRootIsolationVerified: boolean; durableFilesystemVerified: boolean;
  observed: "scope_absent" | "resource_absent" | "running" | "stopped" | "unknown" | "conflict";
  observedSpec?: PersistentEnvironmentSpec; observedResourceId?: string;
  identityVerified?: boolean; // exact provider resource, security profile and ownership
  idleStopVerified?: boolean; // controller verified inactivity and no active work
  explicitStopAuthorized?: boolean; // authenticated exact-environment stop
}>;
export type PersistentLifecyclePlan = Readonly<{action:"reserve"}> |
  Readonly<{action:"provision"|"start"|"stop"|"commit"; nextState:PersistentState; environment:PersistentEnvironmentSpec; resourceId:string|null}> |
  Readonly<{action:"reuse"|"already_stopped"; environment:PersistentEnvironmentSpec; resourceId:string}> |
  Readonly<{action:"blocked";reason:string}>;
const persistentBlocked=(reason:string):PersistentLifecyclePlan=>({action:"blocked",reason});
function samePersistentSpec(actual:PersistentEnvironmentSpec|undefined, expected:PersistentEnvironmentSpec):boolean {
  return !!actual && actual.scopeDigest===expected.scopeDigest && actual.generation===expected.generation &&
    actual.providerId===expected.providerId && actual.backend===expected.backend &&
    actual.resourceName===expected.resourceName && actual.diskMiB===expected.diskMiB;
}
/** No automatic deletion, reset, migration, resize or anonymous adoption. A
 * missing or ambiguous registered environment never becomes a new empty one.
 * Stop is permitted after admission is revoked or quota proof is lost, provided
 * the exact owned resource and stop authorization remain verified. Root
 * persistence is not implemented here for ANY backend; it needs a separate
 * verified isolation and privilege contract. Reconcile only confirmed outcomes.
 * A crashed allocation with no recorded provider ID needs operator recovery.
 */
export function planPersistentEnvironmentLifecycle(scope:EnvironmentScope, effective:LinuxPolicy,
  records:readonly PersistentEnvironmentRecord[], evidence:PersistentEnvironmentEvidence,
  intent:"open"|"stop"|"idle-stop"|"reconcile"):PersistentLifecyclePlan {
  try {
    const key=environmentScopeKey(scope);
    if(!isLinuxPolicy(effective))return persistentBlocked("INVALID_POLICY");
    if(!["open","stop","idle-stop","reconcile"].includes(intent))return persistentBlocked("INVALID_INTENT");
    if(!evidence || evidence.scopeLeaseHeld!==true || evidence.registryReadVerified!==true ||
       !validProvider(evidence.providerId) || !validBackend(evidence.backend))return persistentBlocked("PERSISTENCE_EVIDENCE_UNVERIFIED");
    if(!Array.isArray(records)||records.length>1)return persistentBlocked("PERSISTENT_REGISTRY_AMBIGUOUS");
    const admit=():string|undefined=>{
      if(!effective.capabilities.persistentStorage)return "PERSISTENCE_DENIED";
      if(effective.capabilities.administrator || effective.capabilities.rootSafePersistence)return "ROOT_PERSISTENCE_NOT_IMPLEMENTED";
      if(evidence.hardQuotaVerified!==true || evidence.nonRootIsolationVerified!==true || evidence.durableFilesystemVerified!==true)
        return "PERSISTENCE_EVIDENCE_UNVERIFIED";
      return undefined;
    };
    if(intent==="open") {const reason=admit();if(reason)return persistentBlocked(reason);}
    if(records.length===0){
      return intent==="open" && evidence.observed==="scope_absent" && evidence.observedSpec===undefined && evidence.observedResourceId===undefined
        ? {action:"reserve"} : persistentBlocked("UNREGISTERED_ENVIRONMENT_UNVERIFIED");
    }
    const record=records[0];
    if(!record||environmentScopeKey(record.scope)!==key)return persistentBlocked("PERSISTENT_SCOPE_MISMATCH");
    const environment=persistentEnvironmentSpec(record);
    const resourceId=record.resourceId;
    if(record.providerId!==evidence.providerId||record.backend!==evidence.backend)return persistentBlocked("PERSISTENT_PROVIDER_CHANGED");
    if(record.state==="recovery_required")return persistentBlocked("PERSISTENT_RECOVERY_REQUIRED");
    if(intent==="open"&&!samePolicy(record.policy,effective))return persistentBlocked("POLICY_CHANGED");
    if(record.policy.capabilities.administrator||record.policy.capabilities.rootSafePersistence)
      return persistentBlocked("ROOT_PERSISTENCE_NOT_IMPLEMENTED");
    const exact=resourceId!==null && evidence.identityVerified===true && evidence.observedResourceId===resourceId &&
      samePersistentSpec(evidence.observedSpec,environment);
    const transition=(action:"provision"|"start"|"stop"|"commit",nextState:PersistentState):PersistentLifecyclePlan=>({action,nextState,environment,resourceId});
    if(intent==="open" && record.state==="reserved" && evidence.observed==="resource_absent" &&
       samePersistentSpec(evidence.observedSpec,environment) && evidence.observedResourceId===undefined)
      return transition("provision","allocating");
    if(!exact || resourceId===null)return persistentBlocked("PERSISTENT_ENVIRONMENT_UNVERIFIED");
    if(intent==="reconcile"){
      if(record.state==="allocating" && evidence.observed==="stopped")return transition("commit","stopped");
      if(record.state==="starting" && evidence.observed==="running")return transition("commit","running");
      if(record.state==="stopping" && evidence.observed==="stopped")return transition("commit","stopped");
      // External/crash-induced stop is safe to record, not to treat as deletion.
      if(record.state==="running" && evidence.observed==="stopped")return transition("commit","stopped");
      return persistentBlocked("UNVERIFIED_TRANSITION");
    }
    if(intent==="open"){
      if(record.state==="stopped" && evidence.observed==="stopped")return transition("start","starting");
      if(record.state==="running" && evidence.observed==="running")return {action:"reuse",environment,resourceId};
      return persistentBlocked("TRANSITION_IN_PROGRESS");
    }
    if((intent==="stop" && evidence.explicitStopAuthorized!==true) || (intent==="idle-stop" && evidence.idleStopVerified!==true))
      return persistentBlocked("STOP_NOT_AUTHORIZED");
    if(record.state==="running" && evidence.observed==="running")return transition("stop","stopping");
    if(record.state==="stopped" && evidence.observed==="stopped")return {action:"already_stopped",environment,resourceId};
    return persistentBlocked("TRANSITION_IN_PROGRESS");
  }catch{return persistentBlocked("PERSISTENT_ENVIRONMENT_INVALID");}
}
