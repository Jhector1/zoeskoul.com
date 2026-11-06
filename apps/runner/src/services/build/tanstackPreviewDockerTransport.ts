import { PassThrough } from "node:stream";
import { performance } from "node:perf_hooks";
import { docker } from "../docker/dockerClient.js";
import { TANSTACK_PREVIEW_HTTP_WORKER } from "./tanstackPreviewHttpWorker.js";
import {
  normalizeTanstackPreviewHttpResponse,
  type TanstackPreviewTransportRequest,
} from "./tanstackPreviewHttpBoundary.js";
import { boundedPreviewDuration, previewObservability } from "./previewObservability.js";

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
  });
  const stream = await exec.start({ hijack: true, stdin: true });
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
    const timeout = setTimeout(() => finish(new Error("Preview HTTP deadline exceeded.")), 24_000);
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
        finish(new Error("Preview HTTP response too large."));
        return;
      }
      pieces.push(chunk);
      if (chunk.indexOf(10) < 0) return;
      try {
        const bytes = Buffer.concat(pieces, totalBytes);
        const end = bytes.indexOf(10);
        const item: unknown = JSON.parse(bytes.subarray(0, end).toString("utf8"));
        if (!item || typeof item !== "object" || Array.isArray(item) ||
            (item as { id?: unknown }).id !== 1 ||
            typeof (item as { error?: unknown }).error === "string") {
          throw new Error("Preview HTTP transport failed.");
        }
        finish(undefined, item);
      } catch { finish(new Error("Invalid preview HTTP transport response.")); }
    });
    stdout.on("error", () => finish(new Error("Preview HTTP transport failed.")));
    stream.on("error", () => finish(new Error("Preview HTTP transport failed.")));
    stream.on("close", () => finish(new Error("Preview HTTP connection closed.")));
    try {
      stream.end(JSON.stringify({ id: 1, ...request }) + "\n");
    } catch { finish(new Error("Preview HTTP request failed.")); }
  });
  // No Set-Cookie, Location, or caller-supplied authentication can emerge.
  const normalized = normalizeTanstackPreviewHttpResponse(reply);
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
    throw error;
  }
}
