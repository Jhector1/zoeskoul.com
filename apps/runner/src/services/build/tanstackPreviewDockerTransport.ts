import { PassThrough } from "node:stream";
import { performance } from "node:perf_hooks";
import { docker } from "../docker/dockerClient.js";
import { TANSTACK_PREVIEW_HTTP_WORKER } from "./tanstackPreviewHttpWorker.js";
import {
  normalizeTanstackPreviewHttpResponse,
  type TanstackPreviewTransportRequest,
} from "./tanstackPreviewHttpBoundary.js";
import { boundedPreviewDuration, previewObservability } from "./previewObservability.js";

export type TanstackPreviewTransportFailureStage =
  | "docker_exec_create"
  | "docker_exec_attach"
  | "worker_protocol"
  | "loopback_connection"
  | "vite_request"
  | "vite_response"
  | "deadline";

/** A bounded, source-free failure category. Never attach the underlying
 * Docker, HTTP, path, response, or capability error to this exception. */
export class TanstackPreviewTransportError extends Error {
  constructor(readonly stage: TanstackPreviewTransportFailureStage) {
    super("Isolated preview transport failed.");
    this.name = "TanstackPreviewTransportError";
  }
}

const workerFailureStages = new Set<TanstackPreviewTransportFailureStage>([
  "worker_protocol", "loopback_connection", "vite_request", "vite_response",
]);

/** Validate the one-line worker envelope without surfacing worker-controlled
 * text. Exported for protocol regression tests; it performs no I/O. */
export function validateTanstackPreviewWorkerReply(value: unknown, expectedId = 1): object {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !Number.isSafeInteger(expectedId) || expectedId < 1 ||
      (value as { id?: unknown }).id !== expectedId) {
    throw new TanstackPreviewTransportError("worker_protocol");
  }
  const error = (value as { error?: unknown }).error;
  if (error !== undefined) {
    const stage = typeof error === "string" &&
      workerFailureStages.has(error as TanstackPreviewTransportFailureStage)
      ? error as TanstackPreviewTransportFailureStage : "worker_protocol";
    throw new TanstackPreviewTransportError(stage);
  }
  return value;
}

type PendingReply = Readonly<{
  resolve: (reply: object) => void;
  reject: (error: TanstackPreviewTransportError) => void;
  timer: ReturnType<typeof setTimeout>;
}>;
type PreviewHttpWorker = {
  containerId: string;
  stream: NodeJS.ReadWriteStream & Readonly<{destroy():void}>;
  stdout: PassThrough;
  stderr: PassThrough;
  pending: Map<number,PendingReply>;
  buffer: Buffer;
  nextId: number;
  closed: boolean;
  registration?: Promise<PreviewHttpWorker>;
};
const MAX_REPLY = 9 * 1024 * 1024;
const MAX_PENDING = 32;
const workers = new Map<string,Promise<PreviewHttpWorker>>();

function failWorker(worker:PreviewHttpWorker,error:TanstackPreviewTransportError) {
  if(worker.closed)return;
  worker.closed=true;
  worker.stdout.destroy();worker.stderr.destroy();worker.stream.destroy();
  for(const pending of worker.pending.values()){
    clearTimeout(pending.timer);pending.reject(error);
  }
  worker.pending.clear();
  if(worker.registration && workers.get(worker.containerId)===worker.registration)
    workers.delete(worker.containerId);
}

async function createWorker(containerId:string):Promise<PreviewHttpWorker> {
  const exec = await docker.getContainer(containerId).exec({
    Cmd: ["python3", "-u", "-c", TANSTACK_PREVIEW_HTTP_WORKER],
    AttachStdin: true, AttachStdout: true, AttachStderr: false, Tty: false,
  }).catch(() => { throw new TanstackPreviewTransportError("docker_exec_create"); });
  const stream = await exec.start({ hijack: true, stdin: true })
    .catch(() => { throw new TanstackPreviewTransportError("docker_exec_attach"); }) as
      PreviewHttpWorker["stream"];
  const worker:PreviewHttpWorker={containerId,stream,stdout:new PassThrough(),stderr:new PassThrough(),
    pending:new Map(),buffer:Buffer.alloc(0),nextId:1,closed:false};
  docker.modem.demuxStream(stream,worker.stdout,worker.stderr);
  worker.stdout.on("data",(raw:Buffer|string)=>{
    if(worker.closed)return;
    const chunk=Buffer.isBuffer(raw)?raw:Buffer.from(raw);
    worker.buffer=worker.buffer.length ? Buffer.concat([worker.buffer,chunk]) : chunk;
    for(;;){
      const newline=worker.buffer.indexOf(10);
      if(newline<0){
        if(worker.buffer.length>MAX_REPLY)
          failWorker(worker,new TanstackPreviewTransportError("vite_response"));
        return;
      }
      if(newline>MAX_REPLY){
        failWorker(worker,new TanstackPreviewTransportError("vite_response"));return;
      }
      const line=worker.buffer.subarray(0,newline);
      worker.buffer=worker.buffer.subarray(newline+1);
      let rawReply:unknown;
      try{rawReply=JSON.parse(line.toString("utf8"));}
      catch{failWorker(worker,new TanstackPreviewTransportError("worker_protocol"));return;}
      const id=rawReply && typeof rawReply==="object" && !Array.isArray(rawReply)
        ? (rawReply as {id?:unknown}).id : null;
      if(!Number.isSafeInteger(id) || typeof id!=="number"){
        failWorker(worker,new TanstackPreviewTransportError("worker_protocol"));return;
      }
      const pending=worker.pending.get(id);
      if(!pending){failWorker(worker,new TanstackPreviewTransportError("worker_protocol"));return;}
      worker.pending.delete(id);clearTimeout(pending.timer);
      try{pending.resolve(validateTanstackPreviewWorkerReply(rawReply,id));}
      catch(error){pending.reject(error instanceof TanstackPreviewTransportError
        ? error : new TanstackPreviewTransportError("worker_protocol"));}
    }
  });
  worker.stdout.on("error",()=>failWorker(worker,new TanstackPreviewTransportError("worker_protocol")));
  stream.on("error",()=>failWorker(worker,new TanstackPreviewTransportError("docker_exec_attach")));
  stream.on("close",()=>failWorker(worker,new TanstackPreviewTransportError("worker_protocol")));
  return worker;
}

