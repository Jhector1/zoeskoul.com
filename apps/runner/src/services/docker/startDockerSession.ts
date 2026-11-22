import crypto from "node:crypto";
import type {
  FileEntry,
  InteractiveLanguage,
  InteractiveRunReq,
  StartSessionResult,
  WorkspaceSyncEntry,
} from "@zoeskoul/code-contracts";
import { env } from "../../lib/env.js";
import {
  countActiveSessionsForActor,
  countActiveSessionsGlobal,
  type SessionRecord,
  createSession,
  getActiveSessionsForActor,
  getSession,
  pushEvent,
  reserveSessionSlot,
  setSessionStream,
  touchSession,
} from "../sessions/sessionStore.js";
import {
  armIdleTimeout,
  armHardLifetimeTimeout,
  armWallTimeout,
  armWorkspacePressureGuard,
  clearAllTimeouts,
} from "../sessions/timeoutManager.js";
import { resolveTimeoutPolicy } from "../sessions/timeoutPolicy.js";
import { resolveAdminSessionTimeoutPolicy } from "../execution/adminSessionTimeoutPolicy.js";
import { consumeStartToken } from "../sessions/startRateLimit.js";
import { resolveOwnedShellSession } from "../sessions/ownedShellSession.js";
import { LearningCapacityRecovery, LearningStartQueue, learningSessionTakeoverEnabled } from "../sessions/learningSessionTakeover.js";
import { learningWindowOwnership } from "../sessions/learningWindowOwnership.js";
import { confirmDockerResourceAbsent } from "../execution/adminRevocationVerification.js";
import {
  createWorkspace,
  ensureWorkspaceRuntimeFiles,
} from "../workspace/createWorkspace.js";
import {
  cleanupWorkspaceNow,
  scheduleWorkspaceCleanup,
} from "../workspace/cleanupWorkspace.js";

import { getExecutionPlan } from "../execution/executionPlan.js";
import { resolveSandboxProfile } from "../execution/sandboxProfile.js";
import { inspectLearningLabRequest, type LearningLabMode } from "../execution/learningLabMode.js";
import { AdminGrantError, adminLabConfiguration, assertVerifiedAdminGrant, type VerifiedAdminGrant } from "../execution/learningAdminGrant.js";
import { ADMIN_COURSE_SLUG, isEligibleAdminLabLesson } from "../execution/learningAdminLessonPolicy.js";
import { adminHostConfigForLab, adminLabFileWriteLimitBytes, verifyAdminSandboxImage } from "../execution/learningAdminSandbox.js";
import { removeAdminSessionNetwork } from "../execution/adminSessionNetwork.js";
import { removeAdminEgressProxy, adminEgressShellCommand, PROXY_ALIAS, PROXY_PORT } from "../execution/adminEgressProxy.js";
import { removeAdminWorkspaceVolume } from "../execution/adminWorkspaceVolume.js";
import {
  seedAdminCapstoneWorkspace,
  type AdminCapstoneWorkspaceHold,
} from "../execution/adminCapstoneWorkspaceSeed.js";
import { assertAdminLabSwitch } from "../execution/learningAdminSwitch.js";
import { emptyAdminLabResources, prepareAdminLabResources, removeVerifiedAdminLabResources } from "../execution/adminLabRuntimeResources.js";
import { adminLabGuestHostConfig } from "../execution/adminLabGuestHostConfig.js";
import { adminResourceOperations, adminResourceRemovalOperations } from "../execution/adminLabDockerResources.js";
import { docker } from "./dockerClient.js";
import { waitForAttachOutputDrain } from "./attachOutputDrain.js";
import { killSession } from "./killSession.js";
import { ensureWorkspaceWritableForShellUser } from "../workspace/workspacePermissions.js";
import { withWorkspaceSyncLock } from "../workspace/workspaceSyncLock.js";
import { repairSandboxWorkspaceOwnership } from "../workspace/workspaceOwnershipRepair.js";
import { sharedGroupWorkspaceEnabled, workspaceRuntimeEnvironment } from "../workspace/workspaceFilesystemPolicy.js";
import {
  acquireSharedShellWorkspace,
  releaseSharedShellWorkspaceReservation,
  type SharedShellWorkspaceReservation,
} from "../workspace/sharedShellWorkspace.js";

