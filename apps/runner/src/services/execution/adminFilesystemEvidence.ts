import { Readable } from "node:stream";
import type { AdminLabFilesystemExpected } from "@zoeskoul/code-contracts";
import { docker } from "../docker/dockerClient.js";
import { adminLabConfiguration } from "./learningAdminGrant.js";
import { assertAdminLabSwitch } from "./learningAdminSwitch.js";
import { getActiveSessionsForActor } from "../sessions/sessionStore.js";

/** Metadata is produced by the rootless Docker daemon, not guest commands. */
type TarMetadata = {kind: "file" | "directory" | "symlink" | "other"; mode: number; uid: number; gid: number};
export class AdminFilesystemVerifierUnavailable extends Error {
  constructor() { super("Administrative filesystem verification is unavailable."); }
}

function octalField(header: Buffer, start: number, length: number): number {
  const text = header.toString("ascii", start, start + length).replace(/\0.*$/, "").trim();
  if (!/^[0-7]+$/.test(text)) throw new AdminFilesystemVerifierUnavailable();
  const number = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(number)) throw new AdminFilesystemVerifierUnavailable();
  return number;
}

/** One POSIX tar header. Reject nonstandard/PAX metadata rather than guess. */
export function parseDockerArchiveHeader(header: Buffer): TarMetadata {
  if (header.byteLength !== 512) throw new AdminFilesystemVerifierUnavailable();
  const checksum = octalField(header, 148, 8);
  let actual = 0;
  for (let index = 0; index < 512; index++) {
    actual += index >= 148 && index < 156 ? 32 : header[index];
  }
  if (checksum !== actual) throw new AdminFilesystemVerifierUnavailable();
  const marker = header[156];
  // PAX/GNU extended headers are not file metadata. Fail without deducting a
  // learner attempt rather than incorrectly grading their filesystem state.
  if (marker === 120 || marker === 103 || marker === 76 || marker === 75) {
    throw new AdminFilesystemVerifierUnavailable();
  }
  const kind = marker === 53 ? "directory" : marker === 48 || marker === 0 ? "file" : marker === 50 ? "symlink" : "other";
  return {
    kind,
    mode: octalField(header, 100, 8) & 0o7777,
    uid: octalField(header, 108, 8),
    gid: octalField(header, 116, 8),
  };
}

type ReadonlyDockerArchive = {
  infoArchive: (args: {path: string}) => Promise<unknown>;
  getArchive: (args: {path: string}) => Promise<NodeJS.ReadableStream>;
};

async function boundedDockerCall<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new AdminFilesystemVerifierUnavailable()), 5000);
      }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

async function archiveMetadata(container: ReadonlyDockerArchive, path: string): Promise<TarMetadata | null> {
  // HEAD's LinkTarget tells us whether Docker would follow a guest symlink.
  // The tar body alone is insufficient because Docker resolves symlink paths.
  let info: unknown;
  try { info = await boundedDockerCall(container.infoArchive({ path })); }
  catch (error) {
    if ((error as {statusCode?: number})?.statusCode === 404) return null;
    throw new AdminFilesystemVerifierUnavailable();
  }
  if (!info || typeof info !== "object") throw new AdminFilesystemVerifierUnavailable();
  const record = info as Record<string, unknown>;
  const mode = record.mode ?? record.Mode;
  const linkTarget = record.linkTarget ?? record.LinkTarget;
  if (typeof mode !== "number" || !Number.isSafeInteger(mode) ||
      typeof linkTarget !== "string") throw new AdminFilesystemVerifierUnavailable();
  if ((mode & (1 << 27)) !== 0 || linkTarget.length > 0) {
    return {kind: "symlink", mode: 0, uid: 0, gid: 0};
  }

  let stream: Readable;
  try {
    const archive = await boundedDockerCall(container.getArchive({ path }));
    // Dockerode supplies a Node.js Readable. Refuse an incompatible stream
    // rather than silently reading unbounded file data without destroy().
    if (!(archive instanceof Readable)) throw new AdminFilesystemVerifierUnavailable();
    stream = archive;
  } catch (error) {
    if ((error as {statusCode?: number})?.statusCode === 404) return null;
    throw new AdminFilesystemVerifierUnavailable();
  }
  return await new Promise<TarMetadata>((resolve, reject) => {
    let finished = false;
    const chunks: Buffer[] = [];
    let bytes = 0;
    const timer = setTimeout(() => end(new AdminFilesystemVerifierUnavailable()), 5000);
    function end(error?: Error, result?: TarMetadata) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      stream.removeAllListeners("data");
      stream.removeAllListeners("error");
      stream.removeAllListeners("end");
      // Never read file content or recursively extract a directory.
      stream.on("error", () => {});
      stream.destroy();
      if (error) reject(error);
      else resolve(result!);
    }
    stream.on("data", (chunk: Buffer | string) => {
      const item = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const take = Math.min(512 - bytes, item.byteLength);
      if (take > 0) { chunks.push(item.subarray(0, take)); bytes += take; }
      if (bytes < 512) return;
      try { end(undefined, parseDockerArchiveHeader(Buffer.concat(chunks, 512))); }
      catch { end(new AdminFilesystemVerifierUnavailable()); }
    });
    stream.on("end", () => end(new AdminFilesystemVerifierUnavailable()));
    stream.on("error", () => end(new AdminFilesystemVerifierUnavailable()));
  });
}

