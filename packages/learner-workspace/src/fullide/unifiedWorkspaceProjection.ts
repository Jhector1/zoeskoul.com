/** Bounded read-only projection of a disposable guest. Never writes to a guest
 * or to the existing project/draft stores. A scan is not an atomic snapshot. */
import type { FSNode, WorkspaceStateV2 } from "../ide/types";
import { resolveWorkspaceFileCapability } from "@zoeskoul/code-contracts";
import { unifiedRequest, UnifiedApiError, parseUnifiedStatus, type UnifiedLinuxClientConfig, type UnifiedOwner } from "../runner/components/unifiedLinuxClient";
export type GuestNode={path:string;kind:"directory"}|{path:string;kind:"file";text:string}|{path:string;kind:"file";encoding:"base64";data:string;sizeBytes:number};
const MAX_NODES=48, MAX_REQUESTS=64;
function validPath(path:string){return path.length<=128&&!/[\x00-\x1f\x7f]/.test(path)&&path.split('/').length<=8&&path.split('/').every(p=>/^[A-Za-z0-9_][A-Za-z0-9_. -]{0,63}$/.test(p)&&!['node_modules','__pycache__'].includes(p));}
function identity(owner:UnifiedOwner,path:string){return `${owner.environmentId}-${Array.from(path,c=>c.charCodeAt(0).toString(16).padStart(2,"0")).join("")}`;}
export function emptyUnifiedWorkspace():WorkspaceStateV2{return {version:2,language:"bash",nodes:[],activeFileId:"",entryFileId:"",openTabs:[],expanded:[],stdin:"",leftPct:26};}
export function projectUnifiedWorkspace(owner:UnifiedOwner,items:GuestNode[],prior:WorkspaceStateV2|null):WorkspaceStateV2{
    const nodes:FSNode[]=items.map(item=>{
        const parts=item.path.split('/');const name=parts.pop()!;const parentId=parts.length?identity(owner,parts.join('/')):null;
        const common={id:identity(owner,item.path),name,parentId,createdAt:0,updatedAt:0};
        return item.kind==='directory'?{...common,kind:'folder'}:'text' in item?{...common,kind:'file',content:item.text}:{...common,kind:'file',content:'',binary:{encoding:'base64',data:item.data,sizeBytes:item.sizeBytes,mimeType:resolveWorkspaceFileCapability(item.path)?.mimeType??'application/octet-stream'}};
    });
    const files=nodes.filter(n=>n.kind==='file');const ids=new Set(files.map(n=>n.id));
    const active=prior&&ids.has(prior.activeFileId)?prior.activeFileId:files[0]?.id??'';
    const entry=prior&&ids.has(prior.entryFileId)?prior.entryFileId:active;
    const tabs=(prior?.openTabs??[]).filter(id=>ids.has(id));if(active&&!tabs.includes(active))tabs.push(active);
    return {...emptyUnifiedWorkspace(),nodes,activeFileId:active,entryFileId:entry,openTabs:tabs,expanded:nodes.filter(n=>n.kind==='folder').map(n=>n.id),leftPct:prior?.leftPct??26};
}
export async function readUnifiedWorkspace(config:UnifiedLinuxClientConfig,owner:UnifiedOwner,signal:AbortSignal,request:typeof unifiedRequest=unifiedRequest):Promise<{nodes:GuestNode[];limited:boolean}>{
    const nodes:GuestNode[]=[];const dirs=[''];let limited=false,requests=0;
    async function call(operation:'list'|'read',path:string){if(signal.aborted)throw Error('ABORTED');requests++;return request(config,{action:'workspace',...owner,operation,path},signal);}
    while(dirs.length&&nodes.length<MAX_NODES&&requests<MAX_REQUESTS){
        const dir=dirs.shift()!;const raw=await call('list',dir);
        if(!Array.isArray(raw.entries)||raw.entries.length>64||typeof raw.truncated!=='boolean')throw Error('INVALID_WORKSPACE_RESPONSE');
        limited||=raw.truncated;const seen=new Set<string>();
        const entries=raw.entries.map(x=>{if(!x||typeof x.name!=='string'||x.name.includes('/')||!['directory','file'].includes(x.kind))throw Error('INVALID_WORKSPACE_RESPONSE');const path=dir?dir+'/'+x.name:x.name;if(!validPath(path)||seen.has(path))throw Error('INVALID_WORKSPACE_RESPONSE');seen.add(path);return {path,kind:x.kind as 'directory'|'file'};});
        entries.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
        for(const item of entries){
            if(nodes.length>=MAX_NODES||requests>=MAX_REQUESTS){limited=true;break;}
            if(item.kind==='directory'){nodes.push({path:item.path,kind:'directory'});dirs.push(item.path);continue;}
            try{const raw=await call('read',item.path);if(typeof raw.text!=='string'||raw.text.includes('\0')||new TextEncoder().encode(raw.text).length>32768)throw Error('INVALID_WORKSPACE_RESPONSE');nodes.push({path:item.path,kind:'file',text:raw.text});}
            catch(e){if(e instanceof UnifiedApiError&&e.reason==='UNIFIED_FILE_UNAVAILABLE'){limited=true;continue;}throw e;}
        }
    }
    limited||=dirs.length>0;
    if(signal.aborted)throw Error('ABORTED');
    const status=parseUnifiedStatus(await request(config,{action:'status',windowId:owner.windowId},signal));
    if(signal.aborted||status.status!=='current'||status.environmentId!==owner.environmentId||status.windowGeneration!==owner.windowGeneration)throw Error('WORKSPACE_OWNERSHIP_CHANGED');
    return {nodes,limited};
}

