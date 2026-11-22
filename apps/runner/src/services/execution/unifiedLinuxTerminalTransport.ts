import { StringDecoder } from 'node:string_decoder';
import { environmentScopeKey, type EnvironmentScope } from './unifiedLinuxAdmission.js';
import { UnifiedLinuxEnvironmentManager, type UnifiedLinuxTerminal, type UnifiedPythonProgram } from './unifiedLinuxEnvironmentManager.js';

// Existing browser wire format; not registered in the legacy session store.
type Event = {seq:number;ts:string;type:'stdout';chunk:string};
export interface UnifiedTerminalPeer {
  send(frame:unknown):boolean; // false on backpressure or disconnected socket
  close(code:number,reason:string):void;
}
type CompletedRun = Readonly<{scope:EnvironmentScope;environmentId:string;terminalId:string;output:string;completedAt:number}>;
type Entry = {scope:EnvironmentScope; environmentId:string; terminalId:string; terminal:UnifiedLinuxTerminal;
  authorize:()=>boolean; kind?:'python'; seq:number; events:Event[]; bytes:number; decoder:StringDecoder;
  peer:UnifiedTerminalPeer|null; unavailable:boolean; reaping:Promise<boolean>|null; resizing:boolean;
  pythonStartSent:boolean; shellExitRequested:boolean;
  data:(chunk:Buffer|string)=>void; ended:()=>void; failed:()=>void};
const MAX_BYTES=64*1024, MAX_EVENTS=256, MAX_INPUT=8192;
// A single authorized browser PTY connection starts the Python guest by
// sending a blank line to its TTY. No magic stdout readiness marker is parsed.
// Ordinary interactive shells never receive this signal.
const PYTHON_START_SIGNAL='\n';
// Bounded ephemeral, authorized output projection; never a terminal reservation.
const RUN_HISTORY_BYTES=4096, RUN_HISTORY_COUNT=2, RUN_HISTORY_TTL=10*60_000;
export const isUnifiedTerminalId=(id:string)=>/^term_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
/** Only a trusted server composition may instantiate this transport and create
 * terminals. authorize must synchronously check current grant, scope lease,
 * revocation and environment deadline, not just a captured login boolean.
 * No default instance or public creation/reattach-token endpoint exists here. */
