"use client";

import type {PrivateReleaseHistory} from "@/lib/build/privatePublishControl";

import {
  ProjectPublishIcon,
} from "./ProjectTopbarIcons";

import {
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
  type ReactNode,
} from "react";

export type PublishedDeploymentView =
  Readonly<{
    deploymentId: string;
    sourceVersion: number;
    artifactHash: string;
    deployedAt: string;
    publicUrl: string;
    privatePilot?: true;
    fenced?: true;
    hostname?: string;
  }>;

type HistoryView=Omit<PrivateReleaseHistory,"active"> & {active:PublishedDeploymentView|null;fenced?:true;publicHosting?:boolean;retentionLimit?:number;generation?:string;hostname?:string|null;pending?:{operationId:string;action:string}|null};
function historyMessage(state:HistoryView) {
  if(state.pending) return "Publication pending. Recover the exact operation before starting another.";
  if(state.fenced) return state.active ? `Committed ${state.publicHosting?"public":"private"} deployment v${state.active.sourceVersion}` : state.publicHosting?"Site unpublished":"Private site unpublished";
  return state.active ? `Private deployment v${state.active.sourceVersion}` : "Private site unpublished";
}
type PublishPayload =
  | {ok:true;state:"committed";deployment:unknown}
  | {
      ok: true;

      deployment:
        PublishedDeploymentView &
        Readonly<{
          reused: boolean;
        }>;
    }
  | {
      ok: false;
      code?: string;
      message?: string;
    };

function privatePublishMessage(code?: string): string {
  switch (code) {
    case "BUILD_PILOT_NOT_ENTITLED_OR_NOT_SELECTED": return "Private publishing is not authorized for this project revision.";
    case "BUILD_PILOT_SOURCE_OR_STACK_INVALID":
    case "BUILD_PILOT_SOURCE_CHANGED": return "The saved revision changed during publishing. Save your project and retry.";
    case "BUILD_FENCED_OPERATION_PENDING": return "Publication pending. Open Deployments to recover the existing operation.";
    case "BUILD_PILOT_MUTATION_BUSY": return "Another publishing operation is running. Try again after it finishes.";
    case "BUILD_RATE_LIMITED": return "Too many publish attempts. Try again later.";
    case "BUILD_PILOT_STORAGE_CONFIG_FAILED":
    case "BUILD_PILOT_STAGE_ARTIFACT_FAILED":
    case "BUILD_PILOT_READBACK_FAILED": return "Publishing storage verification failed. The previous deployment is unchanged.";
    case "BUILD_PILOT_COMPILE_FAILED": return "The production build failed. The previous deployment is unchanged.";
    case "BUILD_PILOT_DEPLOYMENT_STATUS_FAILED": return "The private publishing host is unavailable. Check the deployment connection.";
    case "BUILD_PILOT_ACTIVATE_FAILED": return "The new website did not confirm activation. Check the current private deployment before retrying.";
    default: return "Project could not be published.";
  }
}

