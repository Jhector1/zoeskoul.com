import crypto from "node:crypto";
import { readAdminVerifierLogOutput } from "./adminVerifierLogOutput.js";
import type { AdminLabFilesystemExpected } from "@zoeskoul/code-contracts";
import { AdminLabFilesystemExpectedSchema } from "@zoeskoul/code-contracts";
import { docker } from "../docker/dockerClient.js";
import { adminLabConfiguration } from "./learningAdminGrant.js";
import { assertAdminLabSwitch } from "./learningAdminSwitch.js";
import { verifyAdminWorkspaceVolume } from "./adminWorkspaceVolume.js";
import { getActiveSessionsForActor } from "../sessions/sessionStore.js";

/** Trusted, read-only verifier: separate PID/mount namespace, never guest exec. */
export class AdminFilesystemVerifierUnavailable extends Error {
  constructor() { super("Administrative filesystem verification is unavailable."); }
}

// This program comes from the pinned image command, not the student workspace.
// Use fd-relative O_PATH|O_NOFOLLOW so no path component can redirect checks.
const VERIFY_PROGRAM = String.raw`# This file is copied verbatim into the Dockerode verifier Cmd string.
# It uses fd-relative lstat-style operations, never following symlinks.
import errno
import json
import os
import stat
import sys


def main():
    if os.path.exists('/docker.sock') or os.path.exists('/var/run/docker.sock'):
        raise RuntimeError('socket exposed')
    if not os.statvfs('/').f_flag & os.ST_RDONLY:
        raise RuntimeError('rootfs must be read only')
    if not os.statvfs('/workspace').f_flag & os.ST_RDONLY:
        raise RuntimeError('workspace must be read only')
    with open('/proc/self/mountinfo', encoding='utf-8') as mounts:
        filesystem_types = [line.split(' - ', 1)[1].split()[0]
                            for line in mounts if ' - ' in line and
                            line.split(' - ', 1)[0].split()[4] == '/workspace']
    if filesystem_types != ['tmpfs']:
        raise RuntimeError('workspace must be memory backed')
    requested = json.loads(sys.argv[1])
    if not isinstance(requested, list) or len(requested) > 8:
        raise RuntimeError('invalid verification request')
    base = os.open('/workspace', os.O_PATH | os.O_NOFOLLOW | os.O_DIRECTORY)
    failed = []
    try:
        for target in requested:
            path = target['path']
            if not isinstance(path, str) or not path.startswith('/workspace/'):
                raise RuntimeError('bad path')
            parts = path[len('/workspace/'):].split('/')
            if not parts or len(parts) > 6 or any(
                not part or part in ('.', '..', '.lab-root-password') or len(part) > 64 or
                any(not (c.isascii() and (c.isalnum() or c in '._-')) for c in part)
                for part in parts
            ):
                raise RuntimeError('unsafe path')
            fd = os.dup(base)
            try:
                info = None
                for index, part in enumerate(parts):
                    flags = os.O_PATH | os.O_NOFOLLOW
                    if index < len(parts) - 1:
                        flags |= os.O_DIRECTORY
                    nxt = os.open(part, flags, dir_fd=fd)
                    os.close(fd)
                    fd = nxt
                    info = os.fstat(fd)
                    if stat.S_ISLNK(info.st_mode):
                        break
                ok = info is not None and not stat.S_ISLNK(info.st_mode)
                if ok:
                    kind = ('file' if stat.S_ISREG(info.st_mode) else
                            'directory' if stat.S_ISDIR(info.st_mode) else 'other')
                    ok = (kind == target['kind'] and
                          ('mode' not in target or stat.S_IMODE(info.st_mode) == int(target['mode'], 8)) and
                          ('uid' not in target or info.st_uid == target['uid']) and
                          ('gid' not in target or info.st_gid == target['gid']))
                if not ok:
                    failed.append(path)
            except OSError as exc:
                if exc.errno in (errno.ENOENT, errno.ELOOP, errno.ENOTDIR):
                    failed.append(path)
                else:
                    raise
            finally:
                os.close(fd)
    finally:
        os.close(base)
    print(json.dumps({'ok': True, 'failedPaths': failed}, separators=(',', ':')))


if __name__ == '__main__':
    main()`;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new AdminFilesystemVerifierUnavailable()), timeoutMs);
      }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

function verifyLearnerContainer(inspected: any, session: { id: string; adminVolumeName?: string | null }, image: string): void {
  const host = inspected.HostConfig;
  const labels = inspected.Config?.Labels ?? {};
  const mounts = inspected.Mounts ?? [];
  const workspaceMounts = mounts.filter((item: {Destination?: string}) => item.Destination === "/workspace");
  if (!inspected.State?.Running || inspected.Config?.Image !== image || inspected.Config?.User !== "0:0" ||
      labels["com.zoeskoul.runner.session"] !== session.id ||
      labels["com.zoeskoul.runner.lab-mode"] !== "admin" ||
      labels["com.zoeskoul.runner.purpose"] !== "learn" ||
      host?.Privileged !== false || host?.NetworkMode !== "none" ||
      !host?.Tmpfs?.["/tmp"] || host?.Tmpfs?.["/workspace"] ||
      (host?.Binds ?? []).length !== 0 || !session.adminVolumeName ||
      workspaceMounts.length !== 1 ||
      mounts.some((item: {Destination?: string;Type?: string}) =>
        item.Destination !== "/workspace" && !(item.Destination === "/tmp" && item.Type === "tmpfs")) ||
      workspaceMounts[0]?.Type !== "volume" ||
      workspaceMounts[0]?.Name !== session.adminVolumeName ||
      workspaceMounts[0]?.RW !== true) {
    throw new AdminFilesystemVerifierUnavailable();
  }
}