/** One bounded guest exec, followed by authenticated owner verification. */
/** Independent browser-side check; neither a guest string nor a JSON transport
 * body may be trusted as binary data without exact canonical round trip. */
export function validUnifiedSnapshotBinary(value:unknown,sizeBytes:unknown):value is string {
    if(typeof value!=='string'||typeof sizeBytes!=='number'||!Number.isSafeInteger(sizeBytes)||sizeBytes<0||sizeBytes>32768||value.length!==Math.ceil(sizeBytes/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))return false;
    try{const decoded=atob(value);return decoded.length===sizeBytes&&btoa(decoded)===value;}catch{return false;}
}
export async function readUnifiedWorkspaceSnapshot(config:UnifiedLinuxClientConfig,owner:UnifiedOwner,signal:AbortSignal,request:typeof unifiedRequest=unifiedRequest):Promise<{nodes:GuestNode[];limited:boolean}>{
    if(signal.aborted)throw Error('ABORTED');
    const raw=await request(config,{action:'workspace',...owner,operation:'snapshot',path:''},signal);
    if(!Array.isArray(raw.nodes)||raw.nodes.length>MAX_NODES||typeof raw.truncated!=='boolean'||new TextEncoder().encode(JSON.stringify(raw)).length>384*1024)throw Error('INVALID_WORKSPACE_RESPONSE');
    const nodes:GuestNode[]=[],seen=new Set<string>(),dirs=new Set<string>();
    for(const n of raw.nodes){if(!n||typeof n.path!=='string'||!validPath(n.path)||seen.has(n.path))throw Error('INVALID_WORKSPACE_RESPONSE');const parent=n.path.includes('/')?n.path.slice(0,n.path.lastIndexOf('/')):'';if(parent&&!dirs.has(parent))throw Error('INVALID_WORKSPACE_RESPONSE');seen.add(n.path);
        if(n.kind==='directory'){dirs.add(n.path);nodes.push({path:n.path,kind:'directory'});}
        else if(n.kind==='file'&&typeof n.text==='string'&&!n.text.includes('\0')&&new TextEncoder().encode(n.text).length<=32768)nodes.push({path:n.path,kind:'file',text:n.text});
        else if(n.kind==='file'&&n.encoding==='base64'&&validUnifiedSnapshotBinary(n.data,n.sizeBytes))nodes.push({path:n.path,kind:'file',encoding:'base64',data:n.data,sizeBytes:n.sizeBytes});
        else throw Error('INVALID_WORKSPACE_RESPONSE');
    }
    if(signal.aborted)throw Error('ABORTED');
    const status=parseUnifiedStatus(await request(config,{action:'status',windowId:owner.windowId},signal));
    if(signal.aborted||status.status!=='current'||status.environmentId!==owner.environmentId||status.windowGeneration!==owner.windowGeneration)throw Error('WORKSPACE_OWNERSHIP_CHANGED');
    return {nodes,limited:raw.truncated};
}