function usePublishingController(
  props: {
    buildProjectId:
      string;

    privateHydrationAllowed?: boolean;

    initialDeployment?:
      PublishedDeploymentView | null;
  },
) {
  const [
    publishing,
    setPublishing,
  ] =
    useState(false);

  const [
    deployment,
    setDeployment,
  ] =
    useState<
      PublishedDeploymentView | null
    >(
      props.initialDeployment ??
        null,
    );

  const [
    message,
    setMessage,
  ] =
    useState<
      string | null
    >(
      props.initialDeployment
        ? `Published v${props.initialDeployment.sourceVersion}`
        : null,
    );

  const [publishError, setPublishError] = useState<string | null>(null);
  const publishAttempt = useRef(0);
  const [history,setHistory]=useState<HistoryView|null>(null);
  const [privateManagementAvailable,setPrivateManagementAvailable]=useState(false);
  const [managing,setManaging]=useState(false);
  const [managementMessage,setManagementMessage]=useState<string|null>(null);
  const operation=useRef(false);
  const [checking,setChecking]=useState(props.privateHydrationAllowed===true);
  const canReadPrivate=()=>props.privateHydrationAllowed===true && (process.env.NODE_ENV==="production" || (process.env.NODE_ENV==="development" && window.location.origin==="http://localhost:3004"));
  const fencedProject=props.privateHydrationAllowed===true && (process.env.NODE_ENV==="production" || (process.env.NODE_ENV==="development" && props.buildProjectId==="cmwvhcusk0002u0dlwhxh9uh2"));
  const managementUrl=`/api/build/projects/${encodeURIComponent(props.buildProjectId)}/publish/manage`;

  async function fetchHistory(signal?:AbortSignal):Promise<HistoryView|null> {
    if (!canReadPrivate()) return null;
    const response=await fetch(managementUrl,{credentials:"same-origin",cache:"no-store",signal});
    if (!response.ok) return null;
    const payload=await response.json();
    return payload?.ok && Array.isArray(payload.history?.releases) ? payload.history as HistoryView : null;
  }

  function applyHistory(state:HistoryView) {
    setPrivateManagementAvailable(true);
    setHistory(state);
    setDeployment(state.active);
  }

  // History is the primary hydration source. The existing private status endpoint
  // is a fallback capability signal, even when the site is unpublished.
  useEffect(()=>{
    if (!canReadPrivate()) {
      setChecking(false);setHistory(null);setPrivateManagementAvailable(false);setManagementMessage(null);
      return;
    }
    setChecking(true);
    const attempt=publishAttempt.current;
    const controller=new AbortController();
    let retry:ReturnType<typeof setTimeout>|undefined;
    const current=()=>!controller.signal.aborted && attempt===publishAttempt.current;
    setHistory(null);
    setPrivateManagementAvailable(false);
    setManagementMessage(null);
    async function hydrate(retries:number) {
      if (!current()) return;
      const state=await fetchHistory(controller.signal).catch(()=>null);
      if (!current()) return;
      if (state) {
        setChecking(false);
        applyHistory(state);
        setMessage(historyMessage(state));
        return;
      }
      if(fencedProject) {
        if(retries>0) retry=setTimeout(()=>void hydrate(retries-1),1000);
        else {setChecking(false);setDeployment(null);setMessage("Committed deployment status unavailable. Refresh deployments.");}
        return;
      }
      // Authentication/authority or host readiness can be transient at mount.
      // A successful owner-scoped status response keeps the entry point usable.
      const response=await fetch(`/api/build/projects/${encodeURIComponent(props.buildProjectId)}/publish`, {
        credentials:"same-origin",cache:"no-store",signal:controller.signal,
      }).catch(()=>null);
      const payload=response?.ok ? await response.json().catch(()=>null) : null;
      if (!current()) return;
      if (payload?.ok && (payload.deployment===null || (payload.deployment?.privatePilot===true && payload.deployment.publicUrl==="http://127.0.0.1:33105/"))) {
        setChecking(false);
        setPrivateManagementAvailable(true);
        setDeployment(payload.deployment);
        setMessage(payload.deployment ? `Private deployment v${payload.deployment.sourceVersion}` : "Private site unpublished");
        return;
      }
      if (retries>0 && response?.status!==403 && response?.status!==404) {
        retry=setTimeout(()=>void hydrate(retries-1),1000);
      } else setChecking(false);
    }
    void hydrate(2);
    return ()=>{controller.abort();if(retry!==undefined) clearTimeout(retry);};
  },[props.buildProjectId,props.privateHydrationAllowed]);

  async function refreshHistory() {
    if (!canReadPrivate() || operation.current) return;
    operation.current=true;
    setPublishError(null);
    publishAttempt.current++;
    setChecking(false);
    setHistory(null);
    setManagementMessage(null);setManaging(true);
    try {
      const state=await fetchHistory();
      if(!state) throw new Error("Could not refresh retained deployments.");
      applyHistory(state);
      setMessage( historyMessage(state) );
    } catch {setManagementMessage("Could not refresh retained deployments. Retry to load the current releases.");setMessage("Deployment status not confirmed. Refresh deployments.");}
    finally {operation.current=false;setManaging(false);}
  }

  async function manage(action:"restore"|"unpublish"|"recover"|"retry",target:string|null) {
    if (!canReadPrivate() || !history || operation.current) return;
    if (history.pending && action!=="recover" && action!=="retry") return;
    if ((action==="recover"||action==="retry") && (!history.fenced||!history.pending)) return;
    if (action==="restore" && !history.releases.some(release=>release.deploymentId===target && history.active?.deploymentId!==target)) return;
    if (action==="unpublish" && !history.active) return;
    if (action!=="recover" && !window.confirm(action==="retry" ? "Retry the exact pending operation? No new build or operation will be created." : action==="unpublish" ? "Unpublish this site? Retained releases will remain available." : "Activate this retained deployment instead of the current website?")) return;
    operation.current=true;
    setPublishError(null);
    publishAttempt.current++;
    setChecking(false);
    setManaging(true);setManagementMessage(null);
    const headers:Record<string,string>={"x-zoebuild-release-action":action,"x-zoebuild-release-active":history.active?.deploymentId??"none"};
    if (history.active) headers["x-zoebuild-release-activated-at"]=history.active.deployedAt;
    if (target) headers["x-zoebuild-release-target"]=target;
    if(history.fenced && history.generation!==undefined) headers["x-zoebuild-fenced-generation"]=history.generation;
    if((action==="recover"||action==="retry") && history.pending) headers["x-zoebuild-fenced-operation"]=history.pending.operationId;
    try {
      const response=await fetch(managementUrl,{method:"POST",credentials:"same-origin",headers});
      const payload=await response.json().catch(()=>null);
      if (!response.ok || !payload?.ok || !payload.history) throw new Error("Release operation not confirmed. Refresh the deployment list before retrying.");
      applyHistory(payload.history);
      setMessage(historyMessage(payload.history));
      setManagementMessage(action==="recover"||action==="retry"?"Pending operation resolved.":action==="unpublish"?"Site unpublished. Retained releases were kept.":"Retained deployment activated without recompiling.");
    } catch(error) {
      setManagementMessage(error instanceof Error?error.message:"Release operation not confirmed.");
      const state=await fetchHistory().catch(()=>null);
      if(state){applyHistory(state);setMessage( historyMessage(state) );}
      else {setHistory(null);setMessage("Deployment status not confirmed. Refresh deployments.");}
    } finally {operation.current=false;setManaging(false);}
  }

  async function publish() {
    if (operation.current || (fencedProject && (!history || history.pending))) {
      return;
    }

    operation.current=true;
    setPublishError(null);
    publishAttempt.current++;
    setChecking(false);
    setHistory(null);
    setManagementMessage(null);
    setPublishing(true);
    setMessage(null);

    try {
      const response =
        await fetch(
          `/api/build/projects/${encodeURIComponent(
            props.buildProjectId,
          )}/publish`,
          {
            method:
              "POST",

            credentials:
              "same-origin",
          },
        );

      const payload =
        await response
          .json()
          .catch(
            () => null,
          ) as
          | PublishPayload
          | null;

      if (
        !response.ok ||
        !payload ||
        !payload.ok
      ) {
        throw new Error(
          payload &&
          !payload.ok &&
          payload.message
            ? payload.message
            : privatePublishMessage(payload && !payload.ok ? payload.code : undefined),
        );
      }

      if ("state" in payload) {
        setMessage("Publication committed. Refreshing deployment status…");
        return;
      }
      setDeployment(
        payload.deployment,
      );
      if (payload.deployment.privatePilot) setPrivateManagementAvailable(true);

      setMessage(
        payload.deployment.privatePilot
          ? `Private deployment v${payload.deployment.sourceVersion}`
          : `Published v${payload.deployment.sourceVersion}`,
      );
    } catch (error) {
      const failure = error instanceof Error
        ? error.message
        : "Project could not be published.";
      setMessage(failure);
      setPublishError(failure);
    } finally {
      const state=await fetchHistory().catch(()=>null);
      if(state) {applyHistory(state);if(state.fenced)setMessage(historyMessage(state));}
      else if(fencedProject){setDeployment(null);setMessage("Deployment status not confirmed. Refresh deployments.");}
      operation.current=false;
      setPublishing(false);
    }
  }

  return { publishing, deployment, message, publishError, history, managing, managementMessage, checking,
    privateManagementAvailable: props.privateHydrationAllowed===true && (fencedProject || privateManagementAvailable || deployment?.privatePilot === true || history !== null),
    publishBlocked: fencedProject && (checking || !history || !!history.pending),
    refreshHistory, manage, publish };
}