async function acquireWorker(containerId:string) {
  let worker=workers.get(containerId);
  if(!worker){
    worker=createWorker(containerId);
    workers.set(containerId,worker);
    void worker.then(value=>{value.registration=worker;});
    void worker.catch(()=>{if(workers.get(containerId)===worker)workers.delete(containerId);});
  }
  return worker;
}

/** Explicit lifecycle hook. Destruction is idempotent and never exposes the
 * worker stream or waits on customer-controlled output. */
export async function retireTanstackHttpWorker(containerId:string):Promise<void> {
  const pending=workers.get(containerId);
  workers.delete(containerId);
  if(!pending)return;
  try{
    const worker=await pending;
    failWorker(worker,new TanstackPreviewTransportError("worker_protocol"));
  }catch{/* an already-failed worker has no live transport */}
}

async function requestWorker(worker:PreviewHttpWorker,request:TanstackPreviewTransportRequest) {
  if(worker.closed || worker.pending.size>=MAX_PENDING)
    throw new TanstackPreviewTransportError("worker_protocol");
  const id=worker.nextId++;
  if(!Number.isSafeInteger(id) || id<1){
    failWorker(worker,new TanstackPreviewTransportError("worker_protocol"));
    throw new TanstackPreviewTransportError("worker_protocol");
  }
  return new Promise<object>((resolve,reject)=>{
    const timer=setTimeout(()=>{
      failWorker(worker,new TanstackPreviewTransportError("deadline"));
    },24_000);
    worker.pending.set(id,{resolve,reject,timer});
    try{worker.stream.write(JSON.stringify({id,...request})+"\n");}
    catch{failWorker(worker,new TanstackPreviewTransportError("worker_protocol"));}
  });
}

/** One bounded multiplexed worker per exact container. No socket or host port
 * is exposed; workers are never shared across containers or tenant leases.
 * This is deliberately not the HMR/WebSocket bridge. */
export async function fetchTanstackHttpInsideSandbox(containerId: string,
  request: TanstackPreviewTransportRequest): Promise<Readonly<{
    status: number;
    headers: Readonly<Record<string,string>>;
    bodyBase64: string;
    timing?: Readonly<{dockerExecMs:number;viteUpstreamMs:number|null}>;
  }>> {
  const startedAt = performance.now();
  const endDockerExec = previewObservability.beginDockerExec();
  try {
  const worker=await acquireWorker(containerId);
  const reply=await requestWorker(worker,request);
  // No Set-Cookie, Location, or caller-supplied authentication can emerge.
  let normalized: ReturnType<typeof normalizeTanstackPreviewHttpResponse>;
  try { normalized = normalizeTanstackPreviewHttpResponse(reply); }
  catch { throw new TanstackPreviewTransportError("worker_protocol"); }
  if (normalized.upstreamDurationMs !== null)
    previewObservability.observeViteUpstream(normalized.upstreamDurationMs);
  endDockerExec("ok");
  return {
    status: normalized.status,
    headers: normalized.headers,
    bodyBase64: normalized.bodyBase64,
    timing: {
      dockerExecMs: boundedPreviewDuration(performance.now() - startedAt),
      viteUpstreamMs: normalized.upstreamDurationMs,
    },
  } as const;
  } catch (error) {
    endDockerExec("error");
    throw error instanceof TanstackPreviewTransportError
      ? error : new TanstackPreviewTransportError("worker_protocol");
  }
}