type NormalizedRequest =
  | {
      kind: "code";
      language: InteractiveLanguage;
      files: WorkspaceSyncEntry[];
      entry: string;
      wallTimeoutMs?: number;
      idleTimeoutMs?: number;
      cwd?: string;
    }
  | {
      kind: "shell";
      language: "bash";
      files: WorkspaceSyncEntry[];
      entry?: undefined;
      workspaceKey?: string;
      clientHostKey?: string;
      clientOwnerKey?: string;
      clientWorkspaceKey?: string;
      forceNew?: boolean;
      wallTimeoutMs?: number;
      idleTimeoutMs?: number;
      cwd?: string;
    };

const ATTACH_NOISE_TEXT =
  '{"stream":true,"stdin":true,"stdout":true,"stderr":true,"hijack":true}';

function stripAttachNoise(text: string) {
  if (!text) return text;
  return text.split(ATTACH_NOISE_TEXT).join("");
}

function normalizePath(input: string) {
  return String(input ?? "")
    .replace(/\\/g, "/")
    .trim();
}

function normalizeWorkspaceCwd(cwd: string | undefined) {
  const normalized = normalizePath(cwd ?? "");
  if (!normalized || normalized === "/workspace") {
    return "/workspace";
  }

  if (!normalized.startsWith("/workspace/")) {
    throw new Error(`Unsafe cwd: ${cwd}`);
  }

  const rel = normalized.slice("/workspace/".length);
  if (!rel) {
    return "/workspace";
  }

  const parts = rel.split("/");
  for (const part of parts) {
    if (!part || part === "." || part === "..") {
      throw new Error(`Unsafe cwd: ${cwd}`);
    }
  }

  return `/workspace/${parts.join("/")}`;
}

function entryKind(entry: WorkspaceSyncEntry) {
  return entry.kind === "directory" ? "directory" : "file";
}

function entryPath(entry: WorkspaceSyncEntry) {
  return normalizePath(entry.path);
}

function normalizeFilesMap(
  files: WorkspaceSyncEntry[] | Record<string, string> | undefined,
): WorkspaceSyncEntry[] {
  if (!files) return [];

  const entries = Array.isArray(files)
    ? files.map((entry) => {
        if ((entry as any)?.kind === "directory") {
          return {
            kind: "directory" as const,
            path: entryPath(entry),
          };
        }

        if ((entry as any)?.encoding === "base64") {
          return {
            kind: "file" as const,
            path: entryPath(entry),
            encoding: "base64" as const,
            data: String((entry as any).data ?? ""),
            mimeType: String((entry as any).mimeType ?? "application/octet-stream"),
            sizeBytes: Math.max(0, Number((entry as any).sizeBytes ?? 0)),
            ...((entry as any).checksum
              ? { checksum: String((entry as any).checksum) }
              : {}),
          };
        }

        return {
          kind: "file" as const,
          path: entryPath(entry),
          content: String((entry as any).content ?? ""),
        };
      })
    : Object.entries(files).map(([path, content]) => ({
        kind: "file" as const,
        path: entryPath({ path } as WorkspaceSyncEntry),
        content: String(content ?? ""),
      }));

  return entries
    .filter((entry) => !!entry.path)
    .sort((a, b) => {
      const pathCmp = a.path.localeCompare(b.path);
      if (pathCmp !== 0) return pathCmp;
      if (entryKind(a) === entryKind(b)) return 0;
      return entryKind(a) === "directory" ? -1 : 1;
    });
}

function onlyFileEntries(entries: WorkspaceSyncEntry[]): FileEntry[] {
  return entries.filter((entry): entry is FileEntry => entry.kind !== "directory");
}

function defaultEntry(language: InteractiveLanguage) {
  switch (language) {
    case "python":
      return "main.py";
    case "javascript":
      return "main.js";
    case "r":
      return "main.R";
    case "java":
      return "Main.java";
    case "c":
      return "main.c";
    case "cpp":
      return "main.cpp";
  }
}

function normalizeRequest(req: InteractiveRunReq): NormalizedRequest {
  if (req.kind === "shell") {
    return {
      kind: "shell",
      language: "bash",
      files: normalizeFilesMap(req.files),
      workspaceKey: req.workspaceKey,
      clientHostKey: req.clientHostKey,
      clientOwnerKey: req.clientOwnerKey,
      clientWorkspaceKey: req.clientWorkspaceKey,
      forceNew: req.forceNew,
      wallTimeoutMs: req.wallTimeoutMs,
      idleTimeoutMs: req.idleTimeoutMs,
      cwd: req.cwd,
    };
  }

  if ("files" in req) {
    return {
      kind: "code",
      language: req.language,
      files: normalizeFilesMap(req.files),
      entry: req.entry,
      wallTimeoutMs: req.wallTimeoutMs,
      idleTimeoutMs: req.idleTimeoutMs,
    };
  }

  const entry = defaultEntry(req.language);

  return {
    kind: "code",
    language: req.language,
    files: [{ kind: "file", path: entry, content: req.code }],
    entry,
    wallTimeoutMs: req.wallTimeoutMs,
    idleTimeoutMs: req.idleTimeoutMs,
  };
}

