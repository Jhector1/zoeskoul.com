import {describe,it,expect} from 'vitest';
import {readUnifiedWorkspace,readUnifiedWorkspaceSnapshot,projectUnifiedWorkspace,emptyUnifiedWorkspace} from './unifiedWorkspaceProjection';
import {UnifiedApiError,type UnifiedAction,type UnifiedLinuxClientConfig,type unifiedRequest} from '../runner/components/unifiedLinuxClient';
const config:UnifiedLinuxClientConfig={apiPath:'/sessions/unified',wsPrefix:'/sessions'};
const owner={windowId:'window-12345678',environmentId:'env_12345678',windowGeneration:1};
const ready={ok:true,status:'current',environmentId:owner.environmentId,windowGeneration:1,state:'running',terminalCount:0,maxTerminals:2,resetAllowed:true,terminals:[]};
const list=(entries:{name:string;kind:'directory'|'file'}[],truncated=false)=>({ok:true,entries,truncated});
const signal=()=>new AbortController().signal;
function mock(fn:(action:UnifiedAction)=>Record<string,unknown>|Promise<Record<string,unknown>>):typeof unifiedRequest{return async(_c,a,_s)=>fn(a);}
describe('Unified FullIDE read-only projection',()=>{
 it('empty guest does not generate starter files',()=>{expect(emptyUnifiedWorkspace().nodes).toEqual([]);expect(emptyUnifiedWorkspace().activeFileId).toBe('');});
 it('correct parent paths and stable IDs across refresh',()=>{const p=projectUnifiedWorkspace(owner,[{path:'dir',kind:'directory'},{path:'dir/a.py',kind:'file',text:'a'}],null);const q=projectUnifiedWorkspace(owner,[{path:'dir',kind:'directory'},{path:'dir/a.py',kind:'file',text:'b'}],p);expect(q.nodes[1].parentId).toBe(p.nodes[0].id);expect(q.activeFileId).toBe(p.activeFileId);expect(q.nodes[1]).toMatchObject({content:'b'});});
 it('Monaco-safe ids do not collide for spaces and punctuation',()=>{const p=projectUnifiedWorkspace(owner,[{path:'a b',kind:'file',text:'a'},{path:'a-b',kind:'file',text:'b'},{path:'a..b',kind:'file',text:'c'}],null);expect(new Set(p.nodes.map(n=>n.id)).size).toBe(3);expect(p.nodes.every(n=>/^[A-Za-z0-9_-]+$/.test(n.id))).toBe(true);});
 it('removed tabs are not resurrected',()=>{const p=projectUnifiedWorkspace(owner,[{path:'a',kind:'file',text:'a'}],null);const q=projectUnifiedWorkspace(owner,[],p);expect(q.openTabs).toEqual([]);expect(q.activeFileId).toBe('');});
 it('environment identity fences previous selection',()=>{const p=projectUnifiedWorkspace(owner,[{path:'a',kind:'file',text:'a'}],null);const q=projectUnifiedWorkspace({...owner,environmentId:'env_87654321'},[{path:'a',kind:'file',text:'b'}],p);expect(q.activeFileId===p.activeFileId).toBe(false);});
 it('nested files through existing read API only',async()=>{const seen:UnifiedAction[]=[];const r=await readUnifiedWorkspace(config,owner,signal(),mock(a=>{seen.push(a);if(a.action==='status')return ready;if(a.action!=='workspace')throw Error();if(a.operation==='list')return a.path?list([{name:'a',kind:'file'}]):list([{name:'d',kind:'directory'}]);return {ok:true,text:'hello'};}));expect(r.nodes).toEqual([{path:'d',kind:'directory'},{path:'d/a',kind:'file',text:'hello'}]);expect(seen.every(a=>a.action==='status'||(a.action==='workspace'&&['list','read'].includes(a.operation)))).toBe(true);});
 it('reject malicious paths',async()=>{let rejected=false;try{await readUnifiedWorkspace(config,owner,signal(),mock(()=>list([{name:'../outside',kind:'file'}])));}catch{rejected=true;}expect(rejected).toBe(true);});
 it('reject hidden names',async()=>{let rejected=false;try{await readUnifiedWorkspace(config,owner,signal(),mock(()=>list([{name:'.lab-student-password',kind:'file'}])));}catch{rejected=true;}expect(rejected).toBe(true);});
 it('reject duplicate entries',async()=>{let rejected=false;try{await readUnifiedWorkspace(config,owner,signal(),mock(()=>list([{name:'a',kind:'file'},{name:'a',kind:'directory'}])));}catch{rejected=true;}expect(rejected).toBe(true);});
 it('skips unavailable binary or changed files and reports partial view',async()=>{const r=await readUnifiedWorkspace(config,owner,signal(),mock(a=>{if(a.action==='status')return ready;if(a.action==='workspace'&&a.operation==='list')return list([{name:'a',kind:'file'}]);throw new UnifiedApiError('UNIFIED_FILE_UNAVAILABLE',503);}));expect(r).toEqual({nodes:[],limited:true});});
 it('does not turn an auth failure into a partial snapshot',async()=>{let rejected=false;try{await readUnifiedWorkspace(config,owner,signal(),mock(a=>{if(a.action==='workspace'&&a.operation==='list')return list([{name:'a',kind:'file'}]);throw new UnifiedApiError('DENIED',403);}));}catch{rejected=true;}expect(rejected).toBe(true);});
 it('rejects ownership change before publish',async()=>{let rejected=false;try{await readUnifiedWorkspace(config,owner,signal(),mock(a=>a.action==='status'?{...ready,windowGeneration:2}:list([])));}catch{rejected=true;}expect(rejected).toBe(true);});
 it('abort cannot publish',async()=>{const ctrl=new AbortController();let rejected=false;try{await readUnifiedWorkspace(config,owner,ctrl.signal,mock(a=>{ctrl.abort();return a.action==='status'?ready:list([]);}));}catch{rejected=true;}expect(rejected).toBe(true);});
 it('caps total entries',async()=>{let reads=0;const r=await readUnifiedWorkspace(config,owner,signal(),mock(a=>{if(a.action==='status')return ready;if(a.action==='workspace'&&a.operation==='list')return list(Array.from({length:64},(_,i)=>({name:'file'+i,kind:'file'})));reads++;return {ok:true,text:'a'};}));expect(reads).toBe(48);expect(r.nodes.length).toBe(48);expect(r.limited).toBe(true);});
});

