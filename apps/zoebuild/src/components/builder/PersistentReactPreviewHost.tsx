"use client";

import {
  createContext, useCallback, useContext, useEffect, useLayoutEffect,
  useMemo, useRef, useState, type ReactNode,
} from "react";
import RemoteWebPreview from "@zoeskoul/learner-workspace/runner/components/RemoteWebPreview";
import type { RemoteWebPreviewDescriptor } from "@zoeskoul/learner-workspace/runner/remotePreview";
import { previewViewerIdentity } from "@/lib/build/reactPreviewSessionRecovery";

const HOST_RELEASE_GRACE_MS = 10 * 60_000;

type HostRect = Readonly<{ top:number; left:number; width:number; height:number }>;
type HostSlot = Readonly<{ target:HTMLDivElement|null; active:boolean }>;
type HostEntry = Readonly<{
  buildProjectId:string;
  preview:RemoteWebPreviewDescriptor|null;
  slots:Readonly<Record<string,HostSlot>>;
  activeSlotId:string|null;
}>;
type PreviewHostApi = Readonly<{
  attachTarget:(projectId:string,slotId:string,target:HTMLDivElement)=>()=>void;
  updatePreview:(projectId:string,preview:RemoteWebPreviewDescriptor)=>void;
  setActive:(projectId:string,slotId:string,active:boolean)=>void;
}>;

const PreviewHostContext = createContext<PreviewHostApi|null>(null);

function rectOf(target:HTMLDivElement):HostRect {
  const r=target.getBoundingClientRect();
  return {top:r.top,left:r.left,width:r.width,height:r.height};
}
function hasTarget(entry:HostEntry) {
  return Object.values(entry.slots).some((slot)=>Boolean(slot.target));
}

