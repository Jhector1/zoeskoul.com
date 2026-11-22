"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import type {WorkspaceStateV2} from "@zoeskoul/learner-workspace/ide/types";
import {
  privateMediaPath, readPrivateMediaPage, type PrivateProjectImage,
} from "./projectMediaClient";
import {
  projectPrivateMediaIntoFullIDE, privateMediaProjectionIsIntact,
  removePrivateMediaProjection, projectMediaNodeId,
  type ProjectMediaBinary, type ProjectMediaProjection,
} from "./projectMediaWorkspace";

export const ZOE_MEDIA_UPDATED = "zoebuild:project-media-updated";
export const ZOE_MEDIA_OPEN = "zoebuild:project-media-open-in-code";

const MAX_LOADED_BYTES = 20 * 1024 * 1024;
const MAX_LIST_PAGES = 25;

function encodeBase64(bytes: Uint8Array): string {
  let text = "";
  for (let p = 0; p < bytes.length; p += 8192) {
    text += String.fromCharCode(...bytes.subarray(p, p + 8192));
  }
  return btoa(text);
}

type WorkspaceChange = (
  workspace: WorkspaceStateV2 | null,
  meta?: {origin?: "user" | "sync" | "programmatic"},
) => void;

/**
 * ZoeBuild-side adapter to FullIDE's existing workspace API; no FullIDE edits.
 * Virtual media never flows to ZoeBuild source-save, AI editing, or Runner.
 */
