/** Browser contract for the same-origin unified API. No legacy session operations. */
export type UnifiedLinuxClientConfig = Readonly<{ apiPath: '/sessions/unified' | '/api/run/pty/sessions/unified'; wsPrefix: '/sessions' | '/api/run/pty/sessions'; wsOrigin?: 'http://127.0.0.1:4317'; workspaceRead?: boolean; workspaceWrite?: boolean }>;
export type UnifiedOwner = {windowId:string;environmentId:string;windowGeneration:number};
/** Capability supplied only by the trusted Unified FullIDE host. Neither the
 * original header nor this binding starts a legacy runner. */
export type UnifiedRunControls = Readonly<{
  state:'idle'|'starting'|'running'; enabled:boolean; canStop:boolean;
  start:(fileId:string,visibleText:string)=>Promise<void>; stop:()=>void;
}>;
export type UnifiedRunTerminalState = Readonly<{
  owner:UnifiedOwner; canStart:boolean; terminalId:string|null; canStop:boolean;
  interrupt:()=>boolean;
}>;
export function unifiedRunAvailability(status:UnifiedStatus|null,busy:boolean){
  if(!status||status.status!=='current')return {canStart:false,terminalId:null};
  const program=status.terminals.find(t=>t.kind==='python');
  return {canStart:!busy&&!program&&status.terminalCount===status.terminals.length&&status.terminalCount<status.maxTerminals,terminalId:program?.terminalId??null};
}
export type UnifiedTerminalInfo={terminalId:string;connected:boolean;attachable:boolean;kind?:'python'};
export type UnifiedCompletedRun={terminalId:string;output:string};
export type UnifiedStatus = {status:'absent'} | {status:'conflict';environmentId:string;currentWindowId:string;windowGeneration:number} | {status:'current';environmentId:string;windowGeneration:number;terminalCount:number;maxTerminals:number;resetAllowed:boolean;terminals:UnifiedTerminalInfo[];recentRuns?:UnifiedCompletedRun[]};
export type UnifiedAction = ({action:'workspace';operation:'list'|'read'|'readBinary'|'mkdir'|'snapshot'|'listTrash';path:string}&UnifiedOwner) | ({action:'workspace';operation:'create';path:string;text:string}&UnifiedOwner) | ({action:'workspace';operation:'createBinary';path:string;data:string;sizeBytes:number}&UnifiedOwner) | ({action:'workspace';operation:'update';path:string;text:string;expectedRevision:string}&UnifiedOwner) | ({action:'workspace';operation:'move';path:string;destinationPath:string;expectedRevision:string}&UnifiedOwner) | ({action:'workspace';operation:'delete';path:string;expectedRevision:string}&UnifiedOwner) | ({action:'workspace';operation:'moveDirectory';path:string;destinationPath:string;expectedRevision:string}&UnifiedOwner) | ({action:'workspace';operation:'trashDirectory';path:string;expectedRevision:string}&UnifiedOwner) | ({action:'workspace';operation:'restoreDirectory';path:string;trashId:string}&UnifiedOwner) | ({action:'workspace';operation:'rmdir';path:string}&UnifiedOwner) | {action:'status'|'open';windowId:string} | ({action:'terminal'} & UnifiedOwner) | ({action:'run';path:string;expectedRevision:string}&UnifiedOwner) | ({action:'shellExit';terminalId:string}&UnifiedOwner) | ({action:'attach';terminalId:string}&UnifiedOwner) | ({action:'transfer';previousWindowId:string;confirmed:true}&UnifiedOwner) | ({action:'end';confirmed:true;intent:'end'|'reset'}&UnifiedOwner);
const obj=(x:unknown):Record<string,unknown>=>{if(!x||typeof x!=='object'||Array.isArray(x))throw Error('INVALID_RESPONSE');return x as Record<string,unknown>;};
export const terminalIdValid=(x:unknown):x is string=>typeof x==='string'&&/^term_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
const envIdValid=(x:unknown):x is string=>typeof x==='string'&&/^env_[a-zA-Z0-9_-]{8,128}$/.test(x);
const windowIdValid=(x:unknown):x is string=>typeof x==='string'&&/^window-[a-zA-Z0-9-]{8,96}$/.test(x);
const int=(x:unknown,min:number,max:number):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=min&&x<=max;
export function parseUnifiedStatus(raw:unknown):UnifiedStatus{
  const x=obj(raw);if(x.ok!==true)throw Error('STATUS_UNAVAILABLE');
  if(x.status==='absent')return {status:'absent'};
  if(!envIdValid(x.environmentId)||!int(x.windowGeneration,1,Number.MAX_SAFE_INTEGER))throw Error('INVALID_STATUS');
  const identity={environmentId:x.environmentId,windowGeneration:x.windowGeneration};
  if(x.status==='conflict'&&windowIdValid(x.currentWindowId))return {status:'conflict',...identity,currentWindowId:x.currentWindowId};
  if(x.status!=='current'||x.state!=='running'||!int(x.maxTerminals,1,8)||!int(x.terminalCount,0,x.maxTerminals)||typeof x.resetAllowed!=='boolean'||!Array.isArray(x.terminals)||x.terminals.length>x.terminalCount)throw Error('INVALID_STATUS');
  const seen=new Set<string>();const terminals=x.terminals.map(value=>{const t=obj(value);if(!terminalIdValid(t.terminalId)||seen.has(t.terminalId)||typeof t.connected!=='boolean'||typeof t.attachable!=='boolean'||(t.connected&&t.attachable)||(t.kind!==undefined&&t.kind!=='python'))throw Error('INVALID_TERMINAL_STATUS');seen.add(t.terminalId);return {terminalId:t.terminalId,connected:t.connected,attachable:t.attachable,...(t.kind==='python'?{kind:'python' as const}:{})};});
  if(x.recentRuns!==undefined&&(!Array.isArray(x.recentRuns)||x.recentRuns.length>2))throw Error('INVALID_RUN_HISTORY');
  const recentIds=new Set<string>();
  const recentRuns=(x.recentRuns??[]) as unknown[];
  const completed=recentRuns.map(value=>{const run=obj(value);if(!terminalIdValid(run.terminalId)||recentIds.has(run.terminalId)||seen.has(run.terminalId)||typeof run.output!=='string'||new TextEncoder().encode(run.output).length>4200||Object.keys(run).length!==2)throw Error('INVALID_RUN_HISTORY');recentIds.add(run.terminalId);return {terminalId:run.terminalId,output:run.output};});
  return {status:'current',...identity,terminalCount:x.terminalCount,maxTerminals:x.maxTerminals,resetAllowed:x.resetAllowed,terminals,...(x.recentRuns!==undefined?{recentRuns:completed}:{})};
}
export class UnifiedApiError extends Error{constructor(readonly reason:string,readonly status:number){super(reason);}}
export async function unifiedRequest(config:UnifiedLinuxClientConfig,body:UnifiedAction,signal:AbortSignal,request:typeof fetch=fetch):Promise<Record<string,unknown>>{
  if(!['/sessions/unified','/api/run/pty/sessions/unified'].includes(config.apiPath))throw Error('INVALID_API_PATH');
  const r=await request(config.apiPath,{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
  const x=obj(await r.json());if(!r.ok||x.ok!==true)throw new UnifiedApiError(typeof x.reason==='string'&&/^[A-Z0-9_]{1,100}$/.test(x.reason)?x.reason:'UNIFIED_REQUEST_UNAVAILABLE',r.status);
  return x;
}
/** Reset is an explicitly confirmed destructive transition, not an alias for
 * End. A successful old-environment teardown must be verified as absent before
 * minting a separate, freshly authenticated Open request. Never replay writes,
 * retry a failed reset or reuse the previous environment identity. */
export async function verifiedUnifiedResetAndReopen(
  config:UnifiedLinuxClientConfig, old:UnifiedOwner, signal:AbortSignal,
  onEnded:()=>void,
  request:typeof unifiedRequest=unifiedRequest,
):Promise<Extract<UnifiedStatus,{status:'current'}>>{
  const end=await request(config,{action:'end',...old,confirmed:true,intent:'reset'},signal);
  if(end.environmentId!==old.environmentId)throw Error('RESET_ACK_ID_MISMATCH');
  // The trusted backend acknowledges End only after verified resource removal.
  // Fence old editor/terminal authorization immediately, including on later failure.
  onEnded();
  const absence=parseUnifiedStatus(await request(config,{action:'status',windowId:old.windowId},signal));
  if(absence.status!=='absent')throw Error('RESET_ABSENCE_UNVERIFIED');
  const opened=await request(config,{action:'open',windowId:old.windowId},signal);
  if(!envIdValid(opened.environmentId)||opened.environmentId===old.environmentId||!int(opened.windowGeneration,1,Number.MAX_SAFE_INTEGER))throw Error('RESET_NEW_ID_UNVERIFIED');
  const fresh=parseUnifiedStatus(await request(config,{action:'status',windowId:old.windowId},signal));
  if(fresh.status!=='current'||fresh.environmentId!==opened.environmentId||fresh.environmentId===old.environmentId||fresh.windowGeneration!==opened.windowGeneration)throw Error('RESET_NEW_OWNER_UNVERIFIED');
  return fresh;
}

/** Same SHA-256 representation as the V6 contract. The baseline is the
 * content on which the draft was based, not a newly refreshed remote value. */
export async function unifiedTextRevision(text:string):Promise<string>{
  const bytes=new TextEncoder().encode(text);
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return 'sha256:'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
export function unifiedSocketUrl(config:UnifiedLinuxClientConfig,origin:string,terminalId:string,response:unknown){
  const u=new URL(origin),x=obj(response);if(u.origin!==origin||!['http:','https:'].includes(u.protocol)||(u.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname))||!['/sessions','/api/run/pty/sessions'].includes(config.wsPrefix)||!terminalIdValid(terminalId)||x.ok!==true||typeof x.attachToken!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(x.attachToken))throw Error('INVALID_ATTACH_RESPONSE');
  // The development bridge is a fixed, explicitly configured loopback target.
  // Never accept an upstream origin or URL from the attach response.
  if(config.wsOrigin!==undefined){
    if(config.wsOrigin!=='http://127.0.0.1:4317'||origin!=='http://localhost:3000'||config.apiPath!=='/api/run/pty/sessions/unified'||config.wsPrefix!=='/sessions')throw Error('INVALID_PILOT_SOCKET_ORIGIN');
    u.host='127.0.0.1:4317';
  }
  u.protocol=u.protocol==='https:'?'wss:':'ws:';u.pathname=`${config.wsPrefix}/${terminalId}/ws`;u.searchParams.set('token',x.attachToken);return u.toString();
}
export type WireFrame={type:'ready'}|{type:'complete';seq:number}|{type:'output';seq:number;chunk:string}|{type:'exit';seq:number}|{type:'pong'};
export function parseUnifiedFrame(raw:unknown,id:string):WireFrame{
  if(typeof raw!=='string'||raw.length>65536)throw Error('INVALID_FRAME');const x=obj(JSON.parse(raw));
  if(x.type==='ready'&&x.sessionId===id&&x.state==='waiting_for_input')return {type:'ready'};
  if(x.type==='admin_replay_complete'&&x.sessionId===id&&int(x.seq,0,Number.MAX_SAFE_INTEGER))return {type:'complete',seq:x.seq};
  if(x.type==='pong')return {type:'pong'};
  if(x.type==='event'){const ev=obj(x.event);if(int(ev.seq,1,Number.MAX_SAFE_INTEGER)){
    if(ev.type==='stdout'&&typeof ev.chunk==='string'&&ev.chunk.length<=8192)return {type:'output',seq:ev.seq,chunk:ev.chunk};
    if(ev.type==='status'&&ev.state==='completed')return {type:'exit',seq:ev.seq};
  }}throw Error('INVALID_FRAME');
}
/** Every connection replays the server's bounded history from its first retained
 * sequence. Never replay input. Missing older output must be explicit. */
export class UnifiedReplay {
  private phase:'initial'|'replay'|'live'|'closed'='initial';private wireLast:number|null=null;
  constructor(private last:number=0){if(!int(last,0,Number.MAX_SAFE_INTEGER))throw Error('INVALID_SEQUENCE');}
  accept(f:WireFrame):{ready?:true;output?:string;seq?:number;gap?:true;exit?:true;pong?:true}{
    if(this.phase==='closed')throw Error('FRAME_AFTER_EXIT');
    if(f.type==='ready'){if(this.phase!=='initial')throw Error('DUPLICATE_READY');this.phase='replay';return {};}
    if(this.phase==='initial')throw Error('FRAME_BEFORE_READY');
    if(f.type==='pong'){if(this.phase!=='live')throw Error('PONG_BEFORE_REPLAY');return {pong:true};}
    if(f.type==='complete'){
      if(this.phase!=='replay'||f.seq<this.last||(this.wireLast!==null?this.wireLast!==f.seq:f.seq!==0))throw Error('INVALID_REPLAY_COMPLETE');
      this.phase='live';return {ready:true};
    }
    if(this.wireLast!==null&&f.seq!==this.wireLast+1)throw Error('UNORDERED_FRAME');
    if(this.phase==='live'&&f.seq!==this.last+1)throw Error('LIVE_SEQUENCE_GAP');
    if(f.type==='exit'&&this.phase!=='live')throw Error('EXIT_BEFORE_REPLAY');
    this.wireLast=f.seq;
    if(f.seq<=this.last)return {};
    const gap=f.seq>this.last+1;this.last=f.seq;
    if(f.type==='exit'){this.phase='closed';return {exit:true,seq:f.seq};}
    return {output:f.chunk,seq:f.seq,...(gap?{gap:true as const}:{})};
  }
}
export function unifiedInputFrame(data:string):string|null{
  if(!data)return null;const enc=new TextEncoder();if(enc.encode(data).length>8192)return null;
  const raw=JSON.stringify({type:'input',data});return enc.encode(raw).length>16384?null:raw;
}
export function unifiedResizeFrame(cols:number,rows:number):string|null{
  if(!int(cols,1,500)||!int(rows,1,500))return null;return JSON.stringify({type:'resize',cols,rows});
}
let documentWindowId:string|undefined;
/** Do not share ownership identifiers via localStorage/sessionStorage: a cloned
 * tab may copy storage. A new document must explicitly confirm transfer. */
export function unifiedDocumentWindowId(){return documentWindowId??=("window-"+crypto.randomUUID());}