const PublishingContext = createContext<ReturnType<typeof usePublishingController> | null>(null);

/** One controller per project, kept mounted while the editor switches workspaces. */
export function ProjectPublishingProvider(props: {
  buildProjectId: string;
  initialDeployment?: PublishedDeploymentView | null;
  privateHydrationAllowed?: boolean;
  children: ReactNode;
}) {
  const controller = usePublishingController(props);
  return <PublishingContext.Provider value={controller}>{props.children}</PublishingContext.Provider>;
}

export function useProjectPublishing() {
  const controller = useContext(PublishingContext);
  if (!controller) throw new Error("Project publishing provider is missing");
  return controller;
}

export function PrivateDeploymentHistory() {
  const {history, publishing, managing, managementMessage, refreshHistory, manage} = useProjectPublishing();
  const busy = publishing || managing;
  return <>
    <button type="button" className="zb-project-published-link" disabled={busy} onClick={()=>void refreshHistory()}>
      {history ? "Refresh deployments" : "Load deployments"}
    </button>
    {history ? <>
      {history.fenced ? <p style={{fontSize:12,margin:"8px 0"}}>Committed generation {history.generation} · {history.publicHosting?"Public hosting":"Private hosting"}{history.hostname ? ` · ${history.hostname}` : ""}{history.publicHosting?"":". Public HTTPS is not configured."}</p>:null}
      {history.pending ? <div role="status" style={{fontSize:12,margin:"8px 0"}}>Publication pending. Serving authorization may be unavailable.<div><button type="button" className="zb-project-published-link" disabled={busy} onClick={()=>void manage("recover",null)}>Recover operation</button> <button type="button" className="zb-project-published-link" disabled={busy} onClick={()=>void manage("retry",null)}>Retry exact operation</button></div></div>:null}
      <p style={{fontSize:12,margin:"8px 0"}}>{history.active?`Active revision v${history.active.sourceVersion}`:"Site unpublished"} · {history.releases.length}/{history.retentionLimit??5} retained releases</p>
      {history.releases.length===0 ? <p>No retained deployments yet.</p> : null}
      {history.releases.map(release=>{
        const active=history.active?.deploymentId===release.deploymentId;
        return <div key={release.deploymentId} style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12,borderTop:"1px solid var(--zb-border, GrayText)",padding:"10px 0",fontSize:13}}>
          <div><strong>Version {release.sourceVersion}</strong><div style={{fontSize:11,opacity:.8}}>{new Date(release.createdAt).toLocaleString()} · {release.deploymentId.slice(0,8)}</div></div>
          {active?<span>{history.pending?"Last committed":"Active"}</span>:<button type="button" className="zb-project-published-link" disabled={busy || !!history.pending} onClick={()=>void manage("restore",release.deploymentId)}>{history.active?"Rollback":"Republish"}</button>}
        </div>;
      })}
      {history.active ? <button type="button" className="zb-project-published-link" style={{marginTop:12}} disabled={busy || !!history.pending} onClick={()=>void manage("unpublish",null)}>Unpublish</button>:null}
    </> : null}
    {managing?<p role="status">{history?"Updating deployment…":"Loading deployments…"}</p>:null}
    {managementMessage?<p role="status" style={{fontSize:12}}>{managementMessage}</p>:null}
  </>;
}

export function PublishProjectButton() {
  const {publishError, deployment, publishing, managing, publishBlocked, publish} = useProjectPublishing();
  const siteLabel = deployment?.privatePilot ? "View private site" : "View site";
  return (
    <div
      className="zb-project-modebar-actions"
      aria-live="polite"
    >
      {publishError ? (
        <span className="zb-project-publish-status" role="alert" title={publishError}>
          {publishError}
        </span>
      ) : null}

      {deployment?.publicUrl ? (
        <a
          className="zb-project-published-link"
          href={deployment.publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={siteLabel}
          title={siteLabel}
          style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:27,height:27,flex:"0 0 27px",borderRadius:7}}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="9.5" />
            <ellipse cx="12" cy="12" rx="4.5" ry="9.5" />
            <path d="M2.5 12h19" />
          </svg>
        </a>
      ) : null}
      <button
        type="button"
        className="zb-project-publish-button"
        disabled={publishing || managing || publishBlocked}
        onClick={publish}
      >
          <ProjectPublishIcon className="zb-project-publish-icon" />
        {publishing
          ? "Publishing…"
          : "Publish"}
      </button>
    </div>
  );
}