const learningStartQueue = new LearningStartQueue();
const learningCapacityRecovery = new LearningCapacityRecovery();
function coordinateLearningStart<T>(owner: string, task: () => Promise<T>): Promise<T> {
  return learningSessionTakeoverEnabled(process.env) ? learningStartQueue.run(owner, task) : task();
}

async function retireDetachedLearningShell(session: SessionRecord) {
  await killSession(session.id, "canceled");
  if (!await confirmDockerResourceAbsent(() => docker.getContainer(session.containerId).inspect())) {
    throw new Error("Previous learning container remains.");
  }
  if (session.labMode === "admin") {
    // Existing teardown uses the strict owner-scoped proxy/network helpers.
    // Retry them even if the registry was removed while cleanup was pending.
    if (!session.adminVolumeName) throw new Error("Missing administrator volume identity.");
    await removeVerifiedAdminLabResources(session.id, {
      networkName: session.adminNetworkName ?? null,
      proxyName: session.adminEgressProxyName ?? null,
      volumeName: session.adminVolumeName,
    }, adminResourceRemovalOperations);
  }
  console.info("RUNNER detached learning shell reclaimed for capacity");
}

async function recoverLearningCapacity(owner: string, allowReclaim: boolean) {
  await learningCapacityRecovery.recover(owner, {
    readPlan: () => ({ actor: owner, now: Date.now(),
      actorCount: countActiveSessionsForActor(owner), globalCount: countActiveSessionsGlobal(),
      actorLimit: env.maxConcurrentPerActor, globalLimit: env.maxConcurrentGlobal,
      sessions: getActiveSessionsForActor(owner) }),
    readSession: getSession,
    retire: retireDetachedLearningShell,
  }, allowReclaim);
}

/** Explicit browser-window activation, never called by heartbeat/reconnect. */
export function readLearningIdeWindow(owner: string, windowId: string) {
  if (!learningSessionTakeoverEnabled(process.env)) return {ok: true as const, enabled: false};
  return {ok: true as const, enabled: true, status: learningWindowOwnership.status(owner, windowId)};
}

export async function claimLearningIdeWindow(owner: string, windowId: string) {
  if (!learningSessionTakeoverEnabled(process.env)) return { ok: true as const, enabled: false };
  return coordinateLearningStart(owner, async () => {
    // Drain a previous failed teardown before changing ownership again.
    await recoverLearningCapacity(owner, false);
    learningWindowOwnership.claim(owner, windowId, getActiveSessionsForActor(owner));
    return { ok: true as const, enabled: true };
  });
}

async function cancelLegacyShellSessionsForActor(ownerKey: string) {
  const legacySessions = getActiveSessionsForActor(ownerKey).filter(
    (session) =>
      (session.kind === "shell" || session.kind == null) &&
      !session.workspaceKey &&
      session.labMode !== "admin",
  );

  for (const session of legacySessions) {
    await killSession(session.id, "canceled").catch(() => {});
  }
}

function isTerminalState(state: string) {
  return (
    state === "completed" ||
    state === "failed" ||
    state === "canceled" ||
    state === "timed_out"
  );
}