async function inspectWithSidecar(args: {
  image: string;
  volume: string;
  sessionId: string;
  expected: AdminLabFilesystemExpected;
}): Promise<{passed: boolean; failedPaths: string[]}> {
  const name = `zoeskoul_admin_verify_${crypto.randomUUID()}`;
  let container: Awaited<ReturnType<typeof docker.createContainer>> | null = null;
  try {
    container = await withTimeout(docker.createContainer({
      name,
      Image: args.image,
      User: "0:0",
      Entrypoint: ["/usr/bin/python3"],
      Cmd: ["-I", "-B", "-c", VERIFY_PROGRAM, JSON.stringify(args.expected.required)],
      Tty: true,
      OpenStdin: false,
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      Labels: {
        "com.zoeskoul.runner": "true",
        "com.zoeskoul.runner.session": args.sessionId,
        "com.zoeskoul.runner.lab-mode": "admin-verifier",
        "com.zoeskoul.runner.purpose": "learn",
      },
      HostConfig: {
        NetworkMode: "none",
        ReadonlyRootfs: true,
        CapDrop: ["ALL"],
        SecurityOpt: ["no-new-privileges"],
        Memory: 96 * 1024 * 1024,
        MemorySwap: 96 * 1024 * 1024,
        PidsLimit: 16,
        AutoRemove: false,
        Mounts: [{
          Type: "volume", Source: args.volume, Target: "/workspace",
          ReadOnly: true, VolumeOptions: { NoCopy: true } as import("dockerode").MountSettings["VolumeOptions"],
        }],
      },
    }), 5000);
    const inspected = await withTimeout(container.inspect(), 5000);
    const host = inspected.HostConfig;
    if (host?.NetworkMode !== "none" || host?.ReadonlyRootfs !== true ||
        host?.Privileged !== false || (host?.Binds ?? []).length !== 0 ||
        (host?.CapAdd ?? []).length !== 0 ||
        !host?.CapDrop?.includes("ALL") ||
        (host?.Mounts ?? []).length !== 1 ||
        host?.Mounts?.[0]?.Source !== args.volume ||
        host?.Mounts?.[0]?.ReadOnly !== true) {
      throw new AdminFilesystemVerifierUnavailable();
    }
    await withTimeout(container.start(), 5000);
    const status = await withTimeout(container.wait(), 7000);
    if (status.StatusCode !== 0) throw new AdminFilesystemVerifierUnavailable();
    const output = await withTimeout(container.logs({stdout:true,stderr:true,tail:4}), 5000);
    const verifiedText = await readAdminVerifierLogOutput(output);
    const parsed = JSON.parse(verifiedText) as {ok?:unknown;failedPaths?:unknown};
    const expectedPaths = new Set(args.expected.required.map((entry) => entry.path));
    if (parsed.ok !== true || !Array.isArray(parsed.failedPaths) ||
        parsed.failedPaths.some((path) => typeof path !== "string" || !expectedPaths.has(path)) ||
        new Set(parsed.failedPaths).size !== parsed.failedPaths.length) {
      throw new AdminFilesystemVerifierUnavailable();
    }
    return {passed: parsed.failedPaths.length === 0, failedPaths: parsed.failedPaths as string[]};
  } catch {
    throw new AdminFilesystemVerifierUnavailable();
  } finally {
    // Force-remove even if startup, execution, or inspection failed. Existing
    // runner startup reaper also recognizes labeled orphan verifier containers.
    const target = container ?? docker.getContainer(name);
    try {
      await withTimeout(target.remove({force:true}), 5000);
    } catch {
      // Never award credit if the verification container could not be removed.
      console.error("RUNNER admin verifier teardown deferred to startup reaper");
      throw new AdminFilesystemVerifierUnavailable();
    }
  }
}

export async function verifyAdminFilesystem(args: {
  actorKey: string;
  topicSlug: string;
  expected: AdminLabFilesystemExpected;
}): Promise<{passed: boolean; failedPaths: string[]}> {
  const generation = assertAdminLabSwitch();
  const parsed = AdminLabFilesystemExpectedSchema.safeParse(args.expected);
  if (!parsed.success) throw new AdminFilesystemVerifierUnavailable();
  const {image} = adminLabConfiguration();
  const matching = getActiveSessionsForActor(args.actorKey).filter((session) =>
    session.labMode === "admin" && session.adminTopicSlug === args.topicSlug &&
    (session.state === "running" || session.state === "waiting_for_input"));
  if (matching.length !== 1) throw new AdminFilesystemVerifierUnavailable();
  const session = matching[0];
  if (!session.adminVolumeName) throw new AdminFilesystemVerifierUnavailable();
  try {
    await verifyAdminWorkspaceVolume(session.adminVolumeName, session.id);
    const container = await withTimeout(docker.getContainer(session.containerId).inspect(), 5000);
    verifyLearnerContainer(container, session, image);
    assertAdminLabSwitch(generation);
    const result = await inspectWithSidecar({
      image, volume: session.adminVolumeName, sessionId:session.id, expected:parsed.data,
    });
    assertAdminLabSwitch(generation);
    return result;
  } catch {
    throw new AdminFilesystemVerifierUnavailable();
  }
}