export async function verifyAdminFilesystem(args: {
  actorKey: string;
  topicSlug: string;
  expected: AdminLabFilesystemExpected;
}): Promise<{passed: boolean; failedPaths: string[]}> {
  const generation = assertAdminLabSwitch();
  const { image } = adminLabConfiguration();
  const matching = getActiveSessionsForActor(args.actorKey).filter((session) =>
    session.labMode === "admin" && session.adminTopicSlug === args.topicSlug && (session.state === "running" || session.state === "waiting_for_input"));
  if (matching.length !== 1) throw new AdminFilesystemVerifierUnavailable();
  const session = matching[0];
  const container = docker.getContainer(session.containerId);
  let inspected;
  try { inspected = await container.inspect(); }
  catch { throw new AdminFilesystemVerifierUnavailable(); }
  const host = inspected.HostConfig;
  const labels = inspected.Config?.Labels ?? {};
  if (!inspected.State?.Running || inspected.Config?.Image !== image || inspected.Config?.User !== "0:0" ||
      labels["com.zoeskoul.runner.session"] !== session.id ||
      labels["com.zoeskoul.runner.lab-mode"] !== "admin" ||
      labels["com.zoeskoul.runner.purpose"] !== "learn" ||
      host?.Privileged !== false || host?.NetworkMode !== "none" ||
      !host?.Tmpfs?.["/workspace"] || !host?.Tmpfs?.["/tmp"] ||
      (host?.Binds ?? []).length !== 0 ||
      (inspected.Mounts ?? []).some((mount: {Type?: string}) => mount.Type !== "tmpfs")) {
    throw new AdminFilesystemVerifierUnavailable();
  }

  const failedPaths: string[] = [];
  for (const check of args.expected.required) {
    assertAdminLabSwitch(generation);
    const parts = check.path.slice("/workspace/".length).split("/");
    // Do not let a symlinked ancestor redirect inspection outside /workspace.
    let ancestor = "/workspace";
    for (const component of parts.slice(0, -1)) {
      ancestor += `/${component}`;
      const parent = await archiveMetadata(container, ancestor);
      if (!parent || parent.kind !== "directory") {
        failedPaths.push(check.path);
        break;
      }
    }
    if (failedPaths.at(-1) === check.path) continue;
    const actual = await archiveMetadata(container, check.path);
    if (!actual || actual.kind !== check.kind ||
        (check.mode !== undefined && actual.mode !== Number.parseInt(check.mode, 8)) ||
        (check.uid !== undefined && actual.uid !== check.uid) ||
        (check.gid !== undefined && actual.gid !== check.gid)) {
      failedPaths.push(check.path);
    }
  }
  assertAdminLabSwitch(generation);
  return { passed: failedPaths.length === 0, failedPaths };
}
