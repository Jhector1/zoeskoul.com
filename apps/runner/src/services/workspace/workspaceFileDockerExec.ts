import path from "node:path";
import { PassThrough } from "node:stream";
import { docker } from "../docker/dockerClient.js";
import type { SessionRecord } from "../sessions/sessionStore.js";
import { resolveSandboxProfile } from "../execution/sandboxProfile.js";
import type { WorkspaceFileRequest } from "./workspaceFileProtocol.js";

/**
 * Execute an immutable file worker *inside the student's existing rootless
 * container*. Docker Exec defaults can differ by version, so explicitly set
 * the non-root user, no TTY, and fixed command. The request is sent via stdin,
 * never command arguments, environment variables or log messages.
 */
const WORKER_COMMAND = ["python3", "/opt/runner/workspace-file-worker.py"];
const TIMEOUT_MS = 12_000;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

export class WorkspaceFileUnavailableError extends Error {
  constructor() { super("Workspace file worker is unavailable."); }
}

export type WorkspaceFileWorkerResult =
  | { ok: true; [key: string]: unknown }
  | { ok: false; code: string };

export async function runWorkspaceFileWorker(
  session: SessionRecord,
  request: WorkspaceFileRequest,
): Promise<WorkspaceFileWorkerResult> {
  const profile = resolveSandboxProfile("learn");
  const container = docker.getContainer(session.containerId);
  const inspected = await container.inspect();
  const config = inspected.Config;
  const labels = config?.Labels ?? {};
  const mount = (inspected.Mounts ?? []).find(m =>
    m.Destination === "/workspace" && m.Type === "bind" && m.RW === true,
  );
  // Never run the agent against another session, an unbound workspace or a
  // container with an unexpected identity. No fallback to the host writer.
  if (!inspected.State?.Running ||
      labels["com.zoeskoul.runner.session"] !== session.id ||
      labels["com.zoeskoul.runner.purpose"] !== "learn" ||
      config?.User !== profile.user ||
      !mount || path.resolve(mount.Source ?? "") !== path.resolve(session.workspaceDir)) {
    throw new WorkspaceFileUnavailableError();
  }

  const execution = await container.exec({
    Cmd: WORKER_COMMAND,
    User: profile.user,
    WorkingDir: "/workspace",
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
    Privileged: false,
  });
  const stream = await execution.start({ hijack: true, stdin: true });
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  docker.modem.demuxStream(stream, stdout, stderr);
  // Same proven Docker-exec newline transport used by the TanStack preview
  // worker. Do not parse multiplexed Docker bytes as raw JSON.
  const response = await new Promise<WorkspaceFileWorkerResult>((resolve, reject) => {
    let settled = false;
    const pieces: Buffer[] = [];
    let total = 0;
    const timeout = setTimeout(() => finish(new WorkspaceFileUnavailableError()), TIMEOUT_MS);
    function finish(error?: Error, result?: WorkspaceFileWorkerResult) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      stdout.destroy();
      stderr.destroy();
      stream.destroy();
      if (error) reject(error);
      else resolve(result!);
    }
    stdout.on("data", (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > MAX_OUTPUT_BYTES) return finish(new WorkspaceFileUnavailableError());
      pieces.push(chunk);
      if (chunk.indexOf(10) < 0) return;
      try {
        const bytes = Buffer.concat(pieces, total);
        const end = bytes.indexOf(10);
        const reply: unknown = JSON.parse(bytes.subarray(0, end).toString("utf8"));
        if (!reply || typeof reply !== "object" || Array.isArray(reply) ||
            typeof (reply as {ok?: unknown}).ok !== "boolean" ||
            ((reply as {ok: boolean}).ok === false &&
              typeof (reply as {code?: unknown}).code !== "string")) {
          throw new Error("Invalid worker reply");
        }
        finish(undefined, reply as WorkspaceFileWorkerResult);
      } catch { finish(new WorkspaceFileUnavailableError()); }
    });
    stderr.resume();
    stdout.on("error", () => finish(new WorkspaceFileUnavailableError()));
    stream.on("error", () => finish(new WorkspaceFileUnavailableError()));
    stream.on("close", () => finish(new WorkspaceFileUnavailableError()));
    try { stream.end(JSON.stringify(request) + "\n"); }
    catch { finish(new WorkspaceFileUnavailableError()); }
  });
  return response;
}
