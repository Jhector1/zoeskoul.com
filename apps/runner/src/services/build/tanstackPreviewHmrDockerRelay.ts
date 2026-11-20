import { PassThrough } from "node:stream";
import { docker } from "../docker/dockerClient.js";
import { sharedFullStackPreviews } from "./sharedPreviewRegistry.js";
import { tanstackPreviewDevCommand } from "./tanstackPreviewRuntimePolicy.js";
import { TANSTACK_PREVIEW_HMR_WORKER } from "./tanstackPreviewHmrWorker.js";

const MAX_FRAME_BYTES = 64 * 1024;
const MAX_WORKER_LINE = 90 * 1024;
const CONNECTION_MS = 7_000;
const MAX_CONNECTION_MS = 100_000;

export type DevelopmentHmrLeaseIdentity = Readonly<{
  ownerKey: string;
  previewId: string;
  buildProjectId: string;
  sourceVersion: number;
}>;

type Worker = Readonly<{sendText: (text: string) => void; close: () => void}>;
type OpenWorker = (
  containerId: string,
  basePath: string,
  onText: (text: string) => void,
  onClose: () => void,
) => Promise<Worker>;

export class PrivateHmrRelayError extends Error {
  constructor() {
    super("Private development HMR connection unavailable.");
    this.name = "PrivateHmrRelayError";
  }
}

