/**
 * Phase 4E3A — browser-only control-plane session; opt-in integration pending.
 *
 * Sends ONLY a persisted sourceVersion to the authenticated ZoeBuild API.
 * A development lease is mutable and must never be treated like an immutable
 * preview. The Runner permits strictly newer complete saved snapshots; exact prior
 * lease CAS and current DB authorization remain mandatory on every update.
 *
 * Browser URLs are scoped, short-lived, read-only, and intentionally never
 * include Docker/Vite capabilities. The caller must renew the grant before
 * expiry and replace iframe src on successful revision updates. WebSocket
 * HMR is NOT handled by this module.
 */

const PROJECT_ID = /^[A-Za-z0-9_-]{1,128}$/;
const PREVIEW_ID = /^preview_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const READ_TOKEN = /^(?:dpv1\.[A-Za-z0-9_-]{32,1000}|dpg1\.[A-Za-z0-9_-]{43})$/;
const READ_TOKEN_REFRESH_MS = 60_000; // refresh well before 120 s expiry
// The server separately requires ZOEBUILD_DEVELOPMENT_PREVIEW_STABLE_READ_ENABLED.
// Keep at least 20 s remaining on a reused grant after an update.
const MAX_REUSED_GRANT_AGE_MS = 100_000;

export type DevelopmentBrowserSession = Readonly<{
  previewId: string;
  sourceVersion: number;
  documentUrl: string;
  grantIssuedAt: number;
}>;

export class DevelopmentBrowserSessionError extends Error {
  constructor(readonly code: "INVALID_REVISION" | "RESTART_REQUIRED" |
    "RETRYABLE_UPDATE" | "BUSY" | "UNAVAILABLE" | "CLOSED", message: string,
    readonly httpStatus?: number) {
    super(message);
    this.name = "DevelopmentBrowserSessionError";
  }
}

type FetchClient = (input: string, init: RequestInit) => Promise<Response>;
type ResponseObject = Record<string, unknown>;

function positiveRevision(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 1;
}
function exactKeys(v: unknown, keys: readonly string[]): v is ResponseObject {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const record = v as ResponseObject;
  return keys.every(key => Object.prototype.hasOwnProperty.call(record, key));
}
function publicReadPath(project: string, preview: string, url: unknown): url is string {
  if (typeof url !== "string" || url.length > 1700 || !PREVIEW_ID.test(preview))
    return false;
  const prefix = `/api/build/projects/${encodeURIComponent(project)}/preview/${encodeURIComponent(preview)}/development/content/`;
  if (!url.startsWith(prefix) || !url.endsWith("/") || url.includes("?") || url.includes("#")) return false;
  return READ_TOKEN.test(url.slice(prefix.length, -1));
}
async function postRevision(fetchClient: FetchClient, path: string, sourceVersion: number,
  extra: Readonly<Record<string,string>> = {}): Promise<ResponseObject> {
  const started = Date.now();
  const suffix = path.split("/").pop();
  const operation = suffix && ["start", "read-access", "update", "renew-access"].includes(suffix)
    ? suffix : "unknown";
  const diagnostic = (event: string, status: number | null = null, accepted: boolean | null = null) => {
    if (process.env.NODE_ENV === "development")
      console.info("[ZOE-HMR]", JSON.stringify({event, operation, sourceVersion, status, accepted, elapsedMs: Date.now()-started}));
  };
  diagnostic("control_request");
  let response: Response;
  try {
    response = await fetchClient(path, {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ sourceVersion, ...extra }),
    });
  } catch (error) {
    diagnostic("control_transport_failure");
    throw new DevelopmentBrowserSessionError("UNAVAILABLE", "Development preview transport unavailable.");
  }
  let body: unknown = null;
  if ((response.headers.get("content-type") ?? "").startsWith("application/json")) {
    body = await response.json().catch(() => null);
  }
  diagnostic("control_response", response.status, response.ok && exactKeys(body, ["ok"]) && body.ok === true);
  if (!response.ok || !exactKeys(body, ["ok"]) || body.ok !== true)
    throw new DevelopmentBrowserSessionError(
      response.status === 409 ? "RESTART_REQUIRED" :
        operation === "update" && response.status === 503 && exactKeys(body,["code"]) &&
          body.code === "BUILD_PREVIEW_UPDATE_RETRYABLE" ? "RETRYABLE_UPDATE" : "UNAVAILABLE",
      response.status === 409 ? "Saved preview revision must restart." :
        operation === "update" && response.status === 503 && exactKeys(body,["code"]) &&
          body.code === "BUILD_PREVIEW_UPDATE_RETRYABLE" ?
          "Development preview update was not applied." : "Development preview unavailable.",
      response.status,
    );
  return body;
}

/**
 * UI-independent orchestrator. Use one instance per project/active tab.
 * It refuses concurrent mutations rather than letting stale replies rebind
 * an iframe. It never caches a grant across a saved revision transition.
 * This is a control-plane foundation; no editor enables it yet.
 */