async function startDockerSessionUncoordinated(
  req: InteractiveRunReq,
  ownerKey: string,
  labMode: LearningLabMode = "standard",
  adminGeneration?: number,
  adminTopicSlug?: string,
  adminWindowId?: string | null,
): Promise<StartSessionResult> {
  // Enforce at the service boundary too: internal callers must not bypass
  // the HTTP guard. No session, workspace, or container exists on refusal.
  const labDecision = inspectLearningLabRequest(req);
  if (!labDecision.ok) {
    return { ok: false, error: labDecision.error };
  }
  let releaseSlot: (() => void) | null = null;
  let slotReleased = false;
  const releaseReservedSlot = () => {
    if (slotReleased) return;
    slotReleased = true;
    releaseSlot?.();
  };

  let workspaceDir: string | null = null;
  let sharedWorkspaceReservation: SharedShellWorkspaceReservation | null = null;
  let sessionRegistered = false;
  let sessionId = "";
  let adminVolumeName: string | null = null;
  let adminNetworkName: string | null = null;
  let adminEgressProxyName: string | null = null;
  let adminCapstoneHold: AdminCapstoneWorkspaceHold | null = null;

  try {
    const normalized = normalizeRequest(req);
    if (labMode === "admin" && (normalized.kind !== "shell" ||
        normalized.files.length !== 0 || normalized.workspaceKey || normalized.cwd ||
        normalized.clientOwnerKey || normalized.clientWorkspaceKey || normalized.clientHostKey)) {
      throw new Error("Admin labs require an empty disposable shell workspace.");
    }
    if (labMode === "admin" && !isEligibleAdminLabLesson(ADMIN_COURSE_SLUG, adminTopicSlug)) {
      throw new Error("Verified administrative lesson identity required.");
    }
    if (labMode === "admin") {
      assertAdminLabSwitch(adminGeneration);
      // Refuse unsafe egress BEFORE reserving a slot or allocating a volume.
      adminHostConfigForLab(); // Fail closed on malformed network policy before allocating resources.
    }
    const adminImage = labMode === "admin" ? adminLabConfiguration().image : null;
    if (adminImage) {
      await verifyAdminSandboxImage(docker, adminImage);
      assertAdminLabSwitch(adminGeneration);
    }

    if (learningSessionTakeoverEnabled(process.env)) {
      // Detached does not mean abandoned: a live shell can still run jobs.
      // Retry already-authorized teardown only; never choose a new victim.
      await recoverLearningCapacity(ownerKey, false);
      if (labMode === "admin") assertAdminLabSwitch(adminGeneration);
    } else if (labMode === "standard" && normalized.kind === "shell" && !normalized.workspaceKey) {
      await cancelLegacyShellSessionsForActor(ownerKey);
    }

    releaseSlot = reserveSessionSlot(ownerKey);
    const standardTimeouts = resolveTimeoutPolicy({
      kind: normalized.kind,
      requestedIdleTimeoutMs: normalized.idleTimeoutMs,
      requestedWallTimeoutMs: normalized.wallTimeoutMs,
    });
    const timeouts = labMode === "admin"
      ? resolveAdminSessionTimeoutPolicy(adminTopicSlug)
      : standardTimeouts;
    if (labMode === "admin") {
      // Disposable root guest must NEVER create or mount a host workspace.
      workspaceDir = "";
    } else if (normalized.kind === "shell" && normalized.workspaceKey) {
      sharedWorkspaceReservation = await acquireSharedShellWorkspace({
        ownerKey,
        workspaceKey: normalized.workspaceKey,
        files: normalized.files,
      });
      workspaceDir = sharedWorkspaceReservation.workspaceDir;
    } else {
      workspaceDir = await createWorkspace(normalized.files);
    }

    if (!workspaceDir && labMode !== "admin") {
      throw new Error("Runner workspace allocation did not return a directory.");
    }
    const resolvedWorkspaceDir = workspaceDir;

    const plan =
      normalized.kind === "shell"
        ? getExecutionPlan(
            "bash",
            undefined,
            onlyFileEntries(normalized.files),
            {
              shell: true,
              cwd: normalized.cwd,
            },
          )
        : getExecutionPlan(
            normalized.language,
            normalized.entry,
            onlyFileEntries(normalized.files),
            {
              shell: false,
              cwd: normalized.cwd,
            },
          );

    const sessionCwd =
      normalized.kind === "shell"
        ? normalizeWorkspaceCwd(normalized.cwd)
        : "/workspace";

    sessionId = `sess_${crypto.randomUUID()}`;
    const containerName = `zoeskoul_${sessionId}`;
    if (adminImage) {
      const evidence = emptyAdminLabResources();
      try {
        await prepareAdminLabResources(sessionId, evidence,
          adminResourceOperations(adminGeneration!, timeouts.hardLifetimeMs!));
      } finally {
        // Preserve partially allocated identities even if creation failed.
        adminNetworkName = evidence.networkName;
        adminEgressProxyName = evidence.proxyName;
        adminVolumeName = evidence.volumeName;
      }
      if (!adminVolumeName) throw new Error("Missing administrator workspace identity.");
      // Only the signed, pre-approved capstone gets a training fixture. The
      // verified holder preserves this tmpfs mount until the learner starts.
      if (adminTopicSlug === "final-capstone-secure-project") {
        adminCapstoneHold = await seedAdminCapstoneWorkspace({
          sessionId, volumeName: adminVolumeName, image: adminImage,
          generation: adminGeneration!,
        });
        assertAdminLabSwitch(adminGeneration);
      }
    }

    // Shared sessions may be reused while the IDE is saving. Coordinate the
    // startup normalization and ownership repair with replacement/snapshots.
    if (labMode === "standard") {
      await withWorkspaceSyncLock(resolvedWorkspaceDir, async () => {
        await ensureWorkspaceRuntimeFiles(resolvedWorkspaceDir, plan.prepareDirs ?? []);
        await ensureWorkspaceWritableForShellUser(resolvedWorkspaceDir);
        await repairSandboxWorkspaceOwnership(resolvedWorkspaceDir);
      });
    }

    const sandboxProfile = resolveSandboxProfile("learn");

    if (labMode === "admin") assertAdminLabSwitch(adminGeneration);
    const container = await docker.createContainer({
      Image: adminImage ?? sandboxProfile.image,
      name: containerName,
      Tty: true,
      OpenStdin: true,
      StdinOnce: false,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: sessionCwd,
      User: adminImage ? "0:0" : sandboxProfile.user,
      Labels: {
        "com.zoeskoul.runner": "true",
        "com.zoeskoul.runner.session": sessionId,
        "com.zoeskoul.runner.owner": ownerKey.slice(0, 64),
        "com.zoeskoul.runner.purpose": "learn",
        "com.zoeskoul.runner.profile": adminImage ? "learning-admin-disposable-v1" : sandboxProfile.id,
        "com.zoeskoul.runner.lab-mode": labMode,
      },
      Env: [
        `PREPARE_DIRS_JSON=${JSON.stringify(adminImage ? [] : plan.prepareDirs ?? [])}`,
        `COMPILE_CMD_JSON=${JSON.stringify(adminImage ? null : plan.compileCmd ?? null)}`,
        `RUN_CMD_JSON=${JSON.stringify(adminImage ? (adminEgressProxyName ? adminEgressShellCommand() : ["su", "-", "sandbox"]) : plan.runCmd)}`,
        "TERM=xterm-256color",
        "COLUMNS=120",
        "LINES=30",
        "PYTHONUNBUFFERED=1",
        "GIT_PAGER=cat",
        "PAGER=cat",
        "GIT_TERMINAL_PROMPT=0",
        "HOME=/workspace",
        "TMPDIR=/tmp",
        "PATH=/usr/bin:/bin",
        "NODE_PATH=/opt/zoeskoul-node-modules",
        "BASH_ENV=/dev/null",
        "ENV=/dev/null",
        "HISTFILE=/tmp/.bash_history",
        "HISTSIZE=1000",
        "HISTFILESIZE=2000",
        // Startup bootstrap input begins with a space and must never become
        // learner-visible shell history or grading evidence.
        "HISTCONTROL=ignoreboth:erasedups",
        "PROMPT_COMMAND=history -a; history -n",
        ...(sharedGroupWorkspaceEnabled() ? workspaceRuntimeEnvironment() : ["UMASK=000"]),
        `START_CWD=${sessionCwd}`,
        `RUNNER_MAX_FILE_WRITE_BYTES=${adminLabFileWriteLimitBytes(labMode, env.maxWorkspaceBytes)}`,
        ...(adminEgressProxyName ? [
          `HTTP_PROXY=http://${PROXY_ALIAS}:${PROXY_PORT}`,
          `HTTPS_PROXY=http://${PROXY_ALIAS}:${PROXY_PORT}`,
          `http_proxy=http://${PROXY_ALIAS}:${PROXY_PORT}`,
          `https_proxy=http://${PROXY_ALIAS}:${PROXY_PORT}`,
          "NO_PROXY=localhost,127.0.0.1",
          "no_proxy=localhost,127.0.0.1",
        ] : []),
      ],
      Cmd: ["python3", "/opt/runner/pty-runner.py"],
      HostConfig: adminImage ? adminLabGuestHostConfig(adminVolumeName!, adminNetworkName) : {
        Binds: [`${resolvedWorkspaceDir}:/workspace`],
        NetworkMode: sandboxProfile.networkMode,
        ReadonlyRootfs: sandboxProfile.readonlyRootfs,
        CapDrop: [...sandboxProfile.capDrop],
        Memory: sandboxProfile.memoryBytes,
        MemorySwap: sandboxProfile.memoryBytes,
        CpuPeriod: 100000,
        CpuQuota: sandboxProfile.cpuQuota,
        PidsLimit: sandboxProfile.pidsLimit,
        AutoRemove: true,
        SecurityOpt: [...sandboxProfile.securityOpt],
        Tmpfs: { ...sandboxProfile.tmpfs },
      },
    });

    if (labMode === "admin") {
      try { assertAdminLabSwitch(adminGeneration); }
      catch (error) {
        await container.remove({ force: true }).catch(() => {});
        throw error;
      }
    }
    createSession({
      id: sessionId,
      ownerKey,
      kind: normalized.kind,
      labMode,
      adminTopicSlug: labMode === "admin" ? adminTopicSlug : null,
      adminWindowId: labMode === "admin" && adminTopicSlug === "full-privileges" ? adminWindowId : null,
      adminVolumeName: labMode === "admin" ? adminVolumeName : null,
      adminNetworkName: labMode === "admin" ? adminNetworkName : null,
      adminEgressProxyName: labMode === "admin" ? adminEgressProxyName : null,
      workspaceKey:
        normalized.kind === "shell" ? normalized.workspaceKey ?? null : null,
      clientHostKey:
        normalized.kind === "shell" ? normalized.clientHostKey ?? null : null,
      clientOwnerKey:
        normalized.kind === "shell" ? normalized.clientOwnerKey ?? null : null,
      clientWorkspaceKey:
        normalized.kind === "shell" ? normalized.clientWorkspaceKey ?? null : null,
      containerId: container.id,
      workspaceDir: resolvedWorkspaceDir,
      idleTimeoutMs: timeouts.idleTimeoutMs,
      hardLifetimeMs: timeouts.hardLifetimeMs,
    });
    sessionRegistered = true;
    if (sharedWorkspaceReservation) {
      await releaseSharedShellWorkspaceReservation({
        reservation: sharedWorkspaceReservation,
        keepWorkspace: true,
      });
      sharedWorkspaceReservation = null;
    }
    releaseReservedSlot();

    pushEvent(sessionId, { type: "status", state: "preparing" });

    try {
      const attach = await container.attach({
        stream: true,
        stdin: true,
        stdout: true,
        stderr: true,
        hijack: true,
      });

      /**
       * Install every readable-output owner before the container starts. Fast
       * programs (notably a one-line Python script) can otherwise finish while
       * the start request is still returning.
       */
      setSessionStream(sessionId, attach);

      let startupChunkBudget = 6;

      attach.on("data", (chunk: Buffer | string) => {
        let text = Buffer.isBuffer(chunk)
          ? chunk.toString("utf8")
          : String(chunk);
        if (!text) return;

        if (startupChunkBudget > 0) {
          startupChunkBudget -= 1;
          text = stripAttachNoise(text);
          if (!text) return;
        }

        touchSession(sessionId);
        pushEvent(sessionId, { type: "stdout", chunk: text });
      });

      attach.on("error", (err: Error) => {
        const session = getSession(sessionId);
        if (!session || isTerminalState(session.state)) return;
        pushEvent(sessionId, { type: "error", message: err.message });
      });

      /**
       * container.wait() reports process/container completion, but Docker may
       * still be draining the last bytes through the hijacked attach stream.
       * Arm the barrier before start so even an immediate process exit is
       * observed. Final events are published only after readable output drains.
       */
      const attachDrainPromise = waitForAttachOutputDrain(attach);

      if (labMode === "admin") assertAdminLabSwitch(adminGeneration);
      if (adminCapstoneHold) await adminCapstoneHold.assertMounted();
      await container.start();
      if (labMode === "admin") assertAdminLabSwitch(adminGeneration);
      // From here the learner container has the same named tmpfs volume
      // mounted. Only now may the passive holder be removed.
      if (adminCapstoneHold) {
        await adminCapstoneHold.release();
        adminCapstoneHold = null;
      }

      pushEvent(sessionId, {
        type: "status",
        state: normalized.kind === "shell" ? "waiting_for_input" : "running",
      });

      if (typeof timeouts.wallTimeoutMs === "number") {
        armWallTimeout(sessionId, timeouts.wallTimeoutMs);
      }
      armIdleTimeout(sessionId, timeouts.idleTimeoutMs);
      if (typeof timeouts.hardLifetimeMs === "number") {
        armHardLifetimeTimeout(sessionId, timeouts.hardLifetimeMs);
      }
      if (labMode === "standard") armWorkspacePressureGuard(sessionId, resolvedWorkspaceDir);

      void container
        .wait()
        .then(async (result) => {
          const code = result.StatusCode ?? 0;

          await attachDrainPromise;

          clearAllTimeouts(sessionId);
          pushEvent(sessionId, { type: "exit", code });

          const session = getSession(sessionId);
          const alreadyFinal = session ? isTerminalState(session.state) : true;

          if (
            !alreadyFinal ||
            session?.state === "running" ||
            session?.state === "preparing" ||
            session?.state === "waiting_for_input"
          ) {
            pushEvent(sessionId, {
              type: "status",
              state: code === 0 ? "completed" : "failed",
            });
          }

          /**
           * Do not delete the workspace immediately.
           * The browser needs time to call /snapshot-workspace and merge
           * created/deleted files into the Explorer.
           */
          scheduleWorkspaceCleanup(sessionId, workspaceDir!);
        })
        .catch(async (err: Error) => {
          clearAllTimeouts(sessionId);

          const session = getSession(sessionId);

          if (session && !isTerminalState(session.state)) {
            pushEvent(sessionId, { type: "error", message: err.message });
            pushEvent(sessionId, { type: "status", state: "failed" });
          }

          scheduleWorkspaceCleanup(sessionId, workspaceDir!);
        });

      return {
        ok: true,
        sessionId,
        state: normalized.kind === "shell" ? "waiting_for_input" : "running",
        activeCount: countActiveSessionsForActor(ownerKey),
        maxActiveSessions: env.maxConcurrentPerActor,
      };
    } catch (e: any) {
      clearAllTimeouts(sessionId);
      pushEvent(sessionId, {
        type: "error",
        message: e?.message ?? "Failed to start container.",
      });
      pushEvent(sessionId, { type: "status", state: "failed" });
      // A container that was created but failed before start may never trigger
      // AutoRemove. Force-remove it now so failed starts cannot accumulate.
      await container.remove({ force: true }).catch(() => {});
      if (adminCapstoneHold) {
        await adminCapstoneHold.release().catch(() => {
          console.error("RUNNER capstone tmpfs hold cleanup deferred to startup reaper");
        });
        adminCapstoneHold = null;
      }
      if (workspaceDir !== null) {
        scheduleWorkspaceCleanup(sessionId, workspaceDir);
      }
      return {
        ok: false,
        error: e?.message ?? "Failed.",
      };
    }
  } catch (e: any) {
    releaseReservedSlot();

    if (adminCapstoneHold) {
      await adminCapstoneHold.release().catch(() => {
        console.error("RUNNER capstone tmpfs hold cleanup deferred to startup reaper");
      });
      adminCapstoneHold = null;
    }

    if (sharedWorkspaceReservation) {
      await releaseSharedShellWorkspaceReservation({
        reservation: sharedWorkspaceReservation,
        keepWorkspace: sessionRegistered,
      });
      sharedWorkspaceReservation = null;
    } else if (workspaceDir && !sessionRegistered) {
      await cleanupWorkspaceNow(workspaceDir);
    }
    if (!sessionRegistered && adminEgressProxyName) {
      await removeAdminEgressProxy(adminEgressProxyName, sessionId).catch(() => {
        console.error("RUNNER admin egress startup cleanup deferred to startup reaper");
      });
    }
    if (!sessionRegistered && adminNetworkName) {
      // The failed start never registered a tombstone. Only remove our own
      // strict owner-labeled network; startup reaper catches Docker errors.
      await removeAdminSessionNetwork(adminNetworkName, sessionId).catch(() => {
        console.error("RUNNER admin network startup cleanup deferred to startup reaper");
      });
    }
    if (!sessionRegistered && adminVolumeName) {
      // This may have failed before a container was created. On a daemon
      // failure startup reconciliation will reclaim the labeled orphan.
      await removeAdminWorkspaceVolume(adminVolumeName, sessionId).catch(() => {
        console.error("RUNNER admin workspace startup cleanup deferred to startup reaper");
      });
    }

    return {
      ok: false,
      error: e?.message ?? "Failed.",
    };
  }
}