export function PersistentReactPreviewProvider(props:Readonly<{children:ReactNode;enabled?:boolean}>) {
  const enabled=props.enabled??true;
  const [entry,setEntry]=useState<HostEntry|null>(null);
  const [rect,setRect]=useState<HostRect|null>(null);
  const releaseRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  // Keep the last rendered page mounted as a labelled, disabled backdrop
  // until its replacement is prepared. Never mark it as the new version.
  const lastReadyPreviewRef=useRef<{projectId:string;preview:RemoteWebPreviewDescriptor}|null>(null);

  const clearRelease=useCallback(()=>{
    if (!releaseRef.current) return;
    clearTimeout(releaseRef.current);
    releaseRef.current=null;
  },[]);

  const scheduleRelease=useCallback((projectId:string)=>{
    clearRelease();
    releaseRef.current=setTimeout(()=>{
      releaseRef.current=null;
      setEntry((current)=>{
        if (!current || current.buildProjectId!==projectId || hasTarget(current)) return current;
        return null;
      });
    },HOST_RELEASE_GRACE_MS);
  },[clearRelease]);

  const attachTarget=useCallback((projectId:string,slotId:string,target:HTMLDivElement)=>{
    if (!enabled) return ()=>undefined;
    clearRelease();
    setEntry((current)=>{
      if (current?.buildProjectId===projectId) {
        const prior=current.slots[slotId]??{target:null,active:false};
        return {...current,slots:{...current.slots,[slotId]:{...prior,target}}};
      }
      return {buildProjectId:projectId,preview:null,
              slots:{[slotId]:{target,active:false}},activeSlotId:null};
    });
    return ()=>{
      setEntry((current)=>{
        if (!current || current.buildProjectId!==projectId) return current;
        const prior=current.slots[slotId];
        if (!prior || prior.target!==target) return current;
        return {...current,
          slots:{...current.slots,[slotId]:{...prior,target:null,active:false}},
          activeSlotId:current.activeSlotId===slotId?null:current.activeSlotId};
      });
      scheduleRelease(projectId);
    };
  },[clearRelease,enabled,scheduleRelease]);

  const updatePreview=useCallback((projectId:string,preview:RemoteWebPreviewDescriptor)=>{
    if (!enabled) return;
    setEntry((current)=>current?.buildProjectId===projectId
      ? {...current,preview}
      : {buildProjectId:projectId,preview,slots:{},activeSlotId:null});
  },[enabled]);

  const setActive=useCallback((projectId:string,slotId:string,active:boolean)=>{
    if (!enabled) return;
    setEntry((current)=>{
      if (!current || current.buildProjectId!==projectId) return current;
      const prior=current.slots[slotId]??{target:null,active:false};
      return {...current,
        slots:{...current.slots,[slotId]:{...prior,active}},
        activeSlotId:active?slotId:(current.activeSlotId===slotId?null:current.activeSlotId)};
    });
  },[enabled]);

  const activeTarget=entry?.activeSlotId
    ? entry.slots[entry.activeSlotId]?.target??null : null;

  useLayoutEffect(()=>{
    if (!activeTarget) { setRect(null); return; }
    const measure=()=>setRect(rectOf(activeTarget));
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(activeTarget);
    window.addEventListener("resize",measure);
    window.addEventListener("scroll",measure,true);
    return ()=>{
      observer.disconnect();
      window.removeEventListener("resize",measure);
      window.removeEventListener("scroll",measure,true);
    };
  },[activeTarget]);

  useEffect(()=>{
    if (enabled) return;
    clearRelease();
    setEntry(null);
    setRect(null);
  },[clearRelease,enabled]);

  useEffect(()=>()=>clearRelease(),[clearRelease]);

  const api=useMemo<PreviewHostApi>(()=>({attachTarget,updatePreview,setActive}),
    [attachTarget,updatePreview,setActive]);
  useEffect(()=>{
    if (enabled && entry?.preview?.state === "ready" && entry.preview.src) {
      lastReadyPreviewRef.current = {projectId:entry.buildProjectId,preview:entry.preview};
    }
  },[enabled,entry?.buildProjectId,entry?.preview]);
  const isPreparing=entry?.preview?.state === "starting" || entry?.preview?.state === "syncing";
  const previousPreview=enabled&&isPreparing&&
    lastReadyPreviewRef.current?.projectId===entry?.buildProjectId
      ? lastReadyPreviewRef.current.preview : null;
  const renderedPreview=previousPreview??entry?.preview??null;
  const shown=Boolean(enabled&&entry?.preview&&activeTarget&&rect&&rect.width>0&&rect.height>0);

  return <PreviewHostContext.Provider value={api}>
    {props.children}
    {enabled&&entry?.preview ? <div
      data-persistent-react-preview-host
      data-preview-project={entry.buildProjectId}
      data-preview-slot={entry.activeSlotId??""}
      aria-hidden={!shown}
      style={{position:"fixed",top:rect?.top??0,left:rect?.left??0,
        width:rect?.width??0,height:rect?.height??0,zIndex:20,
        visibility:shown?"visible":"hidden",pointerEvents:shown?"auto":"none",
        overflow:"hidden"}}
    >
       <div inert={Boolean(previousPreview)} style={{height:"100%",pointerEvents:previousPreview?"none":"auto"}}>
         {renderedPreview ? <RemoteWebPreview
           key={previewViewerIdentity(entry.buildProjectId, renderedPreview.src)}
           preview={renderedPreview}/> : null}
       </div>
       {previousPreview ? <div data-preview-previous-version role="status" aria-live="polite"
         style={{position:"absolute",inset:0,zIndex:30,display:"grid",placeItems:"center",
           pointerEvents:"auto",background:"rgba(16,24,40,.2)",padding:16}}>
         <span style={{maxWidth:420,background:"rgba(15,23,42,.94)",color:"white",
           borderRadius:12,padding:"12px 16px",textAlign:"center",fontSize:12,
           boxShadow:"0 8px 32px rgba(0,0,0,.2)"}}>
           Preparing the selected version… Previous preview shown as a non-interactive reference.
         </span>
       </div> : null}
    </div>:null}
  </PreviewHostContext.Provider>;
}

export function PersistentReactPreviewSlot(props:Readonly<{
  buildProjectId:string; slotId:string; preview:RemoteWebPreviewDescriptor; active:boolean;
}>) {
  const host=useContext(PreviewHostContext);
  const targetRef=useRef<HTMLDivElement|null>(null);
  if (!host) throw new Error("PersistentReactPreviewSlot requires PersistentReactPreviewProvider.");

  useLayoutEffect(()=>{
    const target=targetRef.current;
    if (!target) return;
    return host.attachTarget(props.buildProjectId,props.slotId,target);
  },[host,props.buildProjectId,props.slotId]);

  useEffect(()=>host.updatePreview(props.buildProjectId,props.preview),
    [host,props.buildProjectId,props.preview]);
  useEffect(()=>host.setActive(props.buildProjectId,props.slotId,props.active),
    [host,props.buildProjectId,props.slotId,props.active]);

  return <div ref={targetRef} data-persistent-react-preview-slot
    data-preview-slot={props.slotId} className="h-full min-h-0 w-full"
    aria-hidden={!props.active}/>;
}