describe('one-exec bounded native workspace snapshot',()=>{
 it('one snapshot and a final status, never per-file requests',async()=>{const seen:UnifiedAction[]=[];const nodes=[{path:'d',kind:'directory'},{path:'d/a.py',kind:'file',text:'print(1)'}];const result=await readUnifiedWorkspaceSnapshot(config,owner,signal(),mock(a=>{seen.push(a);return a.action==='status'?ready:{ok:true,nodes,truncated:false};}));expect(result.nodes).toEqual(nodes);expect(seen.map(a=>a.action==='workspace'?a.operation:a.action)).toEqual(['snapshot','status']);});
 it('invalid paths, duplicate and missing parent never publish',async()=>{for(const nodes of [[{path:'.lab-student-password',kind:'file',text:'x'}],[{path:'d/a',kind:'file',text:'x'}],[{path:'a',kind:'file',text:'x'},{path:'a',kind:'directory'}]]){let failed=false;try{await readUnifiedWorkspaceSnapshot(config,owner,signal(),mock(()=>({ok:true,nodes,truncated:false})));}catch{failed=true;}expect(failed).toBe(true);}});
 it('rejects ownership transfer after snapshot',async()=>{let failed=false;try{await readUnifiedWorkspaceSnapshot(config,owner,signal(),mock(a=>a.action==='status'?{...ready,windowGeneration:2}:{ok:true,nodes:[],truncated:false}));}catch{failed=true;}expect(failed).toBe(true);});
 it('bounded aggregate text response',async()=>{let failed=false;try{await readUnifiedWorkspaceSnapshot(config,owner,signal(),mock(()=>({ok:true,nodes:Array.from({length:13},(_,i)=>({path:'a'+i,kind:'file',text:'x'.repeat(32768)})),truncated:false})));}catch{failed=true;}expect(failed).toBe(true);});
 it('binary snapshot preserves bytes and editor marks binary',async()=>{
   const raw=Uint8Array.from([0,255,137,80,78,71]);const data=btoa(String.fromCharCode(...raw));
   const nodes=[{path:'image.png',kind:'file',encoding:'base64',data,sizeBytes:raw.length}];
   const response=await readUnifiedWorkspaceSnapshot(config,owner,signal(),mock(a=>a.action==='status'?ready:{ok:true,nodes,truncated:false}));
   expect(response.nodes).toEqual(nodes);const projected=projectUnifiedWorkspace(owner,response.nodes,null);
   expect(projected.nodes[0]).toMatchObject({kind:'file',binary:{encoding:'base64',data,sizeBytes:6}});
 });
 it('corrupt base64 cannot publish even if ownership is valid',async()=>{
   for(const data of ['AA=A','AA==AA==','A','/w==']){
     let rejected=false;
     try{await readUnifiedWorkspaceSnapshot(config,owner,signal(),mock(a=>a.action==='status'?ready:{ok:true,nodes:[{path:'bad.png',kind:'file',encoding:'base64',data,sizeBytes:3}],truncated:false}));}
     catch{rejected=true;}
     expect(rejected).toBe(true);
   }
 });
 it('32 KiB text snapshot supported but 32 KiB plus one rejected',async()=>{
   const mk=(n:number)=>mock(a=>a.action==='status'?ready:{ok:true,nodes:[{path:'doc.java',kind:'file',text:'x'.repeat(n)}],truncated:false});
   expect((await readUnifiedWorkspaceSnapshot(config,owner,signal(),mk(32768))).nodes).toHaveLength(1);
   let failed=false;try{await readUnifiedWorkspaceSnapshot(config,owner,signal(),mk(32769));}catch{failed=true;}expect(failed).toBe(true);
 });
 it('aborted snapshot cannot publish',async()=>{const ctrl=new AbortController();let failed=false;try{await readUnifiedWorkspaceSnapshot(config,owner,ctrl.signal,mock(()=>{ctrl.abort();return {ok:true,nodes:[],truncated:false};}));}catch{failed=true;}expect(failed).toBe(true);});
});