export function createDevelopmentPreviewBrowserSession(input: Readonly<{
  buildProjectId: string;
  fetchClient: FetchClient;
  now?: () => number;
}>) {
  if (!PROJECT_ID.test(input.buildProjectId) || typeof input.fetchClient !== "function")
    throw new DevelopmentBrowserSessionError("UNAVAILABLE", "Invalid preview project.");
  const now = input.now ?? Date.now;
  const root = `/api/build/projects/${encodeURIComponent(input.buildProjectId)}/preview`;
  let current: DevelopmentBrowserSession | null = null;
  // Private recovery hint, never a renderable/current session. It can be
  // consumed only once by restart for the exact requested durable revision.
  let recovery: {lease: DevelopmentBrowserSession; sourceVersion: number} | null = null;
  // A pre-write rejection is a retry capability, NOT a renderable document.
  let retry: {lease: DevelopmentBrowserSession; sourceVersion: number} | null = null;
  function uncertain(error: unknown): boolean {
    return error instanceof DevelopmentBrowserSessionError && error.code === "UNAVAILABLE" &&
      (error.httpStatus === undefined || error.httpStatus < 400 || error.httpStatus >= 500);
  }
  let busy = false;
  let closed = false;
  let generation = 0;

  function begin() {
    if (closed) throw new DevelopmentBrowserSessionError("CLOSED", "Preview session closed.");
    if (busy) throw new DevelopmentBrowserSessionError("BUSY", "Preview update is in progress.");
    busy = true;
    return generation;
  }
  function end() { busy = false; }
  function assertActive(snapshot: number) {
    if (closed || generation !== snapshot)
      throw new DevelopmentBrowserSessionError("CLOSED", "Preview session closed.");
  }
  function revision(inputRevision: unknown): asserts inputRevision is number {
    if (!positiveRevision(inputRevision))
      throw new DevelopmentBrowserSessionError("INVALID_REVISION", "Invalid saved revision.");
  }
  async function readGrant(previewId: string, sourceVersion: number, snapshot: number): Promise<DevelopmentBrowserSession> {
    const data = await postRevision(input.fetchClient,
      `${root}/${encodeURIComponent(previewId)}/development/read-access`, sourceVersion);
    assertActive(snapshot);
    if (data.sourceVersion !== sourceVersion ||
        !publicReadPath(input.buildProjectId, previewId, data.documentUrl) ||
        data.basePath !== data.documentUrl)
      throw new DevelopmentBrowserSessionError("UNAVAILABLE", "Untrusted preview document location.");
    return { previewId, sourceVersion, documentUrl: data.documentUrl, grantIssuedAt: now() };
  }
  async function admit(sourceVersion:number,snapshot:number):Promise<DevelopmentBrowserSession> {
    const data = await postRevision(input.fetchClient, `${root}/development/start`, sourceVersion);
    assertActive(snapshot);
    if (data.sourceVersion !== sourceVersion || typeof data.previewId !== "string" ||
        !PREVIEW_ID.test(data.previewId))
      throw new DevelopmentBrowserSessionError("UNAVAILABLE", "Invalid Runner preview identity.");
    const granted = await readGrant(data.previewId, sourceVersion, snapshot);
    assertActive(snapshot);
    current = granted;
    return current;
  }
  function durableToken(lease:DevelopmentBrowserSession):string|null {
    const prefix=`${root}/${encodeURIComponent(lease.previewId)}/development/content/`;
    const token=lease.documentUrl.startsWith(prefix) && lease.documentUrl.endsWith("/")
      ? lease.documentUrl.slice(prefix.length,-1) : "";
    return /^dpg1\.[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
  }
  async function renewDurable(lease:DevelopmentBrowserSession,sourceVersion:number,stamp:number):Promise<DevelopmentBrowserSession> {
    const grantToken=durableToken(lease);
    if(!grantToken)throw new DevelopmentBrowserSessionError("UNAVAILABLE","Invalid durable grant.");
    const result=await postRevision(input.fetchClient,
      `${root}/${encodeURIComponent(lease.previewId)}/development/renew-access`,
      sourceVersion,{grantToken});
    assertActive(stamp);
    if(result.sourceVersion!==sourceVersion)
      throw new DevelopmentBrowserSessionError("UNAVAILABLE","Stale preview grant renewal.");
    return {...lease,sourceVersion,grantIssuedAt:now()};
  }
  async function start(sourceVersion: number): Promise<DevelopmentBrowserSession> {
    revision(sourceVersion);
    if (current) throw new DevelopmentBrowserSessionError("RESTART_REQUIRED", "Active lease already exists.");
    const stamp = begin();
    recovery=null;
    retry=null;
    try {
      return await admit(sourceVersion,stamp);
    } catch (error) {
      current = null;
      throw error;
    } finally { end(); }
  }
  async function restart(sourceVersion:number):Promise<DevelopmentBrowserSession> {
    revision(sourceVersion);
    const stamp=begin();
    current=null;
    const candidate=recovery;
    recovery=null;
    retry=null;
    try {
      if(candidate && candidate.sourceVersion===sourceVersion) {
        try {
          // Existing authenticated renew endpoint checks durable grant, DB
          // revision and the exact fenced live Runner lease. No source write.
          const renewed=await renewDurable(candidate.lease,sourceVersion,stamp);
          assertActive(stamp);
          current=renewed;
          return current;
        } catch {
          assertActive(stamp);
          // No proof: leave the old lease non-renderable. Ordinary independent
          // saved-source admission remains the existing fallback policy.
        }
      }
      return await admit(sourceVersion,stamp);
    }
    catch(error) { current=null;throw error; }
    finally { end(); }
  }
  async function update(sourceVersion: number): Promise<DevelopmentBrowserSession> {
    revision(sourceVersion);
    const stamp = begin();
    const lease = current ?? (retry && sourceVersion >= retry.sourceVersion ? retry.lease : null);
    retry=null;
    recovery=null;
    let awaitingWrite = false;
    try {
      if (!lease || sourceVersion <= lease.sourceVersion) {
        current = null; // never continue a regressed or unknown lease
        throw new DevelopmentBrowserSessionError("RESTART_REQUIRED", "A new saved preview lease is required.");
      }
      // The previous revision's token becomes stale as soon as DB CAS advances.
      // Do not expose the old iframe URL after starting this mutation.
      current = null;
      awaitingWrite = true;
      const data = await postRevision(input.fetchClient,
        `${root}/${encodeURIComponent(lease.previewId)}/development/update`, sourceVersion);
      awaitingWrite = false;
      assertActive(stamp);
      if (data.action !== "updated" || data.sourceVersion !== sourceVersion)
        throw new DevelopmentBrowserSessionError("UNAVAILABLE", "Invalid development update response.");
      // Durable DB grants are renewed in place, so the iframe URL never
      // changes and cannot accidentally become an expired static token.
      if(durableToken(lease)) {
        const renewed=await renewDurable(lease,sourceVersion,stamp);
        assertActive(stamp);
        current=renewed;
        return current;
      }
      const newGrant = await readGrant(lease.previewId, sourceVersion, stamp);
      assertActive(stamp);
      // Existing document and module URL stay unchanged only when explicitly
      // opted in AND a still-unexpired grant has comfortable lifetime left.
      // Server rechecks current database source + Runner lease on every read.
      const stable = process.env.NEXT_PUBLIC_ZOEBUILD_DEVELOPMENT_PREVIEW_STABLE_URL_ENABLED === "true";
      current = stable && now() >= lease.grantIssuedAt &&
        now() - lease.grantIssuedAt < MAX_REUSED_GRANT_AGE_MS
        ? { ...newGrant, documentUrl: lease.documentUrl, grantIssuedAt: lease.grantIssuedAt }
        : newGrant;
      return current;
    } catch (error) {
      // This bounded response is emitted only when the Runner proves that the
      // failure happened before the workspace write. Retain the exact lease so
      // the editor may retry the same or a newer authorized saved snapshot. Every other
      // failure remains uncertain or destructive and invalidates the session.
      current = null;
      if (closed || generation !== stamp) {
        retry = null;
        assertActive(stamp);
      }
      if (awaitingWrite && lease && sourceVersion > lease.sourceVersion &&
          error instanceof DevelopmentBrowserSessionError && error.code === "RETRYABLE_UPDATE") {
        retry = {lease, sourceVersion};
      }
      if (!closed && generation===stamp && lease && sourceVersion>lease.sourceVersion &&
          durableToken(lease) && uncertain(error)) recovery={lease,sourceVersion};
      throw error;
    } finally { end(); }
  }
  async function renew(): Promise<DevelopmentBrowserSession> {
    const stamp = begin();
    const lease = current;
    recovery=null;
    retry=null;
    try {
      if (!lease) throw new DevelopmentBrowserSessionError("RESTART_REQUIRED", "Preview lease unavailable.");
      const renewed = durableToken(lease)
        ? await renewDurable(lease,lease.sourceVersion,stamp)
        : await readGrant(lease.previewId, lease.sourceVersion, stamp);
      assertActive(stamp);
      current = renewed;
      return current;
    } catch (error) {
      current = null; // no expired grant can remain visible as valid
      if (!closed && generation===stamp && lease && durableToken(lease) && uncertain(error))
        recovery={lease,sourceVersion:lease.sourceVersion};
      throw error;
    } finally { end(); }
  }
  return {
    start, restart, update, renew,
    snapshot: (): DevelopmentBrowserSession | null => current ? { ...current } : null,
    renewalDue: (): boolean => current !== null && now() - current.grantIssuedAt >= READ_TOKEN_REFRESH_MS,
    close: () => { closed = true; generation++; current = null; recovery=null; retry=null; },
  };
}
