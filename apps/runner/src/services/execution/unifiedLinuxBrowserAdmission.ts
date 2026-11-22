import type { UnifiedPythonProgram } from './unifiedLinuxEnvironmentManager.js';
import { randomBytes, createHash } from 'node:crypto';
import { environmentScopeKey, type EnvironmentScope } from './unifiedLinuxAdmission.js';
import type { UnifiedAdmissionContext, UnifiedLinuxAdmissionService } from './unifiedLinuxAdmissionService.js';
import { isUnifiedTerminalId } from './unifiedLinuxTerminalTransport.js';

type WindowBinding = {scope:EnvironmentScope; id:string; windowId:string; generation:number; retired:Set<string>};
type Ticket = {binding:WindowBinding; generation:number; terminalId:string; expiresAt:number};
export type UnifiedAttachAuthority = Readonly<{actor:string; mayAttach:()=>boolean; stillAllowed:()=>boolean}>;
export type UnifiedAttachGate = {consume:(id:string,token:string,origin:unknown)=>UnifiedAttachAuthority|null};
const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
const validWindow=(w:unknown):w is string=>typeof w==='string'&&/^window-[a-zA-Z0-9-]{8,96}$/.test(w);
const deny=(reason:string)=>({ok:false as const,reason});
/** Trusted Web/Runner composition only. Scope and policy MUST come from the
 * authenticated server, not the browser body. No default routes or startup.
 * Opaque one-time tickets are kept only as hashes and cannot be used as legacy
 * attach tokens. One instance per isolated runtime; process restart fails closed. */
