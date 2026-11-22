/** Browser-only drafts. A guest snapshot is authoritative for saved content.
 * Existing-file saves use the draft base revision; create is no-clobber. */
import type { WorkspaceStateV2 } from "../ide/types";
import type { UnifiedOwner } from "../runner/components/unifiedLinuxClient";
export type Draft = {id:string;path:string;base:string;text:string};
export function sameOwner(a:UnifiedOwner|null,b:UnifiedOwner|null){return a===null||b===null?a===b:a.environmentId===b.environmentId&&a.windowId===b.windowId&&a.windowGeneration===b.windowGeneration;}
export function validUnifiedPath(p:string){return p.length>0&&p.length<=128&&!/[\x00-\x1f\x7f]/.test(p)&&p.split('/').length<=8&&p.split('/').every(n=>/^[A-Za-z0-9_][A-Za-z0-9_. -]{0,63}$/.test(n)&&!['node_modules','__pycache__'].includes(n));}
export function validUnifiedText(s:string){return !s.includes('\0')&&new TextEncoder().encode(s).length<=32768&&new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(new TextEncoder().encode(s))===s;}
export function workspacePath(ws:WorkspaceStateV2,id:string){const parts:string[]=[],seen=new Set<string>();let next:string|null=id;while(next!==null){if(seen.has(next))return null;seen.add(next);const node=ws.nodes.find(n=>n.id===next);if(!node)return null;parts.unshift(node.name);next=node.parentId;}const path=parts.join('/');return validUnifiedPath(path)?path:null;}
/** An HTTP save receipt is not the final acknowledgment: require a fresh,
 * complete guest snapshot with the exact intended bytes and canonical path.
 * This helper never mutates a draft or trusts a browser-only overlay. */
export function verifiedUnifiedSavedDraft(draft:Draft,guest:WorkspaceStateV2|null):boolean {
 if(!guest||!validUnifiedPath(draft.path)||!validUnifiedText(draft.text))return false;
 const matches=guest.nodes.filter((node:WorkspaceStateV2['nodes'][number])=>node.kind==='file'&&workspacePath(guest,node.id)===draft.path);
 return matches.length===1&&matches[0].kind==='file'&&!matches[0].binary&&(matches[0].content??'')===draft.text;
}

export class UnifiedDrafts {
 private values=new Map<string,Draft>();
 list(){return Array.from(this.values.values());}
 clear(){this.values.clear();}
 edit(ws:WorkspaceStateV2,id:string,text:string){const node=ws.nodes.find(n=>n.id===id);const path=workspacePath(ws,id);if(!node||node.kind!=='file'||!path)return false;const existing=this.values.get(id);const base=existing?.base??node.content??'';if(text===base&&(node.content??'')===base)this.values.delete(id);else this.values.set(id,{id,path,base,text});return true;}
 discard(id:string){this.values.delete(id);}
 acknowledge(id:string,sent:string){const draft=this.values.get(id);if(draft?.text===sent)this.values.delete(id);}
 conflict(d:Draft,ws:WorkspaceStateV2){const n=ws.nodes.find(n=>n.id===d.id);return !n||n.kind!=='file'||(n.content??'')!==d.base;}
 overlay(ws:WorkspaceStateV2):WorkspaceStateV2{return {...ws,nodes:ws.nodes.map(n=>{const d=this.values.get(n.id);return n.kind==='file'&&d?{...n,content:d.text}:n;})};}
}

/** Opt-in scheduler only. Authority and revisions remain in the existing save path.
 * An attempted or conflicting write is never automatically replayed. */
export class UnifiedAutoSaveGate {
 private due=new Map<string,number>();
 private blocked=new Set<string>();
 edited(id:string,now:number){this.due.set(id,now+900);}
 block(id:string){this.blocked.add(id);}
 isBlocked(id:string){return this.blocked.has(id);}
 forget(id:string){this.due.delete(id);this.blocked.delete(id);}
 clear(){this.due.clear();this.blocked.clear();}
 next(drafts:readonly Draft[],guest:WorkspaceStateV2,now:number,conflict:(d:Draft,g:WorkspaceStateV2)=>boolean):string|null{
  for(const draft of drafts){
   if(conflict(draft,guest)){this.block(draft.id);continue;}
   const due=this.due.get(draft.id);
   if(due===undefined||due>now||this.blocked.has(draft.id)||!validUnifiedPath(draft.path)||!validUnifiedText(draft.base)||!validUnifiedText(draft.text))continue;
   return draft.id;
  }
  return null;
 }
}

/** Run uses a fixed selected file and saves every eligible draft in order.
 * Stop on a changed/unknown owner, any blocked draft, or unverified readback.
 * Already acknowledged saves are not rolled back if a later save conflicts. */
export async function prepareUnifiedPythonRun(id:string, io:{
 guest:()=>WorkspaceStateV2|null; drafts:()=>Draft[]; blocked:(id:string)=>boolean;
 owns:()=>boolean; refresh:()=>Promise<void>; save:(id:string)=>Promise<boolean>;
}):Promise<{path:string;text:string}|null>{
 const initial=io.guest();if(!io.owns()||!initial)return null;
 const path=workspacePath(initial,id),node=initial.nodes.find(n=>n.id===id);
 const drafts=io.drafts().map(d=>({...d}));
 if(!path||!path.endsWith('.py')||node?.kind!=='file')return null;
 const text=drafts.find(d=>d.id===id)?.text??node.content??'';
 if(!validUnifiedText(text)||drafts.some(d=>io.blocked(d.id)||!validUnifiedPath(d.path)||!validUnifiedText(d.base)||!validUnifiedText(d.text)))return null;
 await io.refresh();
 const live=io.guest();if(!io.owns()||!live)return null;
 const exact=(g:WorkspaceStateV2,p:string,expected:string)=>{const n=g.nodes.find(n=>n.kind==='file'&&workspacePath(g,n.id)===p);return n?.kind==='file'&&(n.content??'')===expected;};
 if(!exact(live,path,drafts.find(d=>d.id===id)?.base??text)||drafts.some(d=>io.blocked(d.id)||!exact(live,d.path,d.base)))return null;
 for(const d of drafts){
  if(!io.owns()||io.blocked(d.id)||!await io.save(d.id))return null;
  const g=io.guest();if(!io.owns()||!g||!exact(g,d.path,d.text))return null;
 }
 await io.refresh();
 const final=io.guest();if(!io.owns()||!final||io.drafts().length||!exact(final,path,text)||drafts.some(d=>!exact(final,d.path,d.text)))return null;
 return {path,text};
}