export class UnifiedLinuxTerminalTransport {
  private readonly entries=new Map<string,Entry>();
  private readonly completed:CompletedRun[]=[];
  private pending=0;
  constructor(private readonly manager:UnifiedLinuxEnvironmentManager, private readonly maxEntries=128){
    if(!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>1024)throw Error('TERMINAL_TRANSPORT_LIMIT_INVALID');
  }
  private owned(e:Entry){return this.manager.ownsTerminal(e.scope,e.environmentId,e.terminalId,e.terminal);}
  private allowed(e:Entry){try{return !e.unavailable&&this.owned(e)&&e.authorize()===true;}catch{return false;}}
  private close(e:Entry,code:number,reason:string){const p=e.peer;e.peer=null;try{p?.close(code,reason);}catch{/* transport only */}}
  private send(e:Entry,frame:unknown){
    if(!this.allowed(e)){this.close(e,1008,'Terminal authorization required');return false;}
    if(!e.peer)return false;
    try{if(e.peer.send(frame))return true;}catch{/* transport only */}
    this.close(e,1013,'Terminal transport backpressure');return false;
  }
  private append(e:Entry,chunk:string){
    if(!chunk)return;
    const event:Event={type:'stdout',chunk,seq:++e.seq,ts:new Date().toISOString()};
    e.events.push(event);e.bytes+=Buffer.byteLength(chunk);
    while(e.bytes>MAX_BYTES||e.events.length>MAX_EVENTS){const old=e.events.shift()!;e.bytes-=Buffer.byteLength(old.chunk);}
    if(e.peer)this.send(e,{type:'event',event});
  }
  private trimCompleted(){
    const now=Date.now();
    for(let i=this.completed.length-1;i>=0;i--)if(now-this.completed[i]!.completedAt>RUN_HISTORY_TTL)this.completed.splice(i,1);
    while(this.completed.length>this.maxEntries*RUN_HISTORY_COUNT)this.completed.shift();
  }
  private archiveRun(e:Entry){
    if(e.kind!=='python')return;
    this.trimCompleted();
    // Retain only bounded UTF-8 text of verified, completed Python runs.
    const raw=e.events.map(v=>v.chunk).join('');
    // Never display an empty successful run when the private start gate was
    // not acknowledged. This is a diagnostic, not proof the script ran.
    const transcript=raw||(e.pythonStartSent
      ?'[Python run ended without captured output; inspect authorized terminal transport.]\r\n'
      :'[Python run did not start: no authorized terminal attachment.]\r\n');
    const data=Buffer.from(transcript,'utf8');
    let slice=data.subarray(Math.max(0,data.length-RUN_HISTORY_BYTES));
    // Avoid replacement-byte corruption at a clipped UTF-8 boundary.
    while(slice.length&&slice[0]! >=0x80&&slice[0]! <=0xbf)slice=slice.subarray(1);
    // The private Web bridge also caps JSON response bytes: control characters
    // can expand sixfold when serialized. Bound the JSON form, not only UTF-8.
    const marker='[Earlier output truncated]\r\n';
    const chars=Array.from(slice.toString('utf8'));
    let truncated=data.length>slice.length,discard=0;
    const tail=(i:number)=>chars.slice(i).join('');
    const encodedSize=(text:string)=>Buffer.byteLength(JSON.stringify(text),'utf8');
    if(encodedSize((truncated?marker:'')+tail(0))>RUN_HISTORY_BYTES){
      truncated=true;let lo=0,hi=chars.length;
      while(lo<hi){const mid=Math.floor((lo+hi)/2);if(encodedSize(marker+tail(mid))>RUN_HISTORY_BYTES)lo=mid+1;else hi=mid;}
      discard=lo;
    }
    const output=(truncated?marker:'')+tail(discard);
    const key=environmentScopeKey(e.scope);
    for(let i=this.completed.length-1;i>=0;i--)if(this.completed[i]!.environmentId===e.environmentId&&environmentScopeKey(this.completed[i]!.scope)===key&&this.completed[i]!.terminalId===e.terminalId)this.completed.splice(i,1);
    this.completed.push(Object.freeze({scope:e.scope,environmentId:e.environmentId,terminalId:e.terminalId,output,completedAt:Date.now()}));
    const same=()=>this.completed.map((v,i)=>({v,i})).filter(({v})=>v.environmentId===e.environmentId&&environmentScopeKey(v.scope)===key);
    for(const x of same().slice(0,Math.max(0,same().length-RUN_HISTORY_COUNT)).reverse())this.completed.splice(x.i,1);
    this.trimCompleted();
  }
  /** Only project output to the exact authenticated environment scope. */
  completedRunsScoped(scope:EnvironmentScope,environmentId:string){
    this.trimCompleted();const key=environmentScopeKey(scope);
    return this.completed.filter(e=>e.environmentId===environmentId&&environmentScopeKey(e.scope)===key)
      .map(e=>({terminalId:e.terminalId,output:e.output}));
  }
  forgetCompleted(scope:EnvironmentScope,environmentId:string){
    const key=environmentScopeKey(scope);
    for(let i=this.completed.length-1;i>=0;i--)if(this.completed[i]!.environmentId===environmentId&&environmentScopeKey(this.completed[i]!.scope)===key)this.completed.splice(i,1);
  }
  private drop(e:Entry){
    this.close(e,1000,'Terminal completed');
    e.terminal.stream.removeListener('data',e.data);e.terminal.stream.removeListener('end',e.ended);
    e.terminal.stream.removeListener('close',e.ended);e.terminal.stream.removeListener('error',e.failed);
    this.entries.delete(e.terminalId);e.events=[];e.bytes=0;
  }
  /** Uses manager admission and the exact returned PTY. Never starts a guest. */
  async openTerminal(scope:EnvironmentScope,environmentId:string,authorize:()=>boolean,program?:UnifiedPythonProgram):Promise<{ok:true;terminalId:string}|{ok:false;reason:string}>{
    environmentScopeKey(scope);scope=Object.freeze({...scope});
    try{if(authorize()!==true)return {ok:false,reason:'TERMINAL_FORBIDDEN'};}catch{return {ok:false,reason:'TERMINAL_FORBIDDEN'};}
    if(this.entries.size+this.pending>=this.maxEntries)return {ok:false,reason:'TERMINAL_TRANSPORT_LIMIT'};
    this.pending++;
    try{
      const result=await (program?this.manager.attachTerminal(scope,environmentId,program):this.manager.attachTerminal(scope,environmentId));
      if(!result.ok)return result;
      const {terminal,terminalId}=result;
      const e:Entry={scope,environmentId,terminalId,terminal,authorize,...(program?{kind:'python' as const}:{}),seq:0,events:[],bytes:0,decoder:new StringDecoder('utf8'),peer:null,unavailable:false,reaping:null,resizing:false,pythonStartSent:false,shellExitRequested:false,
        data:(chunk)=>{
          if(e.unavailable)return;
          if(!this.owned(e)){this.close(e,1008,'Terminal authorization required');return;}
          // Temporary authority loss is not evidence of a dead PTY.
          // Keep bounded output server-side; never send it to an unauthorized peer.
          if(!this.allowed(e))this.close(e,1008,'Terminal authorization required');
          const buffer=typeof chunk==='string'?Buffer.from(chunk):chunk;
          for(let i=0;i<buffer.length;i+=4096)
            this.append(e,e.decoder.write(buffer.subarray(i,i+4096)));
        },ended:()=>{void this.finish(e);},failed:()=>{void this.finish(e);}};
      this.entries.set(terminalId,e);
      terminal.stream.on('error',e.failed);terminal.stream.on('end',e.ended);terminal.stream.on('close',e.ended);terminal.stream.on('data',e.data);
      const state=terminal.stream as NodeJS.ReadWriteStream & {destroyed?:boolean;readableEnded?:boolean};
      if(state.destroyed||state.readableEnded)void this.finish(e);
      if(!this.allowed(e))return {ok:false,reason:'TERMINAL_UNAVAILABLE'};
      return {ok:true,terminalId};
    }finally{this.pending--;}
  }
  /** Retain the run slot while a known transport awaits verified exit. */
  hasPythonRun(scope:EnvironmentScope,environmentId:string):boolean{
    const key=environmentScopeKey(scope);
    return [...this.entries.values()].some(e=>e.kind==='python'&&e.environmentId===environmentId&&environmentScopeKey(e.scope)===key);
  }
  /** Only trusted callers may enumerate terminals for an authorized exact scope.
   * Unknown/exiting PTYs keep their manager slot but are not attachable. */
  listScoped(scope:EnvironmentScope,environmentId:string){
    const key=environmentScopeKey(scope);
    return [...this.entries.values()].filter(e=>e.environmentId===environmentId&&environmentScopeKey(e.scope)===key&&this.allowed(e))
      .map(e=>({terminalId:e.terminalId,connected:e.peer!==null,attachable:e.peer===null&&!e.resizing,...(e.kind?{kind:e.kind}:{})}));
  }
  canConnect(id:string,actor:string):boolean {
    const e=this.entries.get(id);return !!e&&e.scope.actorId===actor&&!e.peer&&!e.resizing&&this.allowed(e);
  }
  /** Validity of an existing terminal session is independent of whether the
   * terminal can accept a *new* peer. This does not issue attach tickets. */
  ownsLiveTerminalScoped(id:string,scope:EnvironmentScope,environmentId:string):boolean {
    const e=this.entries.get(id);
    return !!e&&!e.unavailable&&e.environmentId===environmentId
      &&environmentScopeKey(e.scope)===environmentScopeKey(scope)&&this.allowed(e);
  }
  /** Trusted attach-token issuer must check the whole environment scope. */
  canConnectScoped(id:string,scope:EnvironmentScope,environmentId:string):boolean {
    const e=this.entries.get(id);
    return !!e&&e.environmentId===environmentId&&environmentScopeKey(e.scope)===environmentScopeKey(scope)&&this.canConnect(id,scope.actorId);
  }
  /** Caller must already have verified a one-time token bound to id and actor.
   * Concurrent sockets are rejected, not silently transferred. */
  connect(id:string,actor:string,peer:UnifiedTerminalPeer):boolean {
    const e=this.entries.get(id);if(!e||!this.canConnect(id,actor))return false;
    e.peer=peer;
    if(!this.send(e,{type:'ready',sessionId:id,state:'waiting_for_input'}))return false;
    for(const event of e.events)if(!this.send(e,{type:'event',event}))return false;
    if(!this.send(e,{type:'admin_replay_complete',sessionId:id,seq:e.seq}))return false;
    // The one-time attach ticket has already been consumed and the live peer
    // was authorized. Start only after its ready/replay frames are accepted.
    // This also ensures the PTY data listener is installed before execution.
    if(e.kind==='python'&&!e.pythonStartSent){
      if(e.peer!==peer||!this.allowed(e))return false;
      const stream=e.terminal.stream as NodeJS.ReadWriteStream & {destroyed?:boolean;writableNeedDrain?:boolean};
      if(stream.destroyed||stream.writable===false||stream.writableNeedDrain){
        this.close(e,1013,'Python start transport unavailable');return false;
      }
      e.pythonStartSent=true; // fence concurrent or repeated connections
      try{
        if(!stream.write(Buffer.from(PYTHON_START_SIGNAL,'ascii'))){
          this.close(e,1013,'Python start transport backpressure');return false;
        }
      }catch{this.close(e,1013,'Python start transport unavailable');return false;}
    }
    return true;
  }
  /** Cooperative shell exit for the exact authenticated live PTY. This only
   * requests EOF (Ctrl+D) from the selected shell; it is NOT a force kill and
   * NEVER releases capacity until the manager verifies process exit. If a
   * foreground program consumes EOF instead, the shell stays reserved. */
  requestShellExitScoped(scope:EnvironmentScope,environmentId:string,terminalId:string):{ok:true;pending:true}|{ok:false;reason:string}{
    if(!isUnifiedTerminalId(terminalId))return {ok:false,reason:'SHELL_EXIT_FORBIDDEN'};
    const e=this.entries.get(terminalId);
    if(!e||e.kind==='python'||e.environmentId!==environmentId
       ||environmentScopeKey(e.scope)!==environmentScopeKey(scope)||!this.allowed(e))return {ok:false,reason:'SHELL_EXIT_FORBIDDEN'};
    if(e.shellExitRequested)return {ok:false,reason:'SHELL_EXIT_ALREADY_REQUESTED'};
    if(!e.peer||e.reaping)return {ok:false,reason:'SHELL_EXIT_NOT_CONNECTED'};
    const stream=e.terminal.stream as NodeJS.ReadWriteStream & {destroyed?:boolean;writableNeedDrain?:boolean};
    if(stream.destroyed||stream.writable===false||stream.writableNeedDrain)return {ok:false,reason:'SHELL_EXIT_TRANSPORT_UNAVAILABLE'};
    e.shellExitRequested=true; // one request per live shell, including ambiguous writes
    try{
      if(!stream.write(Buffer.from([4])))return {ok:false,reason:'SHELL_EXIT_DELIVERY_UNVERIFIED'};
      return {ok:true,pending:true};
    }catch{return {ok:false,reason:'SHELL_EXIT_DELIVERY_UNVERIFIED'};}
  }
  /** Trusted ownership transfer: fence connections synchronously, retain PTYs
   * and their replay. An in-flight resize still blocks new attachment. */
  fenceEnvironmentPeers(scope:EnvironmentScope,environmentId:string):void {
    const key=environmentScopeKey(scope);
    for(const e of this.entries.values())if(e.environmentId===environmentId&&environmentScopeKey(e.scope)===key)this.close(e,1008,'IDE ownership transferred');
  }
  disconnect(id:string,peer:UnifiedTerminalPeer):void {
    const e=this.entries.get(id);if(e?.peer===peer)e.peer=null;
    // Do not destroy stream, kill shell, release quota or end environment.
  }
  async receive(id:string,peer:UnifiedTerminalPeer,raw:string):Promise<void>{
    const e=this.entries.get(id);if(!e||e.peer!==peer)return;
    if(!this.allowed(e)){this.close(e,1008,'Terminal authorization required');return;}
    try{
      if(Buffer.byteLength(raw)>16384)throw Error('FRAME_LIMIT');
      const m=JSON.parse(raw) as {type?:unknown;data?:unknown;rows?:unknown;cols?:unknown};
      if(!m||typeof m!=='object'||Array.isArray(m))throw Error('FRAME_INVALID');
      if(m.type==='ping'){this.send(e,{type:'pong'});return;}
      if(m.type==='cancel'){this.close(e,1000,'Terminal detached');return;}
      if(m.type==='input'){
        if(typeof m.data!=='string'||Buffer.byteLength(m.data)>MAX_INPUT)throw Error('INPUT_INVALID');
        // Same-turn ownership + trusted authorization check before write. Stop
        // accepting bytes while the OS transport is backpressured.
        const s=e.terminal.stream as NodeJS.ReadWriteStream & {writableNeedDrain?:boolean;destroyed?:boolean};
        if(s.destroyed||s.writable===false||s.writableNeedDrain){this.close(e,1013,'Terminal input backpressure');return;}
        if(!s.write(Buffer.from(m.data)))this.close(e,1013,'Terminal input backpressure');
        return;
      }
      if(m.type==='resize'){
        const {rows,cols}=m;
        if(typeof rows!=='number'||typeof cols!=='number'||![rows,cols].every(n=>Number.isSafeInteger(n)&&n>=1&&n<=500))throw Error('SIZE_INVALID');
        if(e.resizing)return;
        e.resizing=true;try{await e.terminal.resize(rows,cols);}finally{e.resizing=false;}
        return;
      }
      throw Error('FRAME_INVALID');
    }catch{if(e.peer===peer)this.close(e,1008,'Invalid or unavailable terminal operation');}
  }
  private finish(e:Entry):Promise<boolean>{
    if(e.reaping)return e.reaping;
    // End/error can precede Docker's confirmation; keep capacity and deny
    // replay or input on the broken transport until explicit reconciliation.
    if(!e.unavailable){this.append(e,e.decoder.end());e.unavailable=true;}
    const task=Promise.resolve().then(async()=>{
      if(await this.manager.reapTerminal(e.scope,e.environmentId,e.terminalId)){
        // A verified shell exit is not an environment exit. Emit completion
        // only to a still-authorized peer bound to the same environment.
        const current=this.manager.get(e.scope);
        try{if(e.peer&&current?.id===e.environmentId&&current.state==='running'&&e.authorize()===true)
          e.peer.send({type:'event',event:{type:'status',state:'completed',seq:++e.seq,ts:new Date().toISOString()}});}catch{/* transport only */}
        this.archiveRun(e);
        this.drop(e);return true;
      }
      if(!this.owned(e)){ // only forget a record when its environment ID is gone, not when merely stopping
        const now=this.manager.get(e.scope);if(!now||now.id!==e.environmentId){this.drop(e);return true;}
      }
      this.close(e,1012,'Terminal exit unverified');return false;
    }).catch(()=>{this.close(e,1012,'Terminal exit unverified');return false;}).finally(()=>{e.reaping=null;});
    e.reaping=task;return task;
  }
  /** Trusted lifecycle caller may retry after a lost process-exit acknowledgement.
   * A failed authorization alone does not prove a guest or shell has exited. */
  async reconcile():Promise<void>{
    for(const e of this.entries.values()){
      if(!this.allowed(e)&&!e.unavailable)this.close(e,1008,'Terminal authorization required');
      if(e.unavailable||!this.owned(e))await this.finish(e);
    }
  }
}
