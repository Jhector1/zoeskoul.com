"use client";
import React from 'react';
import {UnifiedApiError,unifiedRequest,type UnifiedLinuxClientConfig,type UnifiedOwner} from './unifiedLinuxClient';
type Entry={name:string;kind:'directory'|'file'};
type Draft={source:string|null;original:string;text:string};
const byteSize=(text:string)=>new TextEncoder().encode(text).length;
const validName=(name:string)=>/^[A-Za-z0-9_][A-Za-z0-9_. -]{0,63}$/.test(name)&&!/[\x00-\x1f\x7f]/.test(name)&&!['node_modules','__pycache__'].includes(name);
const pathFor=(dir:string,name:string)=>dir?dir+'/'+name:name;
function listing(raw:Record<string,unknown>){
  if(!Array.isArray(raw.entries)||raw.entries.length>64||typeof raw.truncated!=='boolean')throw Error('INVALID_WORKSPACE_RESPONSE');
  const rows=raw.entries as Entry[];if(rows.some(x=>!x||typeof x.name!=='string'||!validName(x.name)||!['directory','file'].includes(x.kind)))throw Error('INVALID_WORKSPACE_RESPONSE');
  return {rows,truncated:raw.truncated};
}
export default function UnifiedLinuxWorkspaceExplorer({config,owner,disabled}:{config:UnifiedLinuxClientConfig;owner:UnifiedOwner;disabled:boolean}){
  const [path,setPath]=React.useState(''),[entries,setEntries]=React.useState<Entry[]>([]),[truncated,setTruncated]=React.useState(false),[draft,setDraft]=React.useState<Draft|null>(null),[name,setName]=React.useState(''),[folder,setFolder]=React.useState(''),[error,setError]=React.useState(''),[message,setMessage]=React.useState(''),[busy,setBusy]=React.useState(false);
  const active=React.useRef<AbortController|null>(null);const pathRef=React.useRef('');const writable=config.workspaceWrite===true;
  const request=React.useCallback(async(operation:'list'|'read'|'create'|'mkdir',target:string,content?:string)=>{
    if(disabled||active.current||((operation==='create'||operation==='mkdir')&&!writable))return;
    const ctrl=new AbortController();active.current=ctrl;setBusy(true);setError('');setMessage('');const timer=setTimeout(()=>ctrl.abort(),15000);
    const current=()=>!ctrl.signal.aborted&&active.current===ctrl;
    let created=false;
    try{
      const r=await unifiedRequest(config,operation==='create'?{action:'workspace',...owner,operation,path:target,text:content!}:{action:'workspace',...owner,operation,path:target},ctrl.signal);if(!current())return;
      if(operation==='list'){
        const l=listing(r);setEntries(l.rows);pathRef.current=target;setPath(target);setTruncated(l.truncated);
      }else if(operation==='read'){
        if(typeof r.text!=='string'||byteSize(r.text)>2048)throw Error('INVALID_WORKSPACE_RESPONSE');setDraft({source:target,original:r.text,text:r.text});setName('');
      }else{
        if(r.created!==true)throw Error('INVALID_WORKSPACE_RESPONSE');created=true;
        setMessage(`${operation==='mkdir'?'Created directory':'Created new file'}: ${target}`);
        if(operation==='create'){setDraft({source:target,original:content!,text:content!});setName('');}else setFolder('');
        // Creation is not retried if listing fails. The next explicit refresh reconciles it.
        const dir=target.split('/').slice(0,-1).join('/');
        const next=await unifiedRequest(config,{action:'workspace',...owner,operation:'list',path:dir},ctrl.signal);if(!current())return;
        const l=listing(next);setEntries(l.rows);pathRef.current=dir;setPath(dir);setTruncated(l.truncated);
      }
    }catch(e){if(active.current===ctrl){setError(created?'Created successfully; listing could not refresh. Use Refresh.':e instanceof UnifiedApiError&&e.reason==='UNIFIED_FILE_CONFLICT'?'That name already exists. Nothing was replaced. Choose a new name.':operation==='create'||operation==='mkdir'?'Creation result could not be verified. Refresh before trying again; existing names are never overwritten.':'Workspace unavailable, or file exceeds the preview limit. Refresh to retry.');}}
    finally{clearTimeout(timer);if(active.current===ctrl){active.current=null;setBusy(false);}}
  },[config.apiPath,owner.windowId,owner.environmentId,owner.windowGeneration,disabled,writable]);
  React.useEffect(()=>{if(!disabled){setBusy(false);void request('list',pathRef.current);}return()=>{const old=active.current;active.current=null;old?.abort();};},[request,disabled]);
  const locked=busy||disabled;const dirty=!!draft&&(name!==''||(draft.source===null?draft.text!=='':draft.original!==draft.text));
  React.useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  const discard=()=>!dirty||window.confirm('Discard this unsaved draft? Existing Linux files will not change.');
  const navigate=(dir:string)=>{if(!discard())return;setDraft(null);setName('');setFolder('');void request('list',dir);};
  const openFile=(file:string)=>{if(discard())void request('read',file);};
  const validTarget=(n:string)=>validName(n)&&pathFor(path,n).length<=128&&pathFor(path,n).split('/').length<=8;
  const cls='rounded border px-2 py-1 text-xs disabled:opacity-40 dark:border-white/20';
  return <aside className="flex w-full max-h-[48%] shrink-0 flex-col overflow-auto border-b p-2 text-xs md:max-h-none md:w-72 md:border-b-0 md:border-r dark:border-white/10" aria-label="Linux workspace Explorer">
    <div className="flex items-center justify-between gap-2"><strong>Explorer</strong><button className={cls} disabled={locked} onClick={()=>void request('list',path)}>Refresh</button></div>
    <p className="break-all py-1">/workspace{path?'/'+path:''}</p><p className="text-xs opacity-70">{writable?'New files and folders · UTF-8 up to 2 KiB · no overwrite':'Read-only preview · UTF-8 files up to 2 KiB'}</p>
    {path&&<button className={cls} disabled={locked} onClick={()=>navigate(path.split('/').slice(0,-1).join('/'))}>↑ Parent directory</button>}
    {error&&<p role="alert" className="text-red-600 break-all">{error}</p>}{message&&<p role="status" className="break-all">{message}</p>}{busy&&<p role="status">Loading…</p>}{truncated&&<p>Listing limited to 64 visible entries.</p>}
    {!entries.length&&!busy&&!error&&<p className="py-2">No visible entries.</p>}
    {writable&&<div className="flex flex-col gap-1 py-2"><button className={cls} disabled={locked} onClick={()=>{if(discard()){setDraft({source:null,original:'',text:''});setName('');}}}>New file</button>
      <form className="flex gap-1" onSubmit={e=>{e.preventDefault();if(!locked&&validTarget(folder))void request('mkdir',pathFor(path,folder));}}><input className="min-w-0 flex-1 rounded border bg-transparent p-1" aria-label="New folder name" placeholder="Folder name" value={folder} maxLength={64} disabled={locked} onChange={e=>setFolder(e.target.value)}/><button className={cls} disabled={locked||!validTarget(folder)} type="submit">Create folder</button></form></div>}
    <div className="flex flex-col items-start gap-1 py-2">{entries.map(e=><button key={e.name} className="w-full break-all rounded px-1 py-1 text-left hover:bg-neutral-200 disabled:opacity-40 dark:hover:bg-white/10" disabled={locked} onClick={()=>e.kind==='directory'?navigate(pathFor(path,e.name)):openFile(pathFor(path,e.name))}>{e.kind==='directory'?'▸ ':'  '}{e.name}</button>)}</div>
    {draft&&<div className="min-h-0 border-t pt-2 dark:border-white/10"><strong className="break-all">{draft.source??'New file draft'}{dirty?' · Unsaved draft':''}</strong>
      {writable?<><textarea className="mt-1 min-h-24 w-full rounded border bg-transparent p-1 font-mono" aria-label="File draft" value={draft.text} disabled={locked} spellCheck={false} maxLength={2048} onChange={e=>setDraft(d=>d?{...d,text:e.target.value}:d)}/><p>{byteSize(draft.text)}/2048 bytes · Save only to a new name.</p><form className="flex flex-col gap-1" onSubmit={e=>{e.preventDefault();if(!locked&&validTarget(name)&&byteSize(draft.text)<=2048&&!draft.text.includes('\0'))void request('create',pathFor(path,name),draft.text);}}><input className="rounded border bg-transparent p-1" aria-label="New filename" placeholder="New filename" maxLength={64} disabled={locked} value={name} onChange={e=>setName(e.target.value)}/><button type="submit" className={cls} disabled={locked||!validTarget(name)||byteSize(draft.text)>2048||draft.text.includes('\0')}>{draft.source?'Save as new file':'Create file'}</button></form></>:<pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono">{draft.text}</pre>}
      {draft.source&&<button className={cls} disabled={locked} onClick={()=>openFile(draft.source!)}>Reload file</button>}<button className={cls} disabled={locked} onClick={()=>{if(discard()){setDraft(null);setName('');}}}>Close draft</button></div>}
  </aside>;
}
