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
export function validateTanstackPreviewWorkerReply(value: unknown): object {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      (value as { id?: unknown }).id !== 1) {
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

/** One HTTP request per Docker exec. No socket or host port is exposed.
 * This is deliberately not an HMR/WebSocket bridge: that requires its own
 * authenticated streaming transport and acceptance tests. */
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
  const exec = await docker.getContainer(containerId).exec({
    Cmd: ["python3", "-u", "-c", TANSTACK_PREVIEW_HTTP_WORKER],
    AttachStdin: true, AttachStdout: true, AttachStderr: false, Tty: false,
  }).catch(() => { throw new TanstackPreviewTransportError("docker_exec_create"); });
  const stream = await exec.start({ hijack: true, stdin: true })
    .catch(() => { throw new TanstackPreviewTransportError("docker_exec_attach"); });
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  // Docker multiplex framing must be parsed by Dockerode, not interpreted as
  // newline-delimited application bytes directly.
  docker.modem.demuxStream(stream, stdout, stderr);
  const MAX_REPLY = 9 * 1024 * 1024;
  const reply = await new Promise<unknown>((resolve, reject) => {
    let settled = false;
    const pieces: Buffer[] = [];
    let totalBytes = 0;
    const timeout = setTimeout(() =>
      finish(new TanstackPreviewTransportError("deadline")), 24_000);
    function finish(error?: Error, result?: unknown) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      stdout.destroy();
      stderr.destroy();
      stream.destroy();
      if (error) reject(error); else resolve(result);
    }
    stdout.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_REPLY) {
        finish(new TanstackPreviewTransportError("vite_response"));
        return;
      }
      pieces.push(chunk);
      if (chunk.indexOf(10) < 0) return;
      try {
        const bytes = Buffer.concat(pieces, totalBytes);
        const end = bytes.indexOf(10);
        const item: unknown = JSON.parse(bytes.subarray(0, end).toString("utf8"));
        finish(undefined, validateTanstackPreviewWorkerReply(item));
      } catch (error) {
        finish(error instanceof TanstackPreviewTransportError
          ? error : new TanstackPreviewTransportError("worker_protocol"));
      }
    });
    stdout.on("error", () => finish(new TanstackPreviewTransportError("worker_protocol")));
    stream.on("error", () => finish(new TanstackPreviewTransportError("docker_exec_attach")));
    stream.on("close", () => finish(new TanstackPreviewTransportError("worker_protocol")));
    try {
      stream.end(JSON.stringify({ id: 1, ...request }) + "\n");
    } catch { finish(new TanstackPreviewTransportError("worker_protocol")); }
  });
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