const shellStartsByOwner = new Map<string, Promise<StartSessionResult>>();

/**
 * The runner owns terminal identity and capacity. A browser reattach or React
 * remount with the same clientOwnerKey must reuse the live shell instead of
 * making the web tier probe snapshots, reconcile Redis, and race a second
 * container start.
 */
export async function startDockerSession(
  req: InteractiveRunReq,
  ownerKey: string,
): Promise<StartSessionResult> {
  // This must precede the reattach path. Otherwise an untrusted "admin"
  // request could be silently served a standard session as if elevated.
  const labDecision = inspectLearningLabRequest(req);
  if (!labDecision.ok) return { ok: false, error: labDecision.error };
  if (req.kind !== "shell" || !req.clientOwnerKey) {
    return coordinateLearningStart(ownerKey, async () => {
      if (req.kind === "shell" && learningSessionTakeoverEnabled(process.env)) learningWindowOwnership.assertStart(ownerKey, req.clientHostKey);
      consumeStartToken(ownerKey, req.kind === "shell" ? "shell" : "code");
      return startDockerSessionUncoordinated(req, ownerKey);
    });
  }

  const clientOwnerKey = req.clientOwnerKey;
  const startKey = `${ownerKey}\0${clientOwnerKey}`;
  const inFlight = shellStartsByOwner.get(startKey);
  if (inFlight) return await inFlight;

  const run = coordinateLearningStart(ownerKey, async (): Promise<StartSessionResult> => {
    const recoveryEnabled = learningSessionTakeoverEnabled(process.env);
    if (recoveryEnabled) learningWindowOwnership.assertStart(ownerKey, req.clientHostKey);
    const resolution = resolveOwnedShellSession({
      sessions: getActiveSessionsForActor(ownerKey).filter(s => !recoveryEnabled || s.labMode !== "admin"),
      clientHostKey: req.clientHostKey,
      clientOwnerKey,
      clientWorkspaceKey: req.clientWorkspaceKey,
      workspaceKey: req.workspaceKey,
      forceNew: req.forceNew,
    });

    if (resolution.reusable) {
      const reusable = resolution.reusable;
      return {
        ok: true,
        sessionId: reusable.id,
        state: reusable.state,
        activeCount: countActiveSessionsForActor(ownerKey),
        maxActiveSessions: env.maxConcurrentPerActor,
        reused: true,
      };
    }

    if (recoveryEnabled) {
      consumeStartToken(ownerKey, "shell");
      await recoverLearningCapacity(ownerKey, false);
    }
    // Do not implicitly destroy a mismatched live shell on ordinary startup.
    if (recoveryEnabled && resolution.sessionsToCancel.length > 0 && req.forceNew !== true) {
      return { ok: false, error: "Existing Linux session requires a user decision." };
    }
    // Explicit same-owner restart remains distinct from capacity recovery.
    for (const session of resolution.sessionsToCancel) {
      if (recoveryEnabled) {
        await learningCapacityRecovery.retireOwned(ownerKey, session, retireDetachedLearningShell);
      } else {
        await killSession(session.id, "canceled").catch(() => {});
      }
    }
    if (!recoveryEnabled) consumeStartToken(ownerKey, "shell");
    const started = await startDockerSessionUncoordinated(req, ownerKey);
    if (started.ok) {
      return { ...started, reused: false };
    }
    return started;
  });

  shellStartsByOwner.set(startKey, run);

  try {
    return await run;
  } finally {
    if (shellStartsByOwner.get(startKey) === run) {
      shellStartsByOwner.delete(startKey);
    }
  }
}

