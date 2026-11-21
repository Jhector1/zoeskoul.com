"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import {privateMediaPath,readPrivateMediaPage,type PrivateProjectImage} from "./projectMediaClient";
import styles from "./ProjectMediaLibrary.module.css";

const MAX_UPLOAD_BYTES=20*1024*1024;
const SMALL_PREVIEW_BYTES=256*1024;

/** Project-owned images, shared by Code and ZoeAI chat. Never injects an R2/public URL. */
export default function ProjectMediaLibrary({buildProjectId,context}:{
  buildProjectId:string;context:"code"|"chat";
}) {
  const [open,setOpen]=useState(false);
  const [items,setItems]=useState<readonly PrivateProjectImage[]>([]);
  const [nextCursor,setNextCursor]=useState<string|null>(null);
  const [selected,setSelected]=useState<PrivateProjectImage|null>(null);
  const [busy,setBusy]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [status,setStatus]=useState<string|null>(null);
  const fileRef=useRef<HTMLInputElement>(null);
  const triggerRef=useRef<HTMLButtonElement>(null);
  const dialogRef=useRef<HTMLDialogElement>(null);
  const requestEpoch=useRef(0);

  const load=useCallback(async (cursor:string|null,replace:boolean)=>{
    const epoch=++requestEpoch.current;
    setBusy(true);setError(null);
    try {
      const endpoint=privateMediaPath(buildProjectId)+(cursor?`?cursor=${encodeURIComponent(cursor)}`:"");
      const response=await fetch(endpoint,{method:"GET",credentials:"same-origin",cache:"no-store"});
      if(!response.ok)throw new Error(response.status===401?"Sign in again to view project images.":"Project images are temporarily unavailable.");
      const page=readPrivateMediaPage(await response.json(),buildProjectId);
      if(requestEpoch.current!==epoch)return;
      setItems(previous=>replace?page.items:[...previous,...page.items.filter(i=>!previous.some(old=>old.id===i.id))]);
      setNextCursor(page.nextCursor);
    } catch(e) {
      if(requestEpoch.current===epoch)setError(e instanceof Error?e.message:"Unable to list project images.");
    } finally {if(requestEpoch.current===epoch)setBusy(false);}
  },[buildProjectId]);

  useEffect(()=>{
    if(!open){requestEpoch.current++;return;}
    setItems([]);setNextCursor(null);setStatus(null);setSelected(null);
    void load(null,true);
    return ()=>{requestEpoch.current++;};
  },[open,buildProjectId,load]);

  useEffect(()=>{
    const dlg=dialogRef.current;
    if(!dlg)return;
    if(open && !dlg.open)dlg.showModal();
    if(!open && dlg.open)dlg.close();
    return ()=>{if(dlg.open)dlg.close();};
  },[open]);

  const upload=async (file:File|undefined)=>{
    if(!file)return;
    setStatus(null);setError(null);
    if(file.type!=="image/png"){
      setError("PNG files are supported for upload in this version.");return;
    }
    if(file.size===0 || file.size>MAX_UPLOAD_BYTES){
      setError("Choose a PNG image between 1 byte and 20 MB.");return;
    }
    setUploading(true);
    try {
      const response=await fetch(privateMediaPath(buildProjectId),{
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"image/png"},body:file,
      });
      const payload:unknown=await response.json().catch(()=>null);
      if(!response.ok || !payload || typeof payload!=="object" || (payload as {ok?:boolean}).ok!==true)
        throw new Error(response.status===429?"Upload limit reached. Try again later.":"Image upload failed. Please retry.");
      setStatus("Image saved privately to this project.");
      if(open)await load(null,true);
    } catch(e){setError(e instanceof Error?e.message:"Image upload failed.");}
    finally {setUploading(false);if(fileRef.current)fileRef.current.value="";}
  };

  return <div className={styles.root} data-zoebuild-project-media={context}>
    <button type="button" ref={triggerRef} className={styles.trigger} aria-haspopup="dialog"
      aria-label={context==="code"?"Open project image assets":"Open project images from ZoeAI chat"}
      onClick={()=>setOpen(true)}>
      <span aria-hidden="true">▧</span> {context==="code"?"Assets":"Images"}
    </button>
    <dialog ref={dialogRef} className={styles.dialog} aria-label="Private project media library"
      onClose={()=>{setOpen(false);setSelected(null);triggerRef.current?.focus();}}>
      <div className={styles.dialogTop}>
        <strong>{selected?"Image preview":"Project images"}</strong>
        <div className={styles.toolbar}>
          {selected?<button type="button" className={styles.button} onClick={()=>setSelected(null)}>Back to images</button>:null}
          <button type="button" className={styles.button} onClick={()=>{dialogRef.current?.close();}} aria-label="Close project images">Close</button>
        </div>
      </div>
      {selected?<>
        <img className={styles.dialogImage} src={selected.previewPath} alt={selected.altText??"Selected project image"}/>
        <p className={styles.detail}>{selected.mimeType} · {selected.width??"?"} × {selected.height??"?"} · {Math.ceil(selected.byteLength/1024)} KB · {selected.origin}</p>
      </>:<section className={styles.panel} aria-label="Images saved to this project">
        <p className={styles.note}>Private project assets · one media library for Code and ZoeAI chat. No copies are added to source files.</p>
        <div className={styles.toolbar}>
          <input type="file" accept="image/png" ref={fileRef} className={styles.input}
            aria-label="Choose PNG image" onChange={event=>{void upload(event.target.files?.[0]);}} />
          <button type="button" className={styles.button} disabled={uploading}
            onClick={()=>fileRef.current?.click()}>{uploading?"Uploading…":"Upload PNG"}</button>
          <button type="button" className={styles.button} disabled={busy||uploading}
            onClick={()=>void load(null,true)}>Refresh</button>
        </div>
        {status?<p className={styles.status} role="status">{status}</p>:null}
        {error?<p className={styles.error} role="alert">{error}</p>:null}
        {busy&&items.length===0?<p className={styles.status} role="status">Loading images…</p>:null}
        {!busy&&items.length===0&&!error?<p className={styles.note}>No images saved to this project yet.</p>:null}
        {items.length>0?<div className={styles.grid}>
          {items.map(asset=><button type="button" key={asset.id} className={styles.card}
            onClick={()=>setSelected(asset)} aria-label={`Open image ${asset.id.slice(-8)}`}>
            {asset.byteLength<=SMALL_PREVIEW_BYTES
              ?<img className={styles.thumbnail} src={asset.previewPath} alt={asset.altText??"Project image"} loading="lazy" />
              :<span className={styles.placeholder} aria-hidden="true">▧</span>}
            <span className={styles.cardLabel} title={asset.id}>{asset.altText||asset.id.slice(-12)}</span>
            <span className={styles.cardMeta}>{asset.origin} · {Math.ceil(asset.byteLength/1024)} KB</span>
          </button>)}
        </div>:null}
        {nextCursor?<button type="button" className={styles.button} disabled={busy}
          onClick={()=>void load(nextCursor,false)}>{busy?"Loading…":"Load more"}</button>:null}
      </section>}
    </dialog>
  </div>;

}
