"use client";

import {useEffect, useState} from "react";

type Revision = Readonly<{version:number; createdAt:string; note:string|null; workspaceHash:string|null}>;
type FilePreview = Readonly<{path:string; content:string; truncated:boolean}>;
type Preview = Readonly<{files:FilePreview[]; omitted:number}>;

export default function ProjectRevisionHistory(props: Readonly<{
  buildProjectId: string;
  currentVersion: number;
  disabled: boolean;
  onRestored: (savedVersion:number, fromVersion:number) => Promise<void>;
}>) {
  const [expanded,setExpanded] = useState(false);
  const [revisions,setRevisions] = useState<Revision[]>([]);
  const [historyError,setHistoryError] = useState<string|null>(null);
  const [busy,setBusy] = useState(false);
  const [selected,setSelected] = useState<number|null>(null);
  const [preview,setPreview] = useState<Preview|null>(null);
  const baseUrl = `/api/build/projects/${encodeURIComponent(props.buildProjectId)}/source-history`;

  useEffect(() => {
    if (!expanded) return;
    let active = true;
    setHistoryError(null);
    void fetch(baseUrl,{credentials:"same-origin",cache:"no-store"})
      .then(async response => {
        const data: unknown = await response.json().catch(() => null);
        if (!response.ok || !data || typeof data !== "object") throw new Error("Version history is unavailable.");
        const payload = data as {ok?:boolean;revisions?:Revision[]};
        if (!payload.ok || !Array.isArray(payload.revisions)) throw new Error("Version history is unavailable.");
        if (active) setRevisions(payload.revisions);
      })
      .catch(() => {if (active) setHistoryError("Couldn't load saved versions. Retry by reopening History.");});
    return () => {active=false;};
  },[expanded,baseUrl,props.currentVersion]);

  async function viewVersion(version:number) {
    if (busy) return;
    setBusy(true); setHistoryError(null); setPreview(null); setSelected(version);
    try {
      const response = await fetch(`${baseUrl}?version=${version}`,{credentials:"same-origin",cache:"no-store"});
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok || !body || typeof body !== "object") throw new Error("Version could not be inspected.");
      const data = body as {ok?:boolean; preview?:Preview};
      if (!data.ok || !data.preview || !Array.isArray(data.preview.files)) throw new Error("Version could not be inspected.");
      setPreview(data.preview);
    } catch {setHistoryError("This version could not be inspected; no source was changed.");}
    finally {setBusy(false);}
  }

  async function restoreVersion(version:number) {
    if (busy || props.disabled || version >= props.currentVersion) return;
    if (!window.confirm(`Restore source v${version} as a NEW saved version? The current version will remain in History. This does not publish the website.`)) return;
    setBusy(true); setHistoryError(null);
    let savedVersion: number|null = null;
    try {
      const response = await fetch(baseUrl,{
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({baseVersion:props.currentVersion,restoreVersion:version}),
      });
      const body: unknown = await response.json().catch(() => null);
      const data = body && typeof body === "object" ? body as {ok?:boolean; sourceVersion?:number; message?:string; code?:string} : null;
      if (!response.ok || !data?.ok || !Number.isSafeInteger(data.sourceVersion))
        throw new Error(data?.message ?? data?.code ?? "Restore could not be verified. No source was changed.");
      savedVersion = data.sourceVersion!;
      await props.onRestored(savedVersion,version);
      setSelected(null); setPreview(null);
      setExpanded(false);
    } catch (error) {
      setHistoryError(savedVersion !== null
        ? `Restored source v${savedVersion}, but the editor could not reload it. Do not restore again; reload the project after preserving any unsaved work.`
        : error instanceof Error ? error.message : "Restore unavailable. No source was changed.");
    } finally {setBusy(false);}
  }

  return (
    <section className="zb-project-assistant-plan" aria-label="Saved project versions" data-testid="zoebuild-revision-history">
      <button type="button" aria-expanded={expanded} onClick={() => {setExpanded(!expanded);setSelected(null);setPreview(null);}}>
        {expanded ? "Hide saved versions" : "Version history"}
      </button>
      {expanded ? <>
        <p>Current source: v{props.currentVersion}. Restore creates a new version; it never deletes earlier versions, publishes, or uses AI.</p>
        {props.disabled ? <p>Finish any current edits or save code before restoring an earlier version.</p> : null}
        {historyError ? <p role="alert">{historyError}</p> : null}
        <div style={{maxHeight:300,overflowY:"auto"}}>
          {revisions.length === 0 && !historyError ? <p>Loading saved versions…</p> : null}
          {revisions.map(r => <div key={r.version} style={{borderTop:"1px solid var(--zb-border, #ddd)",padding:"0.65rem 0"}}>
            <strong>Source v{r.version}{r.version === props.currentVersion ? " · Current" : ""}</strong>
            <div style={{fontSize:"0.85em",opacity:0.8}}>{new Date(r.createdAt).toLocaleString()}</div>
            {r.note ? <p style={{margin:"0.2rem 0"}}>{r.note}</p> : null}
            <button type="button" disabled={busy} onClick={() => void viewVersion(r.version)}>View files</button>{" "}
            {r.version < props.currentVersion ? <button type="button" disabled={busy || props.disabled}
              onClick={() => void restoreVersion(r.version)}>Restore v{r.version}</button> : null}
          </div>)}
        </div>
        {selected !== null && preview ? <div aria-label={`Source version ${selected} file preview`}>
          <strong>Files in v{selected}</strong>
          <p>Read-only excerpts. Truncated files and omitted assets are not shown in full.</p>
          {preview.files.map(file => <details key={file.path}>
            <summary>{file.path}{file.truncated ? " · excerpt" : ""}</summary>
            <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",maxHeight:240,overflow:"auto"}}>{file.content}</pre>
          </details>)}
          {preview.omitted > 0 ? <p>{preview.omitted} file(s) omitted from preview.</p> : null}
        </div> : null}
      </> : null}
    </section>
  );
}