/** Only the dedicated authenticated admin route may call this function. */
export async function startDockerAdminSession(
  ownerKey: string,
  grant: VerifiedAdminGrant,
  windowId?: string,
): Promise<StartSessionResult> {
  assertVerifiedAdminGrant(grant, ownerKey);
  const admissionGeneration = assertAdminLabSwitch();
  return coordinateLearningStart(ownerKey, async () => {
    assertAdminLabSwitch(admissionGeneration);
    let adminWindowId: string | null = null;
    if (windowId !== undefined && (grant.topicSlug !== "full-privileges" || !learningSessionTakeoverEnabled(process.env))) {
      throw new AdminGrantError(403, "Administrative lab ownership unavailable.");
    }
    if (grant.topicSlug === "full-privileges" && learningSessionTakeoverEnabled(process.env)) {
      try { adminWindowId = learningWindowOwnership.assertAdminStart(ownerKey, windowId); }
      catch { throw new AdminGrantError(403, "IDE superseded. Open a new IDE to take ownership."); }
    }
    consumeStartToken(ownerKey, "shell");
    // Distinct from /sessions/start: never reattach a standard shell as admin.
    return startDockerSessionUncoordinated({
      kind: "shell", mode: "interactive", language: "bash", files: [], forceNew: true,
    }, ownerKey, "admin", admissionGeneration, grant.topicSlug, adminWindowId);
  });
}