function strictBase64(value: unknown): Buffer {
  if (typeof value !== "string" || value.length > MAX_WORKER_LINE ||
      value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
    throw new PrivateHmrRelayError();
  const result = Buffer.from(value, "base64");
  if (result.length > MAX_FRAME_BYTES || result.toString("base64") !== value)
    throw new PrivateHmrRelayError();
  return result;
}

/** Concrete private transport. This has no HTTP or WebSocket route; only a
 * future, separately authenticated gateway may construct a relay. Docker
 * exec is the sole channel into a network-none preview container. */
export async function openTanstackHmrWorkerInDocker(
  containerId: string,
  basePath: string,
  onText: (text: string) => void,
  onClose: () => void,
): Promise<Worker> {
  if (!/^[a-f0-9]{64}$/.test(containerId))
    throw new PrivateHmrRelayError();
  try {tanstackPreviewDevCommand(basePath);}
  catch {throw new PrivateHmrRelayError();}
  // Keep the Docker lifecycle inside the fail-closed boundary. Never log
  // sandbox output or expose its private URL in error messages.
  const wire = await (async () => {
    try {
      const execution = await docker.getContainer(containerId).exec({
        Cmd: ["python3", "-u", "-c", TANSTACK_PREVIEW_HMR_WORKER],
        AttachStdin: true, AttachStdout: true, AttachStderr: false, Tty: false,
      });
      return await execution.start({hijack:true,stdin:true});
    } catch {throw new PrivateHmrRelayError();}
  })();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  docker.modem.demuxStream(wire, stdout, stderr);
  let closed = false;
  let ready = false;
  let pending = "";
  let accept!: (worker: Worker) => void;
  let reject!: (error: PrivateHmrRelayError) => void;
  const result = new Promise<Worker>((resolve, fail) => {accept=resolve;reject=fail;});
  const timeout = setTimeout(() => shutdown(), CONNECTION_MS);
  function shutdown() {
    if (closed) return;
    closed = true;
    clearTimeout(timeout);
    stdout.destroy();
    stderr.destroy();
    wire.destroy();
    if (!ready) reject(new PrivateHmrRelayError());
    else onClose();
  }
  const worker: Worker = {
    sendText(text) {
      if (closed || !ready || typeof text !== "string") throw new PrivateHmrRelayError();
      const encoded = Buffer.from(text, "utf8");
      if (encoded.length > MAX_FRAME_BYTES || encoded.toString("utf8") !== text)
        throw new PrivateHmrRelayError();
      const line = JSON.stringify({event:"text",data:encoded.toString("base64")}) + "\n";
      if (!wire.write(line)) {
        shutdown();
        throw new PrivateHmrRelayError();
      }
    },
    close() {
      if (closed) return;
      try {wire.write('{"event":"close"}\n');} catch { /* ignore */ }
      shutdown();
    },
  };
  stdout.on("data", (chunk: Buffer) => {
    try {
      pending += chunk.toString("utf8");
      if (Buffer.byteLength(pending, "utf8") > MAX_WORKER_LINE * 2)
        throw new PrivateHmrRelayError();
      let end: number;
      while ((end=pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0,end);
        pending=pending.slice(end+1);
        if (Buffer.byteLength(line,"utf8")>MAX_WORKER_LINE)
          throw new PrivateHmrRelayError();
        const message: unknown = JSON.parse(line);
        if (!message || typeof message!=="object" || Array.isArray(message))
          throw new PrivateHmrRelayError();
        const {event, data} = message as {event?:unknown;data?:unknown};
        if (event==="ready" && !ready && data===undefined) {
          ready=true;
          clearTimeout(timeout);
          accept(worker);
          continue;
        }
        if (event==="text" && ready) {
          const text = new TextDecoder("utf-8", {fatal:true}).decode(strictBase64(data));
          onText(text);
          continue;
        }
        if (event==="closed" && data===undefined) {shutdown();return;}
        throw new PrivateHmrRelayError();
      }
    } catch {shutdown();}
  });
  stdout.on("error", shutdown);
  wire.on("error", shutdown);
  wire.on("close", shutdown);
  try {wire.write(JSON.stringify({path:basePath})+"\n");}
  catch {shutdown();}
  return result;
}

/** One authenticated lease may advance through strictly increasing, DB-attested
 * revisions. During an update Vite may publish HMR messages before the
 * Runner commits the revision. Hold them in a small bounded queue and release
 * only after the update coordinator has committed the next revision.
 *
 * This is private plumbing, not a browser WebSocket route. */
export async function openOwnedTanstackDevelopmentHmrRelay(input: Readonly<{
  identity: DevelopmentHmrLeaseIdentity;
  onText: (text: string) => void;
  onClose?: () => void;
}>, deps: Readonly<{
  registry: Pick<typeof sharedFullStackPreviews,
    "assertDevelopmentReadOpen" | "get" | "developmentUpdatePending">;
  openWorker: OpenWorker;
}> = {registry:sharedFullStackPreviews,openWorker:openTanstackHmrWorkerInDocker}): Promise<Worker> {
  const before=deps.registry.assertDevelopmentReadOpen(input.identity);
  let worker: Worker | null=null;
  let stopped=false;
  let monitor: ReturnType<typeof setInterval> | null=null;
  let lifetime: ReturnType<typeof setTimeout> | null=null;
  let lastVersion=before.sourceVersion;
  const queued: string[]=[];
  const secret=before.basePath.match(/\/content\/([A-Za-z0-9_-]{32})\/$/)?.[1];
  if (!secret || !tanstackPreviewDevCommand(before.basePath))
    throw new PrivateHmrRelayError();
  function stop() {
    if (stopped) return;
    stopped=true;
    queued.length=0;
    if (monitor) clearInterval(monitor);
    if (lifetime) clearTimeout(lifetime);
    worker?.close();
    input.onClose?.();
  }
  function status(): "updating" | "open" {
    if (stopped) throw new PrivateHmrRelayError();
    const current=deps.registry.get(input.identity.previewId);
    if (!current || current.mode!=="development" ||
        current.ownerKey!==input.identity.ownerKey ||
        current.buildProjectId!==input.identity.buildProjectId ||
        current.containerId!==before.containerId || current.basePath!==before.basePath ||
        !Number.isSafeInteger(current.sourceVersion) ||
        current.sourceVersion<lastVersion) {
      stop();
      throw new PrivateHmrRelayError();
    }
    if (deps.registry.developmentUpdatePending(input.identity.previewId)) return "updating";
    // Assert the close/quarantine/read barrier (not just an owned map entry).
    try {deps.registry.assertDevelopmentReadOpen({...input.identity,sourceVersion:current.sourceVersion});}
    catch {stop();throw new PrivateHmrRelayError();}
    // The source-authorized coordinator commits a newer revision after the post-write DB
    // check. A failed write quarantines the lease instead of reaching here.
    lastVersion=current.sourceVersion;
    return "open";
  }
  function drain() {
    if (status()!=="open") return;
    while (queued.length) input.onText(queued.shift()!);
  }
  function sanitized(text: string) {
    if (typeof text!=="string" || Buffer.byteLength(text,"utf8")>MAX_FRAME_BYTES ||
        text.includes(secret!) || text.includes(encodeURIComponent(secret!))) {
      stop();
      throw new PrivateHmrRelayError();
    }
  }
  try {
    worker=await deps.openWorker(before.containerId,before.basePath,(text) => {
      try {
        // Vite may mention its private capability-bearing base in update
        // module paths. Translate only the exact active lease base to an
        // inert marker; the browser content grant substitutes its own base.
        const safeText=text.split(before.basePath).join("/__zoebuild_dev_preview_public_base__/");
        sanitized(safeText);
        if (status()==="updating") {
          if (queued.length>=16) throw new PrivateHmrRelayError();
          queued.push(safeText);
        } else {
          drain();
          input.onText(safeText);
        }
      } catch {stop();}
    },stop);
    if (stopped) {worker.close();throw new PrivateHmrRelayError();}
    if (status()!=="open") throw new PrivateHmrRelayError();
    monitor=setInterval(() => {try {drain();} catch {stop();}},500);
    monitor.unref?.();
    lifetime=setTimeout(stop,MAX_CONNECTION_MS);
    lifetime.unref?.();
    const activeWorker=worker;
    return {
      sendText(text) {
        try {
          sanitized(text);
          if (status()!=="open") throw new PrivateHmrRelayError();
          drain();
          activeWorker.sendText(text);
        } catch {stop();throw new PrivateHmrRelayError();}
      },
      close:stop,
    };
  } catch {
    stop();
    throw new PrivateHmrRelayError();
  }
}
