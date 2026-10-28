"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import styles from "./ProjectRevisionHistory.module.css";
import {groupRevisionsByDate} from "@/lib/build/historyDateGroups";
import type {VersionFileChange} from "@/lib/build/compareSavedVersions";

type Revision = Readonly<{version:number; createdAt:string; note:string|null; workspaceHash:string|null}>;
type FilePreview = Readonly<{path:string; content:string; truncated:boolean}>;
type Preview = Readonly<{files:FilePreview[]; omitted:number}>;

export default function ProjectRevisionHistory(props: Readonly<{
  buildProjectId: string;
  currentVersion: number;
  disabled: boolean;
  onRestored: (savedVersion:number, fromVersion:number) => Promise<void>;
  onBeforeSwitch?: () => Promise<void>;
  onSwitchStart?: (version:number) => void;
  onSwitchFailure?: (version:number, persisted:boolean) => void;
  onStaleSource?: (attemptedSourceVersion:number) => Promise<boolean>;
}>) {
  const [expanded,setExpanded] = useState(false);
  const [revisions,setRevisions] = useState<Revision[]>([]);
  const [hasMore,setHasMore] = useState(false);
  // This is the active saved snapshot, distinct from the monotonic source CAS version.
  const [activeVersion,setActiveVersion] = useState<number|null>(null);
  const [historyError,setHistoryError] = useState<string|null>(null);
  const [loading,setLoading] = useState(false);
  const [busy,setBusy] = useState(false);
  const restoringRef = useRef(false);
  const [pendingAction,setPendingAction] = useState<{kind:"switch"|"delete";version:number}|null>(null);
  const [deleteConfirmation,setDeleteConfirmation] = useState("");
  const confirmationDialogRef = useRef<HTMLDialogElement|null>(null);
  const [selected,setSelected] = useState<number|null>(null);
  const [preview,setPreview] = useState<Preview|null>(null);
  const [comparison,setComparison] = useState<{version:number;changes:VersionFileChange[];counts:Record<VersionFileChange["group"],number>;scannedFiles:number}|null>(null);
  const groups = useMemo(()=>groupRevisionsByDate(revisions),[revisions]);
  const baseUrl = `/api/build/projects/${encodeURIComponent(props.buildProjectId)}/source-history`;

  // Native dialog top-layer handles focus containment and avoids clipping inside
  // the narrow, scrollable version-history sidebar. No browser confirm/prompt.
  useEffect(() => {
    const dialog = confirmationDialogRef.current;
    if (!dialog) return;
    if (pendingAction && !dialog.open) dialog.showModal();
    if (!pendingAction && dialog.open) dialog.close();
    return () => { if (dialog.open) dialog.close(); };
  }, [pendingAction]);

  function requestAction(kind:"switch"|"delete", version:number) {
    if (busy || restoringRef.current || props.disabled || version === activeVersion) return;
    setDeleteConfirmation("");
    setPendingAction({kind,version});
  }


  useEffect(() => {
    if (!expanded) return;
    let active = true;
    setHistoryError(null);setLoading(true);
    void fetch(baseUrl,{credentials:"same-origin",cache:"no-store"})
      .then(async response => {
        const data: unknown = await response.json().catch(() => null);
        if (!response.ok || !data || typeof data !== "object") throw new Error("Version history is unavailable.");
        const payload = data as {ok?:boolean;revisions?:Revision[];hasMore?:boolean;activeVersion?:number};
        if (!payload.ok || !Array.isArray(payload.revisions)) throw new Error("Version history is unavailable.");
        if (active) {
          setRevisions(payload.revisions);
          setHasMore(Boolean(payload.hasMore));
          setActiveVersion(Number.isSafeInteger(payload.activeVersion) ? payload.activeVersion! : null);
        }
      })
      .catch(() => {if (active) setHistoryError("Couldn't load saved versions. Close and reopen History to retry.");})
      .finally(() => {if (active) setLoading(false);});
    return () => {active=false;};
  },[expanded,baseUrl,props.currentVersion]);

  async function refreshHistoryAfterConflict() {
    // A dependency bootstrap can advance the internal source token without
    // adding a saved version. Re-read the owner-scoped current history instead
    // of leaving a stale "Current" badge or replaying a restore automatically.
    const response = await fetch(baseUrl,{credentials:"same-origin",cache:"no-store"});
    const payload = await response.json().catch(()=>null) as {
      ok?:boolean;revisions?:Revision[];hasMore?:boolean;activeVersion?:number;
    }|null;
    if (!response.ok || !payload?.ok || !Array.isArray(payload.revisions)) return false;
    setRevisions(payload.revisions);
    setHasMore(Boolean(payload.hasMore));
    setActiveVersion(Number.isSafeInteger(payload.activeVersion) ? payload.activeVersion! : null);
    return true;
  }

  async function loadOlderVersions() {
    if (loading || busy || !hasMore || !revisions.length) return;
    setLoading(true);setHistoryError(null);
    try {
      const oldest = Math.min(...revisions.map(revision=>revision.version));
      const response = await fetch(`${baseUrl}?beforeVersion=${oldest}`,{credentials:"same-origin",cache:"no-store"});
      const payload = await response.json().catch(()=>null) as {ok?:boolean;revisions?:Revision[];hasMore?:boolean}|null;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.revisions)) throw new Error();
      setRevisions(existing=>{
        const byVersion = new Map(existing.map(r=>[r.version,r]));
        payload.revisions!.forEach(r=>byVersion.set(r.version,r));
        return [...byVersion.values()];
      });
      setHasMore(Boolean(payload.hasMore));
    } catch {setHistoryError("Older versions could not be loaded. Retry.");}
    finally {setLoading(false);}
  }

  async function viewVersion(version:number) {
    if (busy) return;
    setBusy(true);setHistoryError(null);setPreview(null);setComparison(null);setSelected(version);
    try {
      const response = await fetch(`${baseUrl}?version=${version}`,{credentials:"same-origin",cache:"no-store"});
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok || !body || typeof body !== "object") throw new Error();
      const data = body as {ok?:boolean;preview?:Preview};
      if (!data.ok || !data.preview || !Array.isArray(data.preview.files)) throw new Error();
      setPreview(data.preview);
    } catch {setHistoryError("This version could not be inspected. No source changed.");}
    finally {setBusy(false);}
  }

  async function compareVersion(version:number) {
    if (busy || activeVersion===null || version===activeVersion) return;
    const from=activeVersion, token=props.currentVersion;
    setBusy(true);setHistoryError(null);setComparison(null);setPreview(null);setSelected(version);
    try {
      const query=new URLSearchParams({compareFrom:String(from),compareTo:String(version),expectedSourceVersion:String(token)});
      const response=await fetch(`${baseUrl}?${query}`,{credentials:"same-origin",cache:"no-store"});
      const body=await response.json().catch(()=>null) as {ok?:boolean;comparison?:{
        changes:VersionFileChange[];counts:Record<VersionFileChange["group"],number>;scannedFiles:number;
      };currentVersion?:number;message?:string}|null;
      if(!response.ok||!body?.ok||body.currentVersion!==token||!body.comparison||!Array.isArray(body.comparison.changes))
        throw new Error(body?.message??"Version comparison could not be verified. Refresh History.");
      setComparison({version,...body.comparison});
    }catch(error){setHistoryError(error instanceof Error?error.message:"Comparison unavailable.");}
    finally{setBusy(false);}
  }

  async function restoreVersion(version:number) {
    if (busy || restoringRef.current || props.disabled || version === activeVersion || version > props.currentVersion) return;

    restoringRef.current = true;
    setBusy(true);setSelected(version);setHistoryError(null);
    let savedVersion: number|null = null;
    try {
      await props.onBeforeSwitch?.();
      props.onSwitchStart?.(version);
      const response = await fetch(baseUrl,{
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({baseVersion:props.currentVersion,restoreVersion:version}),
      });
      const body: unknown = await response.json().catch(()=>null);
      const data = body && typeof body === "object" ? body as {
        ok?:boolean;sourceVersion?:number;activeVersion?:number;message?:string;code?:string
      } : null;
      if (response.status === 409 && data?.code === "BUILD_HISTORY_STALE") {
        // Don't blindly replay a version switch against a newly saved head.
        // It may contain newer real edits. Refresh the source and list; the
        // user can confirm the selected historical version again.
        await props.onStaleSource?.(props.currentVersion).catch(()=>false);
        const refreshed = await refreshHistoryAfterConflict().catch(()=>false);
        throw new Error(refreshed
          ? "Saved versions were refreshed after the project changed. Check Current and select the version again."
          : "The saved project changed. Reload it before selecting another version.");
      }
      if (!response.ok || !data?.ok || !Number.isSafeInteger(data.sourceVersion))
        throw new Error(data?.message ?? data?.code ?? "Restore could not be verified. Source was not changed.");
      savedVersion = data.sourceVersion!;
      setActiveVersion(data.activeVersion === version ? data.activeVersion : version);
      await props.onRestored(savedVersion,version);
      setSelected(null);setPreview(null);setComparison(null); // Keep History expanded and its date groups open.
    } catch (error) {
      props.onSwitchFailure?.(version, savedVersion !== null);
      setHistoryError(savedVersion !== null
        ? `Version ${version} was selected as current, but the editor could not refresh. Reload the project; don't repeat the restore.`
        : error instanceof Error ? error.message : "Restore unavailable. No source changed.");
    } finally {restoringRef.current=false;setBusy(false);}
  }

  async function deleteVersion(version:number) {
    if (busy || restoringRef.current || props.disabled || version === activeVersion) return;

    setBusy(true);setHistoryError(null);
    try {
      const response = await fetch(`${baseUrl}?version=${version}`, {
        method:"DELETE", credentials:"same-origin", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({expectedSourceVersion:props.currentVersion,confirmVersion:version}),
      });
      const body: unknown = await response.json().catch(()=>null);
      const result = body && typeof body === "object" ? body as {ok?:boolean;deleted?:boolean;message?:string;code?:string} : null;
      if (!response.ok || !result?.ok || !result.deleted) throw new Error(result?.message ?? result?.code ?? "Could not delete this version.");
      setRevisions(current=>current.filter(item=>item.version!==version));
      if (selected===version) {setSelected(null);setPreview(null);setComparison(null);}
    } catch(error) {
      setHistoryError(error instanceof Error ? error.message : "Unable to delete this version.");
    } finally {setBusy(false);}
  }

  return <section className={styles.history} aria-label="Saved project versions" data-testid="zoebuild-revision-history">
    <button type="button" className={styles.headingButton} aria-expanded={expanded}
      onClick={()=>{setExpanded(!expanded);setSelected(null);setPreview(null);setComparison(null);}}>
      <span className={styles.headingText}><span aria-hidden="true">◷</span> Version history
        <span className={styles.headingSubtitle}>Saved snapshots{activeVersion === null ? "" : ` · Current V${activeVersion}`}</span>
      </span>
      <span className={styles.chevron} aria-hidden="true">{expanded?"⌃":"⌄"}</span>
    </button>
    {expanded ? <div className={styles.body}>
      <p className={styles.description}>Switch versions without adding saves. The selected version becomes Current; your live site remains unchanged.</p>
      {props.disabled ? <p className={styles.notice}>Save unsaved code and finish the current action before restoring.</p> : null}
      {historyError ? <p role="alert" className={styles.error}>{historyError}</p> : null}
      {loading && !revisions.length ? <p role="status" className={styles.muted}>Loading versions…</p> : null}
      {!loading && !revisions.length && !historyError ? <p className={styles.muted}>No saved versions yet.</p> : null}
      <div className={styles.dateList}>
        {groups.map(group=><details key={group.key} className={styles.dateGroup}>
          <summary className={styles.dateSummary}>
            <span className={styles.dateTitle}>{group.label}</span>
            <span className={styles.dateCount}>{group.revisions.length} {group.revisions.length===1?"version":"versions"}</span>
          </summary>
          <div className={styles.versionList}>
            {group.revisions.map(revision => <div className={styles.versionRow} key={revision.version}>
              <div className={styles.versionInfo}>
                <div className={styles.versionHeading}>
                  <strong>Version {revision.version}</strong>
                  {revision.version===activeVersion ? <span className={styles.currentBadge}>Current</span> : null}
                </div>
                <span className={styles.time}>
                  {new Intl.DateTimeFormat(undefined,{hour:"numeric",minute:"2-digit"}).format(new Date(revision.createdAt))}
                </span>
                {revision.note ? <span className={styles.note}>{revision.note}</span> : null}
              </div>
              <div className={styles.actions}>
                <button type="button" className={styles.viewButton} disabled={busy}
                  onClick={()=>void viewVersion(revision.version)}>View files</button>
                {revision.version !== activeVersion ? <>
                  <button type="button" className={styles.restoreButton}
                    disabled={busy||props.disabled} onClick={()=>requestAction("switch",revision.version)}>
                    {busy&&selected===revision.version?"Switching…":"Switch to version"}
                  </button>
                  <button type="button" className={styles.viewButton} disabled={busy}
                    onClick={()=>void compareVersion(revision.version)}>Compare</button>
                  <button type="button" className={styles.deleteButton}
                    aria-label={`Delete saved Version ${revision.version}`}
                    disabled={busy||props.disabled} onClick={()=>requestAction("delete",revision.version)}>Delete</button>
                </> : null}
              </div>
            </div>)}
          </div>
        </details>)}
      </div>
      {hasMore ? <button type="button" className={styles.moreButton} disabled={loading||busy}
        onClick={()=>void loadOlderVersions()}>{loading?"Loading…":"Load older versions"}</button> : null}
      {selected!==null&&comparison ? <section className={styles.preview} aria-label={`Version ${selected} comparison`}>
        <div className={styles.previewHeading}><strong>Current vs Version {selected}</strong>
          <button type="button" onClick={()=>{setComparison(null);setSelected(null);}}>Close</button></div>
        <p className={styles.muted}>Compared complete saved file contents, including dependencies. Source contents are not returned.</p>
        <p className={styles.muted}>{comparison.changes.length} changed file(s) · {comparison.scannedFiles} inspected ·
          {` Pages ${comparison.counts.pages}, Components ${comparison.counts.components}, Dependencies ${comparison.counts.dependencies}, Other ${comparison.counts.other}`}</p>
        {comparison.changes.length===0 ? <p className={styles.muted}>No tracked file differences.</p> :
          <ul className={styles.comparisonList}>{comparison.changes.map(change=><li key={change.path}>
            <strong>{change.kind}</strong> · {change.path} <span>({change.group})</span>
          </li>)}</ul>}
      </section> : null}
      {selected!==null&&preview ? <div className={styles.preview} aria-label={`Source version ${selected} file preview`}>
        <div className={styles.previewHeading}><strong>Version {selected} · Saved files</strong>
          <button type="button" onClick={()=>{setPreview(null);setSelected(null);}}>Close</button></div>
        <p className={styles.muted}>Read-only excerpts; binary assets, secret files and large content are not displayed.</p>
        {preview.files.map(file=><details key={file.path} className={styles.file}>
          <summary>{file.path}{file.truncated?" · excerpt":""}</summary>
          <pre>{file.content}</pre>
        </details>)}
        {preview.omitted>0 ? <p className={styles.muted}>{preview.omitted} file(s) omitted.</p> : null}
      </div> : null}
    </div> : null}
    <dialog ref={confirmationDialogRef} className={styles.confirmDialog}
      aria-labelledby="zoebuild-version-dialog-heading"
      aria-describedby="zoebuild-version-dialog-description"
      onCancel={event => {
        event.preventDefault();
        if (!busy) setPendingAction(null);
      }}>
      {pendingAction ? <div className={styles.confirmContent}>
        <span className={styles.confirmEyebrow}>Version history</span>
        <h3 id="zoebuild-version-dialog-heading">
          {pendingAction.kind === "switch"
            ? `Switch to Version ${pendingAction.version}?`
            : `Delete Version ${pendingAction.version}?`}
        </h3>
        <p id="zoebuild-version-dialog-description">
          {pendingAction.kind === "switch"
            ? "Its saved files and dependencies will become current. Your published website, orders, and connections will not change. No new version will be created."
            : "This permanently deletes the selected saved version. Your current website is unchanged. This cannot be undone."}
        </p>
        {pendingAction.kind === "delete" ? <label className={styles.confirmLabel}>
          Type <strong>DELETE V{pendingAction.version}</strong> to confirm
          <input className={styles.confirmInput} value={deleteConfirmation}
            onChange={event=>setDeleteConfirmation(event.target.value)}
            autoComplete="off" spellCheck={false}/>
        </label> : null}
        <div className={styles.confirmActions}>
          <button type="button" className={styles.confirmCancel}
            onClick={()=>setPendingAction(null)} autoFocus>Cancel</button>
          <button type="button"
            className={pendingAction.kind === "delete" ? styles.confirmDanger : styles.confirmPrimary}
            disabled={pendingAction.kind === "delete" && deleteConfirmation !== `DELETE V${pendingAction.version}`}
            onClick={()=>{
              const {kind,version}=pendingAction;
              setPendingAction(null);
              if (kind === "switch") void restoreVersion(version);
              else void deleteVersion(version);
            }}>
            {pendingAction.kind === "switch" ? "Switch version" : "Delete version"}
          </button>
        </div>
      </div> : null}
    </dialog>
  </section>;
}
