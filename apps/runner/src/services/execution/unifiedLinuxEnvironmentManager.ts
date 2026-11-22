import { randomUUID } from "node:crypto";
import { environmentScopeKey, planUnifiedLinuxAdmission, type EnvironmentScope, type EnvironmentRecord } from "./unifiedLinuxAdmission.js";
import { resolveUnifiedLinuxPolicy, type LinuxPolicy } from "./unifiedLinuxPolicy.js";

type PolicyInput = Parameters<typeof resolveUnifiedLinuxPolicy>[0];
export type EnvironmentIdentity = Readonly<{ id:string; scope:EnvironmentScope; policy:LinuxPolicy }>;
export type ManagedEnvironment = EnvironmentRecord & Readonly<{ createdAt:number }>;
/** Trusted runtime adapter, not a browser-facing interface. Implementations must
 * reconcile the scope against runtime resources before allocating, verify exact
 * identity/security profile on inspect, and prove all owned resources absent
 * before returning absent. No guest-provided labels or paths are authoritative.
 * A failed/ambiguous operation must throw or return unknown, never claim absent.
 */
export type UnifiedLinuxTerminal = Readonly<{
  stream: NodeJS.ReadWriteStream;
  resize: (rows:number,cols:number)=>Promise<void>;
  disconnect: ()=>void;
  exited: ()=>Promise<boolean>;
}>;
export type UnifiedPythonProgram = Readonly<{path:string;expectedRevision:string}>;
export type TerminalResult = Readonly<{ok:true;terminalId:string;terminal:UnifiedLinuxTerminal}> | Readonly<{ok:false;reason:string}>;
export interface UnifiedLinuxRuntime {
  openTerminal?(identity:EnvironmentIdentity,program?:UnifiedPythonProgram):Promise<UnifiedLinuxTerminal>;
  provision(identity:EnvironmentIdentity):Promise<void>;
  inspect(identity:EnvironmentIdentity):Promise<"running"|"absent"|"unknown">;
  destroy(identity:EnvironmentIdentity):Promise<void>;
}
export type EnvironmentResult = Readonly<{ok:true; action:"created"|"resumed"|"destroyed"; environment:ManagedEnvironment}> |
  Readonly<{ok:false; reason:string}>;
const blocked = (reason:string):EnvironmentResult => ({ok:false,reason});
/** In-memory, single-process coordinator. Future production wiring must first
 * reconcile durable resource identities at startup and gate legacy admission.
 * Do not instantiate per request or share across independent Runner processes.
 * This module does not start PTYs or expose routes. */
