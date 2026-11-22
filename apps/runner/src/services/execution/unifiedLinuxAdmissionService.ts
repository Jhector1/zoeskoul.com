import { environmentScopeKey, type EnvironmentScope } from './unifiedLinuxAdmission.js';
import { UnifiedLinuxEnvironmentManager, type EnvironmentIdentity, type UnifiedPythonProgram } from './unifiedLinuxEnvironmentManager.js';
import { UnifiedLinuxTerminalTransport } from './unifiedLinuxTerminalTransport.js';
import { assertVerifiedAdminGrant, verifyAdminGrant, type VerifiedAdminGrant } from './learningAdminGrant.js';
import { assertAdminLabSwitch, adminLabSwitchStatus } from './learningAdminSwitch.js';
import { resolveUnifiedLinuxPolicy, linuxCapabilities, linuxLimits, type LinuxPolicy } from './unifiedLinuxPolicy.js';
import { reservationIdentityKey } from './unifiedLinuxReservationStore.js';

type PolicyInput=Parameters<typeof resolveUnifiedLinuxPolicy>[0];
export type UnifiedRuntimeAuthority=(identity:EnvironmentIdentity)=>{grant:VerifiedAdminGrant;generation:number};
// This context is constructed by a trusted server after authentication and
// entitlement checks. None of these fields may be copied from a browser body.
export type UnifiedAdmissionContext=Readonly<{scope:EnvironmentScope; policy:PolicyInput}>;
export type UnifiedAdmissionDependencies=Readonly<{
  createManager:(authorize:UnifiedRuntimeAuthority)=>UnifiedLinuxEnvironmentManager;
  // Must consult current trusted entitlement / window ownership state, not a
  // cached login boolean. Failure denies access without implicit destruction.
  scopeAllowed:(scope:EnvironmentScope)=>boolean;
  assertScopeHeld:(identity:EnvironmentIdentity)=>void;
  now?:()=>number;
  maxEnvironments?:number;
  // Trusted private pilot composition only. Never derived from a browser or grant.
  privatePilotLifetimeMinutes?:60;
}>;
type Entry={scope:EnvironmentScope;grant:VerifiedAdminGrant;generation:number;policy:LinuxPolicy;expiresAt:number;ended:boolean};
const denied=(reason:string)=>({ok:false as const,reason});
const policyKey=(p:LinuxPolicy)=>JSON.stringify([...linuxCapabilities.map(k=>p.capabilities[k]),...linuxLimits.map(k=>p.limits[k])]);
/** Single-process, trusted experimental composition. Not an HTTP endpoint.
 * Startup guard remains OFF-only; this service does not enable the runtime,
 * mint tokens, install scheduling, or establish tenant/workspace entitlement.
 * Callers must enforce legacy exclusion and host admission before activation. */
