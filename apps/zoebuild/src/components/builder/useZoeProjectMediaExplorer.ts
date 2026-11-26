"use client";

import {useCallback, useEffect, useLayoutEffect, useRef, useState} from "react";
import type {WorkspaceStateV2} from "@zoeskoul/learner-workspace/ide/types";
import {
  privateMediaPath, readPrivateMediaPage, type PrivateProjectImage,
} from "./projectMediaClient";
import {
  projectPrivateMediaIntoFullIDE, privateMediaProjectionIsIntact,
  removePrivateMediaProjection, projectMediaNodeId,
  type ProjectMediaBinary, type ProjectMediaProjection,
} from "./projectMediaWorkspace";
import {copyPrivatePngIntoApplication, MAX_APPLICATION_IMAGE_BYTES} from "./projectMediaApplicationImport";

export const ZOE_MEDIA_UPDATED = "zoebuild:project-media-updated";
export const ZOE_MEDIA_OPEN = "zoebuild:project-media-open-in-code";
export const ZOE_MEDIA_IMPORT = "zoebuild:project-media-use-in-application";

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
  // ProjectBuilderShell passes inline parent callbacks. Their identity changes
  // must not tear down media requests or republish an authoritative workspace
  // while FullIDE is committing a local rename or other source mutation.
  const canonicalChangeRef = useRef(onCanonicalWorkspaceChange);
  useLayoutEffect(() => {
    canonicalChangeRef.current = onCanonicalWorkspaceChange;
  },[onCanonicalWorkspaceChange]);
  const emitCanonicalChange = useCallback<WorkspaceChange>((workspace,meta) => {
    canonicalChangeRef.current(workspace,meta);
  },[]);
  const [overlay, setOverlay] = useState<Readonly<{workspace:WorkspaceStateV2;revision:number}>|null>(null);
  const [status, setStatus] = useState<string|null>(null);
  const projectionRef = useRef<ProjectMediaProjection|null>(null);
  const mediaRef = useRef<readonly PrivateProjectImage[]>([]);
  const loadedRef = useRef(new Map<string,ProjectMediaBinary>());
  const selectedRef = useRef<string|null>(null);
  const loadEpochRef = useRef(0);
  const revisionRef = useRef(0);
  const pendingMediaReadRef = useRef<{assetId:string;controller:AbortController}|null>(null);
  const pendingApplicationImportRef = useRef<AbortController|null>(null);
  const componentAliveRef = useRef(true);

  const publishProjection = useCallback((images: readonly PrivateProjectImage[], selected?:string|null) => {
    // With no private media, FullIDE already owns canonical source. An empty
    // refresh must not issue a replacement revision that can revert a pending
    // local rename. If the last virtual image was removed, publish exactly
    // once to remove its projection; repeated empty refreshes remain no-ops.
    if (images.length === 0 && (!projectionRef.current ||
        projectionRef.current.virtualNodeIds.size === 0)) return;
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

  const importIntoApplication = useCallback(async (assetId:string,replaceSelected:boolean) => {
    if (pendingApplicationImportRef.current) {
      setStatus("An application image import is already running.");return;
    }
    const asset = mediaRef.current.find(item => item.id === assetId);
    if (!asset || asset.mimeType !== "image/png") {
      setStatus("This PNG is not available in the current project library. Refresh Assets and retry.");return;
    }
    if (asset.byteLength > MAX_APPLICATION_IMAGE_BYTES) {
      setStatus("Application PNG images must be 5 MB or smaller.");return;
    }
    const before = sourceWorkspaceRef.current;
    const controller = new AbortController();
    pendingApplicationImportRef.current = controller;
    setStatus("Verifying image for application source…");
    try {
      // Owner-authorized private media read; never expose an R2 key or public URL.
      const response = await fetch(privateMediaPath(buildProjectId,asset.id),{
        method:"GET",credentials:"same-origin",cache:"no-store",signal:controller.signal,
      });
      if (!response.ok || response.headers.get("content-type")?.split(";")[0].trim() !== "image/png" ||
          Number(response.headers.get("content-length")) !== asset.byteLength)
        throw Error("The private image response failed verification.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== asset.byteLength || bytes.length > MAX_APPLICATION_IMAGE_BYTES ||
          ![137,80,78,71,13,10,26,10].every((byte,index)=>bytes[index]===byte))
        throw Error("The PNG image bytes are invalid.");
      const hashBuffer = await crypto.subtle.digest("SHA-256",Uint8Array.from(bytes).buffer);
      const digest = Array.from(new Uint8Array(hashBuffer),byte=>byte.toString(16).padStart(2,"0")).join("");
      if (!componentAliveRef.current || controller.signal.aborted) return;
      if (sourceWorkspaceRef.current !== before)
        throw Error("Source changed while loading the image. Retry without losing your edits.");
      const next = copyPrivatePngIntoApplication({source:before,asset,base64:encodeBase64(bytes),
        checksum:`sha256:${digest}`,replaceSelected,timestamp:Date.now(),newFolderId:()=>crypto.randomUUID()});
      selectedRef.current = null; // focus the real application node, never the virtual R2 node
      emitCanonicalChange(next,{origin:"user"});
      publishProjection(mediaRef.current,null);
      setStatus(replaceSelected ? "Selected app PNG replaced. Save to update the live preview."
        : "PNG added under public/images. Save to update the live preview.");
    } catch(error) {
      if (!controller.signal.aborted && componentAliveRef.current)
        setStatus(error instanceof Error?error.message:"Application image import failed.");
    } finally {
      if (pendingApplicationImportRef.current===controller)pendingApplicationImportRef.current=null;
    }
  },[buildProjectId,emitCanonicalChange,publishProjection,sourceWorkspaceRef]);

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
    const importRequested = (event:Event)=>{
      if (!(event instanceof CustomEvent) || event.detail?.buildProjectId!==buildProjectId ||
          typeof event.detail?.assetId!=="string" ||
          typeof event.detail?.replaceSelected!=="boolean")return;
      if (!/^asset_[a-f0-9]{32}$/.test(event.detail.assetId))return;
      void importIntoApplication(event.detail.assetId,event.detail.replaceSelected);
    };
    window.addEventListener(ZOE_MEDIA_UPDATED,updated);
    window.addEventListener(ZOE_MEDIA_OPEN,requested);
    window.addEventListener(ZOE_MEDIA_IMPORT,importRequested);
    return ()=>{
      componentAliveRef.current=false;
      loadEpochRef.current++;
      pendingMediaReadRef.current?.controller.abort();
      pendingApplicationImportRef.current?.abort();
      window.removeEventListener(ZOE_MEDIA_IMPORT,importRequested);
      window.removeEventListener(ZOE_MEDIA_UPDATED,updated);
      window.removeEventListener(ZOE_MEDIA_OPEN,requested);
    };
  },[buildProjectId,refresh,publishProjection,fetchAsset,importIntoApplication]);

  const onWorkspaceChange = useCallback<WorkspaceChange>((workspace,meta)=>{
    if (!workspace)return;
    const projection=projectionRef.current;
    if (!projection) {emitCanonicalChange(workspace,meta);return;}
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
      emitCanonicalChange(canonical,meta);
    } catch {
      setStatus("Project media entries are read-only in Explorer.");
      publishProjection(mediaRef.current);
    }
  },[emitCanonicalChange,sourceWorkspaceRef,fetchAsset,publishProjection]);

  return {
    externalWorkspace: overlay?.workspace,
    externalWorkspaceRevision: overlay?.revision,
    onWorkspaceChange,
    status,
  };
}