export class UnifiedLinuxEnvironmentManager {
  private readonly records = new Map<string,ManagedEnvironment>();
  private readonly queues = new Map<string,Promise<unknown>>();
  private readonly terminals = new Map<string,Map<string,UnifiedLinuxTerminal|null>>();
  private readonly usedIds = new Set<string>();
  constructor(private readonly runtime:UnifiedLinuxRuntime, private readonly newId:()=>string,
    private readonly now:()=>number = Date.now) {}
  private locked<T>(key:string, action:()=>Promise<T>):Promise<T> {
    const previous=this.queues.get(key) ?? Promise.resolve();
    const next=previous.catch(()=>undefined).then(action);
    this.queues.set(key,next);
    const clear=()=>{if(this.queues.get(key)===next)this.queues.delete(key);};
    void next.then(clear,clear);
    return next;
  }
  private transition(key:string, record:ManagedEnvironment,state:EnvironmentRecord["state"]):ManagedEnvironment {
    const updated=Object.freeze({...record,state}); this.records.set(key,updated); return updated;
  }
  private identity(record:ManagedEnvironment):EnvironmentIdentity {
    return Object.freeze({id:record.id,scope:record.scope,policy:record.policy});
  }
  private async inspect(record:ManagedEnvironment):Promise<"running"|"absent"|"unknown"> {
    try { return await this.runtime.inspect(this.identity(record)); } catch { return "unknown"; }
  }
  /** Scope and policy layers must be built from authenticated server context.
   * Admission never evicts, resets or silently changes an existing environment. */
  open(scope:EnvironmentScope, input:PolicyInput):Promise<EnvironmentResult> {
    const key=environmentScopeKey(scope);
    const owned=Object.freeze({...scope});
    const resolution=resolveUnifiedLinuxPolicy(input);
    if(!resolution.ok)return Promise.resolve(blocked(resolution.reason));
    const policy=resolution.policy;
    // Persistence and the other unimplemented adapter capabilities stay off
    // even if a caller accidentally passes optimistic runtime evidence.
    if(policy.capabilities.persistentStorage || policy.capabilities.workspaceSync ||
       policy.capabilities.systemd || policy.capabilities.webPreview) return Promise.resolve(blocked("RUNTIME_CAPABILITY_NOT_IMPLEMENTED"));
    return this.locked(key,async()=>{
      const current=this.records.get(key);
      const admission=planUnifiedLinuxAdmission(owned,policy,current?[current]:[],"open");
      if(admission.action==="blocked")return blocked(admission.reason);
      if(current){
        if(await this.inspect(current)!=="running"){
          this.transition(key,current,"cleanup_pending"); return blocked("RUNTIME_UNVERIFIED");
        }
        return {ok:true,action:"resumed",environment:current};
      }
      const id=this.newId();
      if(!/^env_[a-zA-Z0-9_-]{8,128}$/.test(id)||this.usedIds.has(id))return blocked("INVALID_ENVIRONMENT_ID");
      this.usedIds.add(id);
      const record:ManagedEnvironment=Object.freeze({id,scope:owned,policy,state:"creating",terminalCount:0,createdAt:this.now()});
      this.records.set(key,record); // reserve before any external allocation
      try {
        await this.runtime.provision(this.identity(record));
        if(await this.inspect(record)!=="running")throw new Error("UNVERIFIED_PROVISION");
        const running=this.transition(key,record,"running");
        return {ok:true,action:"created",environment:running};
      } catch {
        // Provision may have partially succeeded. Keep ownership and capacity
        // reserved; a retry of open cannot allocate a competing environment.
        this.transition(key,record,"cleanup_pending"); return blocked("PROVISION_UNVERIFIED");
      }
    });
  }
  get(scope:EnvironmentScope):ManagedEnvironment|undefined {return this.records.get(environmentScopeKey(scope));}
  /** Synchronous identity fencing for a transport already issued by this manager. */
  ownsTerminal(scope:EnvironmentScope,expectedId:string,terminalId:string,terminal:UnifiedLinuxTerminal):boolean {
    const key=environmentScopeKey(scope),current=this.records.get(key);
    return !!current&&current.id===expectedId&&current.state==="running"&&this.terminals.get(key)?.get(terminalId)===terminal;
  }
  /** Internal trusted caller only. Uses the same lock as environment teardown.
   * A disconnected transport is NOT proof of process exit. Ambiguous starts
   * retain their slot until confirmed environment destruction. */
  attachTerminal(scope:EnvironmentScope, expectedId:string,program?:UnifiedPythonProgram):Promise<TerminalResult> {
    const key=environmentScopeKey(scope);
    return this.locked(key,async()=>{
      const current=this.records.get(key);
      if(!current||current.id!==expectedId)return {ok:false,reason:"ENVIRONMENT_NOT_FOUND"};
      if(current.state!=="running")return {ok:false,reason:"TRANSITION_IN_PROGRESS"};
      if(!this.runtime.openTerminal)return {ok:false,reason:"TERMINAL_RUNTIME_UNAVAILABLE"};
      if(current.terminalCount>=current.policy.limits.maxTerminals)return {ok:false,reason:"TERMINAL_LIMIT"};
      if(await this.inspect(current)!=="running")return {ok:false,reason:"RUNTIME_UNVERIFIED"};
      const slots=this.terminals.get(key)??new Map<string,UnifiedLinuxTerminal|null>();
      this.terminals.set(key,slots);
      const terminalId=`term_${randomUUID()}`;
      if(slots.has(terminalId))return {ok:false,reason:"TERMINAL_ID_COLLISION"};
      slots.set(terminalId,null);
      this.records.set(key,Object.freeze({...current,terminalCount:slots.size}));
      try {
        const terminal=await (program?this.runtime.openTerminal(this.identity(current),program):this.runtime.openTerminal(this.identity(current)));
        slots.set(terminalId,terminal);
        return {ok:true,terminalId,terminal};
      } catch {return {ok:false,reason:"TERMINAL_START_UNVERIFIED"};}
    });
  }
  /** Only confirmed exit frees capacity; no container or process is killed. */
  reapTerminal(scope:EnvironmentScope,expectedId:string,terminalId:string):Promise<boolean> {
    const key=environmentScopeKey(scope);
    return this.locked(key,async()=>{
      const current=this.records.get(key),slots=this.terminals.get(key);
      if(!current||current.id!==expectedId||current.state!=="running"||!slots)return false;
      const terminal=slots.get(terminalId);
      if(!terminal)return false;
      try {if(await terminal.exited()!==true)return false;}catch{return false;}
      try{terminal.disconnect();}catch{/* process exit already verified */}
      slots.delete(terminalId);
      this.records.set(key,Object.freeze({...current,terminalCount:slots.size}));
      return true;
    });
  }
  /** Explicit reset/end only; the caller must authenticate and validate user
   * confirmation bound to this exact environment ID. This does not create a new
   * environment, so a retry cannot destroy a successor. No idle-sweep wiring. */
  end(scope:EnvironmentScope, expectedId:string, confirmed:boolean, intent:"end"|"reset"="end"):Promise<EnvironmentResult> {
    const key=environmentScopeKey(scope);
    if(confirmed!==true)return Promise.resolve(blocked("CONFIRMATION_REQUIRED"));
    return this.locked(key,async()=>{
      const current=this.records.get(key);
      if(!current || current.id!==expectedId)return blocked("ENVIRONMENT_NOT_FOUND");
      if(intent==="reset" && !current.policy.capabilities.reset)return blocked("RESET_DENIED");
      if(!["running","cleanup_pending"].includes(current.state))return blocked("TRANSITION_IN_PROGRESS");
      const stopping=this.transition(key,current,"stopping");
      try {
        // A previous failed destroy may already have removed every resource.
        if(await this.inspect(stopping)!=="absent")await this.runtime.destroy(this.identity(stopping));
        if(await this.inspect(stopping)!=="absent")throw new Error("CLEANUP_UNVERIFIED");
        for(const terminal of this.terminals.get(key)?.values()??[]){try{terminal?.disconnect();}catch{/* owned resources verified absent */}}
        this.terminals.delete(key);
        this.records.delete(key);
        return {ok:true,action:"destroyed",environment:Object.freeze({...stopping,terminalCount:0,state:"stopped" as const})};
      } catch {
        this.transition(key,stopping,"cleanup_pending");return blocked("CLEANUP_UNVERIFIED");
      }
    });
  }
}