export function useZoeProjectMediaExplorer(args: Readonly<{
  buildProjectId: string;
  sourceWorkspaceRef: {current: WorkspaceStateV2};
  onCanonicalWorkspaceChange: WorkspaceChange;
}>) {
  const {buildProjectId, sourceWorkspaceRef, onCanonicalWorkspaceChange} = args;
  const [overlay, setOverlay] = useState<Readonly<{workspace:WorkspaceStateV2;revision:number}>|null>(null);
  const [status, setStatus] = useState<string|null>(null);
  const projectionRef = useRef<ProjectMediaProjection|null>(null);
  const mediaRef = useRef<readonly PrivateProjectImage[]>([]);
  const loadedRef = useRef(new Map<string,ProjectMediaBinary>());
  const selectedRef = useRef<string|null>(null);
  const loadEpochRef = useRef(0);
  const revisionRef = useRef(0);
  const pendingMediaReadRef = useRef<{assetId:string;controller:AbortController}|null>(null);
  const componentAliveRef = useRef(true);

  const publishProjection = useCallback((images: readonly PrivateProjectImage[], selected?:string|null) => {
    try {
      const projection = projectPrivateMediaIntoFullIDE({
        source: sourceWorkspaceRef.current, images,
        loaded: loadedRef.current,
        selectedAssetId: selected ?? selectedRef.current,
      });
      projectionRef.current = projection;
      revisionRef.current += 1;
      setOverlay({workspace:projection.workspace,revision:revisionRef.current});
    } catch {
      setStatus("Media folder is unavailable because a source path conflicts with its reserved assets location.");
    }
  },[sourceWorkspaceRef]);

  const fetchAsset = useCallback(async (asset:PrivateProjectImage) => {
    if (loadedRef.current.has(asset.id) || pendingMediaReadRef.current?.assetId===asset.id) return;
    pendingMediaReadRef.current?.controller.abort();
    const controller = new AbortController();
    pendingMediaReadRef.current = {assetId:asset.id,controller};
    setStatus("Loading image into the existing editor…");
    try {
      const response = await fetch(privateMediaPath(buildProjectId, asset.id), {
        method:"GET",credentials:"same-origin",cache:"no-store",signal:controller.signal,
      });
      if (!response.ok || response.headers.get("content-type")?.split(";")[0].trim()!==asset.mimeType)
        throw new Error("Private image could not be opened.");
      const len = Number(response.headers.get("content-length"));
      if (len!==asset.byteLength || len<1 || len>MAX_LOADED_BYTES)
        throw new Error("Image length did not match verified media metadata.");
      const data = new Uint8Array(await response.arrayBuffer());
      if (data.byteLength!==asset.byteLength || data.byteLength>MAX_LOADED_BYTES)
        throw new Error("Image response exceeded its verified size.");
      const binary: ProjectMediaBinary = {
        encoding:"base64",data:encodeBase64(data),sizeBytes:data.byteLength,mimeType:asset.mimeType,
      };
      if (!componentAliveRef.current || controller.signal.aborted) return;
      // One image in browser memory at a time; R2 remains the sole original.
      loadedRef.current = new Map([[asset.id,binary]]);
      publishProjection(mediaRef.current,asset.id);
      setStatus(null);
    } catch (error) {
      if (!controller.signal.aborted && componentAliveRef.current)
        setStatus(error instanceof Error ? error.message : "Private image unavailable.");
    } finally {
      if (pendingMediaReadRef.current?.controller===controller)pendingMediaReadRef.current=null;
    }
  },[buildProjectId,publishProjection]);

  const refresh = useCallback(async () => {
    const epoch = ++loadEpochRef.current;
    setStatus(null);
    try {
      let cursor:string|null = null;
      const all:PrivateProjectImage[] = [];
      const seen = new Set<string>();
      let finished = false;
      for (let pageIndex=0;pageIndex<MAX_LIST_PAGES;pageIndex++) {
        const path = privateMediaPath(buildProjectId) +
          (cursor?`?cursor=${encodeURIComponent(cursor)}`:"");
        const res = await fetch(path,{method:"GET",credentials:"same-origin",cache:"no-store"});
        if (!res.ok)throw new Error(res.status===401?"Sign in again to see project assets.":"Project assets could not be listed.");
        const page = readPrivateMediaPage(await res.json(),buildProjectId);
        if (page.nextCursor && (page.nextCursor===cursor || seen.has(page.nextCursor)))
          throw new Error("Invalid media pagination received.");
        if (page.nextCursor)seen.add(page.nextCursor);
        all.push(...page.items);
        cursor = page.nextCursor;
        if (!cursor){finished=true;break;}
      }
      if (!finished) throw new Error("Too many project images to display in one Explorer page.");
      if (!componentAliveRef.current || epoch!==loadEpochRef.current) return;
      mediaRef.current = all;
      const retained = new Map<string,ProjectMediaBinary>();
      for (const item of all) {
        const b = loadedRef.current.get(item.id);
        if (b) retained.set(item.id,b);
      }
      loadedRef.current=retained;
      publishProjection(all);
      if(selectedRef.current){
        const asset=all.find(a=>a.id===selectedRef.current);
        if(asset)void fetchAsset(asset);
      }
    } catch(error) {
      if (componentAliveRef.current && epoch===loadEpochRef.current)
        setStatus(error instanceof Error?error.message:"Media library unavailable.");
    }
  },[buildProjectId,publishProjection,fetchAsset]);

  useEffect(()=>{
    componentAliveRef.current=true;
    void refresh();
    const updated=(event:Event)=>{
      if (!(event instanceof CustomEvent) || event.detail?.buildProjectId!==buildProjectId)return;
      void refresh();
    };
    const requested=(event:Event)=>{
      if (!(event instanceof CustomEvent) || event.detail?.buildProjectId!==buildProjectId ||
          typeof event.detail?.assetId!=="string")return;
      try {projectMediaNodeId(event.detail.assetId);} catch {return;}
      selectedRef.current=event.detail.assetId;
      const asset=mediaRef.current.find(a=>a.id===event.detail.assetId);
      if(asset){publishProjection(mediaRef.current,asset.id);void fetchAsset(asset);}
      else void refresh();
    };
    window.addEventListener(ZOE_MEDIA_UPDATED,updated);
    window.addEventListener(ZOE_MEDIA_OPEN,requested);
    return ()=>{
      componentAliveRef.current=false;
      loadEpochRef.current++;
      pendingMediaReadRef.current?.controller.abort();
      window.removeEventListener(ZOE_MEDIA_UPDATED,updated);
      window.removeEventListener(ZOE_MEDIA_OPEN,requested);
    };
  },[buildProjectId,refresh,publishProjection,fetchAsset]);

  const onWorkspaceChange = useCallback<WorkspaceChange>((workspace,meta)=>{
    if (!workspace)return;
    const projection=projectionRef.current;
    if (!projection) {onCanonicalWorkspaceChange(workspace,meta);return;}
    if (meta?.origin==="user" && !privateMediaProjectionIsIntact(workspace,projection)){
      setStatus("Project media entries are read-only in Explorer. Manage uploads from ZoeAI Images.");
      publishProjection(mediaRef.current);
      return;
    }
    const asset = projection.assetByNodeId.get(workspace.activeFileId);
    if(asset){
      selectedRef.current=asset.id;
      void fetchAsset(asset);
    } else if (meta?.origin==="user") {
      selectedRef.current=null;
    }
    try {
      const canonical=removePrivateMediaProjection(workspace,projection,sourceWorkspaceRef.current);
      onCanonicalWorkspaceChange(canonical,meta);
    } catch {
      setStatus("Project media entries are read-only in Explorer.");
      publishProjection(mediaRef.current);
    }
  },[onCanonicalWorkspaceChange,sourceWorkspaceRef,fetchAsset,publishProjection]);

  return {
    externalWorkspace: overlay?.workspace,
    externalWorkspaceRevision: overlay?.revision,
    onWorkspaceChange,
    status,
  };
}