export class UnifiedLinuxBrowserAdmission implements UnifiedAttachGate {
  private readonly bindings=new Map<string,WindowBinding>();
  private readonly tickets=new Map<string,Ticket>();
  private tail:Promise<unknown>=Promise.resolve();
  constructor(private readonly service:UnifiedLinuxAdmissionService, private readonly origin:string,
    private readonly now:()=>number=Date.now){
    const u=new URL(origin);
    if(u.origin!==origin||!(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))))throw Error('UNIFIED_ORIGIN_INVALID');
  }
  private serial<T>(fn:()=>Promise<T>):Promise<T>{const p=this.tail.catch(()=>undefined).then(fn);this.tail=p;return p;}
  private prune(){for(const [k,t] of this.tickets)if(t.expiresAt<=this.now()||!this.current(t.binding,t.generation))this.tickets.delete(k);}
  private current(b:WindowBinding,g:number){return this.bindings.get(environmentScopeKey(b.scope))===b&&b.generation===g&&this.service.currentEnvironmentId(b.scope)===b.id;}
  private binding(scope:EnvironmentScope,id:string,windowId:string,generation:number){
    const b=this.bindings.get(environmentScopeKey(scope));return b&&b.id===id&&b.windowId===windowId&&this.current(b,generation)?b:undefined;
  }
  open(context:UnifiedAdmissionContext,windowId:string,grant:unknown){
    const scope=Object.freeze({...context.scope});const key=environmentScopeKey(scope);
    return this.serial(async()=>{
      if(!validWindow(windowId))return deny('UNIFIED_WINDOW_INVALID');
      const old=this.bindings.get(key);
      if(old&&(old.retired.has(windowId)||(old.windowId!==windowId&&(this.service.currentEnvironmentId(scope)!==undefined||old.retired.size>=512))))return deny('UNIFIED_WINDOW_CONFLICT');
      if(!old&&this.bindings.size>=64)return deny('UNIFIED_WINDOW_LIMIT');
      const result=await this.service.open({...context,scope},grant);
      if(!result.ok)return result;
      const id=result.environment.id;
      if(old?.id!==id){
        // Service has confirmed a new identity. Never rotate ownership merely
        // because a connection timed out; old ticket bindings cannot match it.
        const retired=new Set(old?.retired);if(old&&old.windowId!==windowId)retired.add(old.windowId);
        this.bindings.set(key,{scope,id,windowId,generation:1,retired});
      }
      const b=this.bindings.get(key)!;this.prune();
      return {ok:true as const,environment:result.environment,action:result.action,windowGeneration:b.generation};
    });
  }
  /** Trusted authenticated caller: discover existing IDs without allocating.
   * A conflicting window receives a CAS tuple for an explicit transfer, not
   * an attach ticket. No guest or credentials are exposed. */
  status(scope:EnvironmentScope,windowId:string){
    if(!validWindow(windowId))return deny('UNIFIED_WINDOW_INVALID');
    const b=this.bindings.get(environmentScopeKey(scope)),id=this.service.currentEnvironmentId(scope);
    if(!id)return {ok:true as const,status:'absent' as const};
    if(!b||b.id!==id)return deny('UNIFIED_ENVIRONMENT_UNAVAILABLE');
    const info=this.service.browserStatus(scope,id);
    if(!info)return deny('UNIFIED_ENVIRONMENT_UNAVAILABLE');
    if(b.retired.has(windowId))return deny('UNIFIED_WINDOW_FORBIDDEN');
    if(b.windowId!==windowId)return {ok:true as const,status:'conflict' as const,environmentId:id,currentWindowId:b.windowId,windowGeneration:b.generation};
    return {ok:true as const,status:'current' as const,...info,windowGeneration:b.generation};
  }
  end(scope:EnvironmentScope,id:string,windowId:string,generation:number,confirmed:boolean,intent:'end'|'reset'){
    scope=Object.freeze({...scope});
    return this.serial(async()=>{
      if(!this.binding(scope,id,windowId,generation))return deny('UNIFIED_WINDOW_FORBIDDEN');
      const result=await this.service.end(scope,id,confirmed,intent);
      this.prune();
      return result.ok?{ok:true as const,environmentId:id}:result;
    });
  }
  openTerminal(scope:EnvironmentScope,id:string,windowId:string,generation:number,program?:UnifiedPythonProgram){
    scope=Object.freeze({...scope});
    return this.serial(async()=>{
      if(!this.binding(scope,id,windowId,generation))return deny('UNIFIED_WINDOW_FORBIDDEN');
      return program?this.service.openTerminal(scope,id,program):this.service.openTerminal(scope,id);
    });
  }
  /** The same authenticated window owns the selected live shell. No new
   * attach ticket is minted; server-side scope and terminal ID remain final. */
  closeShell(scope:EnvironmentScope,id:string,windowId:string,generation:number,terminalId:string){
    scope=Object.freeze({...scope});
    return this.serial(async()=>{
      if(!this.binding(scope,id,windowId,generation)||!isUnifiedTerminalId(terminalId)
         ||!this.service.authorizeEnvironment(scope,id))return deny('SHELL_EXIT_FORBIDDEN');
      return this.service.requestShellExit(scope,id,terminalId);
    });
  }
  /** Serialize authorized workspace mutations with explicit window transfer and end/reset.
   * Authorization loss from an independent lifecycle sweep still fences the
   * result; an already-started guest operation can have completed. */
  workspaceMutation<T extends {ok:boolean}>(scope:EnvironmentScope,id:string,windowId:string,generation:number,run:()=>Promise<T>){
    scope=Object.freeze({...scope});
    return this.serial(async()=>{
      const allowed=()=>!!this.binding(scope,id,windowId,generation)&&this.service.authorizeEnvironment(scope,id);
      if(!allowed())return deny('UNIFIED_WORKSPACE_FORBIDDEN');
      const result=await run();
      return allowed()?result:deny('UNIFIED_WORKSPACE_FORBIDDEN');
    });
  }
  issueAttach(scope:EnvironmentScope,id:string,windowId:string,generation:number,terminalId:string){
    this.prune();const b=this.binding(scope,id,windowId,generation);
    if(!b||!isUnifiedTerminalId(terminalId)||!this.service.authorizeAttach(scope,id,terminalId))return deny('UNIFIED_ATTACH_FORBIDDEN');
    if(this.tickets.size>=512)return deny('UNIFIED_ATTACH_LIMIT');
    // At most one outstanding ticket per terminal; refresh invalidates old.
    for(const [k,t] of this.tickets)if(t.terminalId===terminalId)this.tickets.delete(k);
    const token=randomBytes(32).toString('base64url'),expiresAt=this.now()+30_000;
    this.tickets.set(hash(token),{binding:b,generation,terminalId,expiresAt});
    return {ok:true as const,attachToken:token,expiresAt};
  }
  consume(id:string,token:string,origin:unknown):UnifiedAttachAuthority|null {
    if(origin!==this.origin||!isUnifiedTerminalId(id)||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
    this.prune();const k=hash(token),t=this.tickets.get(k);if(!t||t.terminalId!==id)return null;
    this.tickets.delete(k); // synchronous consumption before upgrade
    // The bearer ticket expires before upgrade. Its 30-second lifetime must
    // NOT terminate an established interactive terminal session.
    const mayAttach=()=>this.now()<t.expiresAt&&this.current(t.binding,t.generation)
      &&this.service.authorizeAttach(t.binding.scope,t.binding.id,id);
    const stillAllowed=()=>this.current(t.binding,t.generation)
      &&this.service.authorizeTerminalSession(t.binding.scope,t.binding.id,id);
    return mayAttach()?{actor:t.binding.scope.actorId,mayAttach,stillAllowed}:null;
  }
  /** Explicit authenticated transfer with compare-and-swap. No PTY exit or
   * guest deletion. Old window and tickets are retired for process lifetime.
   * Caller must independently establish that the new window is authenticated. */
  transfer(scope:EnvironmentScope,id:string,oldWindow:string,generation:number,newWindow:string,confirmed:boolean){
    scope=Object.freeze({...scope});
    return this.serial(async()=>{
      const b=this.binding(scope,id,oldWindow,generation);
      if(!b||confirmed!==true||!validWindow(newWindow)||newWindow===oldWindow||b.retired.has(newWindow)||b.retired.size>=512||!this.service.authorizeEnvironment(scope,id))return deny('UNIFIED_TRANSFER_FORBIDDEN');
      b.retired.add(oldWindow);b.windowId=newWindow;b.generation++;
      this.prune();this.service.transport.fenceEnvironmentPeers(scope,id);
      return {ok:true as const,windowGeneration:b.generation};
    });
  }
}
