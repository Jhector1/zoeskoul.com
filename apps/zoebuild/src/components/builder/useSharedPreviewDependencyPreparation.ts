"use client";
import {useCallback,useEffect,useLayoutEffect,useRef,useState} from "react";
import type {WorkspaceStateV2} from "@zoeskoul/learner-workspace/ide/types";
import {needsSharedPreviewDependencyPreparation,prepareSharedPreviewDependencies,savedDependencySelectionKey} from "@/lib/build/sharedPreviewDependencyPreparation";

type Input = Readonly<{
  enabled: boolean; buildProjectId: string; sourceVersion: number;
  workspace: WorkspaceStateV2; allowDependencyBootstrap: boolean;
  restoredDependencyPinned?: boolean;
  onSourceConflict?: (attemptedSourceVersion:number) => Promise<boolean>;
  onDependencyPrepared?: (attemptedSourceVersion:number) => Promise<boolean>;
}>;
type Attempt = {key:string;kind:"pending"|"prepared"|"error"|"superseded";message:string};
/** A single pre-admission gate shared by both preview lanes. The server still
 * checks exact saved source, ownership, approval and every Runner request. */
export function useSharedPreviewDependencyPreparation(input: Input) {
  const selection = {buildProjectId:input.buildProjectId, sourceVersion:input.sourceVersion,
    restoredDependencyPinned:input.restoredDependencyPinned === true};
  const key = savedDependencySelectionKey(selection);
  const blocked = input.enabled && needsSharedPreviewDependencyPreparation(input.workspace.nodes);
  const canPrepare = blocked && input.allowDependencyBootstrap;
  const current = useRef({input,key,canPrepare});
  const mounted = useRef(false);
  const attempts = useRef(new Map<string,Attempt>());
  const [visible,setVisible] = useState<Attempt | null>(null);
  const [retrySerial,setRetrySerial] = useState(0);
  useLayoutEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
  useLayoutEffect(()=>{current.current={input,key,canPrepare};},[input,key,canPrepare]);
  useEffect(()=>{
    if (!canPrepare) return;
    const prior=attempts.current.get(key);
    if (prior) {setVisible(prior);return;}
    // Defer past StrictMode's probe; a pending server mutation is never aborted
    // or silently replayed on effect cleanup. A fresh selection is fenced.
    const timer = window.setTimeout(()=>{
      if (!mounted.current || current.current.key!==key || !current.current.canPrepare || attempts.current.has(key)) return;
      const selected = {key,kind:"pending",message:"Preparing trusted saved dependencies…"} as const;
      attempts.current.set(key,selected);setVisible(selected);
      const isCurrent=()=>mounted.current && current.current.key===key && current.current.canPrepare && attempts.current.get(key)===selected;
      void prepareSharedPreviewDependencies({...selection,isCurrent,
        reconcileConflict:version=>current.current.input.onSourceConflict?.(version)??Promise.resolve(false),
        reconcilePrepared:version=>current.current.input.onDependencyPrepared?.(version)??Promise.resolve(false),
      }).then(result=>{
        if (attempts.current.get(key)!==selected) return;
        const next={key,...result};attempts.current.set(key,next);
        if (mounted.current && current.current.key===key) setVisible(next);
      });
    },0);
    return ()=>window.clearTimeout(timer);
  },[key,canPrepare,retrySerial]);
  const retry=useCallback(()=>{
    if (attempts.current.get(key)?.kind==="pending") return;
    attempts.current.delete(key);setVisible(null);setRetrySerial(value=>value+1);
  },[key]);
  useEffect(()=>{
    if (!blocked || visible?.key!==key || visible.kind!=="prepared") return;
    const timer=window.setTimeout(()=>{
      if (!mounted.current || current.current.key!==key || !current.current.canPrepare) return;
      const prior=attempts.current.get(key);
      if (prior?.kind!=="prepared") return;
      const next:Attempt={key,kind:"error",message:"Prepared source has not synchronized. Reload the saved project or retry preview."};
      attempts.current.set(key,next);setVisible(next);
    },5000);
    return ()=>window.clearTimeout(timer);
  },[blocked,key,visible]);
  const status=visible?.key===key?visible:null;
  const message=!input.allowDependencyBootstrap?"Save your changes before preparing dependencies.":
    status?.message??"Preparing trusted saved dependencies…";
  return {blocked,state:(!input.allowDependencyBootstrap||status?.kind==="error"||status?.kind==="superseded"?"error":"starting") as "error"|"starting",message,retry};
}