export class UnifiedLinuxAdmissionService {
  private readonly manager:UnifiedLinuxEnvironmentManager;
  readonly transport:UnifiedLinuxTerminalTransport;
  private readonly entries=new Map<string,Entry>();
  private readonly now:()=>number;
  private readonly limit:number;
  private readonly maxLifetimeMinutes:number;
  private tail:Promise<unknown>=Promise.resolve();
  constructor(private readonly deps:UnifiedAdmissionDependencies){
    this.now=deps.now??Date.now;this.limit=deps.maxEnvironments??16;
    if(!Number.isSafeInteger(this.limit)||this.limit<1||this.limit>64)throw Error('UNIFIED_ADMISSION_LIMIT_INVALID');
    const extended=deps.privatePilotLifetimeMinutes;
    if(extended!==undefined&&(extended!==60||this.limit!==1||!this.enabled()||process.env.RUNNER_EXECUTION_POOL!=='zoeskoul-learning'))throw Error('UNIFIED_PRIVATE_PILOT_LIMIT_INVALID');
    this.maxLifetimeMinutes=extended??10;
    this.manager=deps.createManager(identity=>this.authority(identity));
    this.transport=new UnifiedLinuxTerminalTransport(this.manager,this.limit*8);
  }
  private serial<T>(fn:()=>Promise<T>):Promise<T>{const task=this.tail.catch(()=>undefined).then(fn);this.tail=task;return task;}
  private enabled(){return process.env.ZOESKOUL_LEARNING_UNIFIED_DETACHED_DEV==='true'&&process.env.ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE==='development';}
  private allowed(e:Entry):boolean{
    try{
      if(!this.enabled()||e.ended||this.now()>=e.expiresAt||this.deps.scopeAllowed(e.scope)!==true)return false;
      assertVerifiedAdminGrant(e.grant,e.scope.actorId);assertAdminLabSwitch(e.generation);
      const r=this.manager.get(e.scope);if(r?.state==='running')this.deps.assertScopeHeld(r);
      return true;
    }catch{return false;}
  }
  private authority(identity:EnvironmentIdentity){
    const e=this.entries.get(environmentScopeKey(identity.scope));const record=this.manager.get(identity.scope);
    if(!e||!record||reservationIdentityKey(record)!==reservationIdentityKey(identity)||policyKey(identity.policy)!==policyKey(e.policy)||!this.allowed(e))throw Error('UNIFIED_RUNTIME_AUTHORIZATION_REQUIRED');
    return {grant:e.grant,generation:e.generation};
  }
  /** Fresh one-time admin grant for open/resume; scope and policy resolved by
   * trusted backend. No privilege or lifetime escalation on reconnect. */
  open(context:UnifiedAdmissionContext,grantToken:unknown){
    const scope=Object.freeze({...context.scope});const key=environmentScopeKey(scope);
    const resolution=resolveUnifiedLinuxPolicy(context.policy);
    if(!resolution.ok)return Promise.resolve(denied(resolution.reason));
    const policy=resolution.policy;
    return this.serial(async()=>{
      try{if(!this.enabled()||!/^u:[a-f0-9]{64}$/.test(scope.actorId)||this.deps.scopeAllowed(scope)!==true)return denied('UNIFIED_ADMISSION_FORBIDDEN');}catch{return denied('UNIFIED_ADMISSION_FORBIDDEN');}
      if(!policy.capabilities.administrator||linuxCapabilities.some(k=>k!=='administrator'&&k!=='reset'&&policy.capabilities[k])||policy.limits.memoryMiB<192||policy.limits.cpuMillicores<500||policy.limits.pids<48||policy.limits.lifetimeMinutes>this.maxLifetimeMinutes)return denied('UNIFIED_OFFLINE_POLICY_UNSUPPORTED');
      let grant:VerifiedAdminGrant;let generation:number;
      try{grant=verifyAdminGrant(grantToken,scope.actorId);generation=assertAdminLabSwitch();if(grant.topicSlug!=='full-privileges')return denied('UNIFIED_ADMISSION_FORBIDDEN');}catch{return denied('UNIFIED_ADMISSION_FORBIDDEN');}
      let e=this.entries.get(key);
      if(e){if(!this.allowed(e)||generation!==e.generation||policyKey(e.policy)!==policyKey(policy))return denied('UNIFIED_EXISTING_ENVIRONMENT_BLOCKED');}
      else {
        if(this.entries.size>=this.limit)return denied('UNIFIED_ENVIRONMENT_LIMIT');
        // The old grant is actor-wide. Temporarily limit actor to one scope
        // even if the trusted entitlement permits more than one workspace.
        if([...this.entries.values()].some(x=>x.scope.actorId===scope.actorId))return denied('UNIFIED_ACTOR_SCOPE_CONFLICT');
        e={scope,grant,generation,policy,expiresAt:this.now()+policy.limits.lifetimeMinutes*60_000,ended:false};this.entries.set(key,e);
      }
      // Policy is frozen now, so original request mutations cannot affect open.
      const exact={platform:policy,organization:policy,course:policy,entitlement:policy,verifiedRuntime:policy,requested:policy};
      const result=await this.manager.open(scope,exact);
      if(!this.manager.get(scope)&&this.entries.get(key)===e)this.entries.delete(key);
      if(!this.allowed(e))return denied('UNIFIED_ADMISSION_FORBIDDEN');
      return result;
    });
  }
  /** Authenticated server context only; exact scope and environment required. */
  openTerminal(scope:EnvironmentScope,id:string,program?:UnifiedPythonProgram){
    scope=Object.freeze({...scope});const key=environmentScopeKey(scope);
    return this.serial(async()=>{
      const e=this.entries.get(key);if(!e||!this.allowed(e)||this.manager.get(scope)?.id!==id)return denied('UNIFIED_TERMINAL_FORBIDDEN');
      if(program&&this.transport.hasPythonRun(scope,id))return denied('UNIFIED_PROGRAM_LIMIT');
      const authorize=()=>this.entries.get(key)===e&&this.allowed(e);
      const r=await (program?this.transport.openTerminal(scope,id,authorize,program):this.transport.openTerminal(scope,id,authorize));
      if(r.ok&&(!this.allowed(e)||!this.transport.canConnectScoped(r.terminalId,scope,id)))return denied('UNIFIED_TERMINAL_FORBIDDEN');
      if(r.ok&&program)console.log('U5C3C3B_PROGRAM_TERMINAL_OPEN_PASS');
      return r;
    });
  }
  /** Never trust a browser terminal ID as a process ID. Verify current
   * server scope, then request cooperative EOF on the exact owned shell. */
  requestShellExit(scope:EnvironmentScope,id:string,terminalId:string){
    scope=Object.freeze({...scope});const key=environmentScopeKey(scope);
    return this.serial(async()=>{
      const e=this.entries.get(key);
      if(!e||!this.allowed(e)||this.manager.get(scope)?.id!==id)return denied('SHELL_EXIT_FORBIDDEN');
      return this.transport.requestShellExitScoped(scope,id,terminalId);
    });
  }
  /** Trusted browser composition: exact live identity, not a new allocation. */
  currentEnvironmentId(scope:EnvironmentScope):string|undefined{return this.manager.get(scope)?.id;}
  authorizeEnvironment(scope:EnvironmentScope,id:string):boolean{
    const e=this.entries.get(environmentScopeKey(scope));const record=this.manager.get(scope);
    return !!e&&record?.id===id&&record.state==='running'&&this.allowed(e);
  }
  /** Safe projection for a trusted, scope-authorized browser caller. */
  browserStatus(scope:EnvironmentScope,id:string){
    if(!this.authorizeEnvironment(scope,id))return undefined;
    const record=this.manager.get(scope)!;
    return {environmentId:id,state:record.state,terminalCount:record.terminalCount,maxTerminals:record.policy.limits.maxTerminals,
      resetAllowed:record.policy.capabilities.reset,terminals:this.transport.listScoped(scope,id),recentRuns:this.transport.completedRunsScoped(scope,id)};
  }
  /** Ongoing session authority: unlike ticket issuance, this allows a
   * terminal to be occupied by its already-authorized peer. */
  authorizeTerminalSession(scope:EnvironmentScope,id:string,terminalId:string):boolean{
    return this.authorizeEnvironment(scope,id)
      &&this.transport.ownsLiveTerminalScoped(terminalId,scope,id);
  }
  /** Preflight for the existing trusted Web attach-token issuer. Never returns
   * a bearer token or allows another tenant/workspace to obtain one. */
  authorizeAttach(scope:EnvironmentScope,id:string,terminalId:string):boolean{
    const e=this.entries.get(environmentScopeKey(scope));return !!e&&this.allowed(e)&&this.manager.get(scope)?.id===id&&this.transport.canConnectScoped(terminalId,scope,id);
  }
  end(scope:EnvironmentScope,id:string,confirmed:boolean,intent:'end'|'reset'='end'){
    scope=Object.freeze({...scope});const key=environmentScopeKey(scope);
    return this.serial(async()=>{
      const e=this.entries.get(key);if(!e||!this.allowed(e)||this.manager.get(scope)?.id!==id)return denied('UNIFIED_END_FORBIDDEN');
      if(confirmed!==true)return denied('CONFIRMATION_REQUIRED');if(intent==='reset'&&!e.policy.capabilities.reset)return denied('RESET_DENIED');
      e.ended=true;return this.cleanup(key,e,id);
    });
  }
  private async cleanup(key:string,e:Entry,id:string){
    const result=await this.manager.end(e.scope,id,true);
    if(result.ok)this.transport.forgetCompleted(e.scope,id);
    if(result.ok&&this.entries.get(key)===e)this.entries.delete(key);
    await this.transport.reconcile();return result;
  }
  /** Internal operator-only exact-scope revocation. Immediate fencing, cleanup
   * serialized behind in-flight creation. No browser-facing revoke method. */
  revoke(scope:EnvironmentScope,id:string){
    const key=environmentScopeKey(scope),e=this.entries.get(key);
    if(!e||this.manager.get(scope)?.id!==id)return Promise.resolve(denied('UNIFIED_ENVIRONMENT_NOT_FOUND'));
    e.ended=true;return this.serial(async()=>this.entries.get(key)===e?this.cleanup(key,e,id):denied('UNIFIED_ENVIRONMENT_NOT_FOUND'));
  }
  /** Explicit trusted lifecycle tick. Hard deadlines never renew via terminal
   * input. Temporary entitlement uncertainty fences access, not deletion. */
  sweep(){return this.serial(async()=>{
    const failed:string[]=[];const gate=adminLabSwitchStatus();
    for(const [key,e] of this.entries){
      if(e.ended||this.now()>=e.expiresAt||!gate.enabled||gate.generation!==e.generation){
        e.ended=true;const r=this.manager.get(e.scope);if(!r){failed.push(key);continue;}
        const result=await this.cleanup(key,e,r.id);if(!result.ok)failed.push(key);
      }
    }
    await this.transport.reconcile();return {ok:failed.length===0,failed:failed.length};
  });}
}
