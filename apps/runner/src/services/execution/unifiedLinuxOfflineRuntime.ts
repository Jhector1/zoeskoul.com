import { environmentScopeKey } from './unifiedLinuxAdmission.js';
import { isLinuxPolicy, linuxCapabilities, linuxLimits } from './unifiedLinuxPolicy.js';
import type { EnvironmentIdentity, UnifiedLinuxRuntime, UnifiedLinuxTerminal, UnifiedPythonProgram } from './unifiedLinuxEnvironmentManager.js';
import { detachedGuestSpec, provisionDetachedGuest, inspectDetachedGuest, destroyDetachedGuest, type DetachedGuestIdentity, type DetachedGuestOperations } from './adminLabGuestLifecycle.js';
import { emptyAdminLabResources, prepareAdminLabResources, removeVerifiedAdminLabResources, type AdminLabResourceEvidence, type AdminLabResourceOperations } from './adminLabRuntimeResources.js';

/** Internal U2B3 composition only. Not safe to expose before durable scope
 * reservation, operator revocation, expiry, quota and readiness acceptance. */
export type OfflineRuntimeBinding = {
  image: string;
  openTerminal?: (containerId:string, authorize:()=>Promise<void>,program?:UnifiedPythonProgram)=>Promise<UnifiedLinuxTerminal>;
  guest: DetachedGuestOperations;
  resources: AdminLabResourceOperations;
  // Host-side trusted checks, never browser fields or guest claims.
  assertScopeReserved: (identity: EnvironmentIdentity) => Promise<void>;
  verifyReady: (identity: EnvironmentIdentity, containerId: string) => Promise<void>;
};
type Entry = { key:string; identity:EnvironmentIdentity; guestIdentity:DetachedGuestIdentity;
  binding:OfflineRuntimeBinding; evidence:AdminLabResourceEvidence; attemptedGuest:boolean;
  checkedEmpty:boolean; containerId:string|null; cleaned:boolean };
function keyOf(identity:EnvironmentIdentity):string {
  if(!isLinuxPolicy(identity.policy))throw new Error('INVALID_OFFLINE_POLICY');
  return JSON.stringify([identity.id,environmentScopeKey(identity.scope),...linuxCapabilities.map(k=>identity.policy.capabilities[k]),...linuxLimits.map(k=>identity.policy.limits[k])]);
}
export function offlineGuestIdentity(identity:EnvironmentIdentity,image:string):DetachedGuestIdentity {
  keyOf(identity);
  const sessionId=identity.id.replace(/^env_/,'sess_');
  if(!identity.id.startsWith('env_'))throw new Error('INVALID_OFFLINE_ID');
  const result=Object.freeze({sessionId,ownerKey:identity.scope.actorId,image});
  detachedGuestSpec(result);return result;
}
/** Fixed experimental admin image only. Disk, time and terminal quotas are
 * not yet enforced by this adapter; it must not be exposed as a live runtime. */
export function assertOfflinePolicy(identity:EnvironmentIdentity):void {
  keyOf(identity);
  const {capabilities:c,limits:l}=identity.policy;
  if(!c.administrator || linuxCapabilities.some(k=>k!=='administrator'&&k!=='reset'&&c[k]))throw new Error('OFFLINE_CAPABILITY_UNSUPPORTED');
  if(l.memoryMiB<192 || l.cpuMillicores<500 || l.pids<48)throw new Error('OFFLINE_FIXED_LIMIT_EXCEEDS_POLICY');
}
export class UnifiedLinuxOfflineRuntime implements UnifiedLinuxRuntime {
  private readonly entries=new Map<string,Entry>();
  constructor(private readonly bind:(identity:EnvironmentIdentity)=>OfflineRuntimeBinding) {}
  private entry(identity:EnvironmentIdentity):Entry {
    const e=this.entries.get(identity.id);
    if(!e || e.key!==keyOf(identity))throw new Error('OFFLINE_RESERVATION_UNVERIFIED');
    return e;
  }
  private authorized(e:Entry):void {
    e.binding.guest.assertAuthorized(); e.binding.resources.assertAuthorized();
    if(e.binding.resources.isolationEnabled())throw new Error('OFFLINE_NETWORK_POLICY_CHANGED');
  }
  async provision(identity:EnvironmentIdentity):Promise<void> {
    assertOfflinePolicy(identity);
    if(this.entries.has(identity.id)||this.entries.size>=1024)throw new Error('OFFLINE_RESERVATION_BUSY');
    // Manager supplies frozen policy/scope. Copy again to avoid retaining mutable callers.
    identity=Object.freeze({id:identity.id,scope:Object.freeze({...identity.scope}),policy:Object.freeze({capabilities:Object.freeze({...identity.policy.capabilities}),limits:Object.freeze({...identity.policy.limits})})});
    const binding=this.bind(identity);
    const guestIdentity=offlineGuestIdentity(identity,binding.image);
    const e:Entry={key:keyOf(identity),identity,guestIdentity,binding,evidence:emptyAdminLabResources(),attemptedGuest:false,checkedEmpty:false,containerId:null,cleaned:false};
    this.entries.set(identity.id,e);
    this.authorized(e); await binding.assertScopeReserved(identity); this.authorized(e);
    const spec=detachedGuestSpec(guestIdentity);
    // Do not adopt or delete pre-existing objects. Unknown is not absent.
    if(await binding.guest.inspect(spec.name)!==null || !await binding.resources.volumeAbsent(spec.volume))throw new Error('OFFLINE_RESOURCE_OCCUPIED');
    e.checkedEmpty=true;
    this.authorized(e);
    await prepareAdminLabResources(guestIdentity.sessionId,e.evidence,{...binding.resources,
      assertAuthorized:()=>this.authorized(e),isolationEnabled:()=>{this.authorized(e);return false;}});
    this.authorized(e);
    e.attemptedGuest=true;
    e.containerId=await provisionDetachedGuest(guestIdentity,binding.guest);
    this.authorized(e); await binding.verifyReady(identity,e.containerId); this.authorized(e);
  }
  async inspect(identity:EnvironmentIdentity):Promise<'running'|'absent'|'unknown'> {
    try {
      const e=this.entry(identity), {binding,guestIdentity}=e;
      if(!e.checkedEmpty)return 'unknown';
      const state=await inspectDetachedGuest(guestIdentity,binding.guest);
      if(state==='absent')return await binding.resources.volumeAbsent(detachedGuestSpec(guestIdentity).volume)?'absent':'unknown';
      if(state!=='running'||!e.containerId||e.cleaned)return 'unknown';
      this.authorized(e);
      // Verify immutable container ID as well as name, labels and workspace.
      const actual=await binding.guest.inspect(detachedGuestSpec(guestIdentity).name);
      if(actual?.id!==e.containerId)return 'unknown';
      await binding.guest.verifyPrerequisites();
      await binding.verifyReady(identity,e.containerId); this.authorized(e);
      return 'running';
    } catch {return 'unknown';}
  }
  async openTerminal(identity:EnvironmentIdentity,program?:UnifiedPythonProgram):Promise<UnifiedLinuxTerminal> {
    const e=this.entry(identity);
    const authorize=async()=>{
      this.authorized(e); await e.binding.assertScopeReserved(identity);
      if(await this.inspect(identity)!=="running")throw Error("TERMINAL_RUNTIME_UNVERIFIED");
      this.authorized(e); await e.binding.assertScopeReserved(identity);
    };
    await authorize();
    if(!e.containerId||!e.binding.openTerminal)throw Error("TERMINAL_RUNTIME_UNAVAILABLE");
    return program?e.binding.openTerminal(e.containerId,authorize,program):e.binding.openTerminal(e.containerId,authorize);
  }
  async destroy(identity:EnvironmentIdentity):Promise<void> {
    const e=this.entry(identity), {binding,guestIdentity}=e;
    // Cleanup after revocation must not require a still-live launch grant.
    if(!e.checkedEmpty)throw new Error('OFFLINE_PREEXISTING_RESOURCE_UNVERIFIED');
    if(e.attemptedGuest) {
      const found=await binding.guest.inspect(detachedGuestSpec(guestIdentity).name);
      if(e.containerId && found && found.id!==e.containerId)throw new Error('OFFLINE_GUEST_ID_CHANGED');
      await destroyDetachedGuest(guestIdentity,binding.guest);
    } else if(await binding.guest.inspect(detachedGuestSpec(guestIdentity).name)!==null)throw new Error('OFFLINE_UNEXPECTED_GUEST');
    await removeVerifiedAdminLabResources(guestIdentity.sessionId,e.evidence,binding.resources);
    if(await this.inspect(identity)!=='absent')throw new Error('OFFLINE_CLEANUP_UNVERIFIED');
    e.cleaned=true;
  }
}
