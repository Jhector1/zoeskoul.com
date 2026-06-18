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
  clearAllTimeouts,
} from "../sessions/timeoutManager.js";
import { resolveTimeoutPolicy } from "../sessions/timeoutPolicy.js";
import {
  createWorkspace,
  ensureWorkspaceRuntimeFiles,
} from "../workspace/createWorkspace.js";
import {
  cleanupWorkspaceNow,
  scheduleWorkspaceCleanup,
} from "../workspace/cleanupWorkspace.js";

import { getExecutionPlan } from "../execution/executionPlan.js";
import { docker } from "./dockerClient.js";
import { killSession } from "./killSession.js";

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
  return entries
    .filter((entry): entry is FileEntry => entry.kind !== "directory")
    .map((entry) => ({
      path: entry.path,
      content: String((entry as any).content ?? ""),
    }));
}

function defaultEntry(language: InteractiveLanguage) {
  switch (language) {
    case "python":
      return "main.py";
    case "javascript":
      return "main.js";
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

function isReplaceableShellSession(session: {
  kind?: "code" | "shell";
}) {
  // Sessions created before this field existed are treated as replaceable
  // because the original runner only used long-lived interactive PTY sessions.
  return session.kind === "shell" || session.kind == null;
}

async function cancelSupersededShellSessionsForActor(args: {
  ownerKey: string;
  workspaceKey?: string;
}) {
  const active = getActiveSessionsForActor(args.ownerKey).filter(
    isReplaceableShellSession,
  );

  for (const session of active) {
    if (args.workspaceKey && session.workspaceKey === args.workspaceKey) {
      continue;
    }

    try {
      await killSession(session.id, "canceled");
    } catch (err) {
      console.warn("RUNNER superseded shell session cleanup failed", {
        sessionId: session.id,
        ownerKey: args.ownerKey,
        workspaceKey: session.workspaceKey ?? null,
        message: err instanceof Error ? err.message : String(err),
      });
    }
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

export async function startDockerSession(
  req: InteractiveRunReq,
  ownerKey: string,
): Promise<StartSessionResult> {
  let releaseSlot: (() => void) | null = null;
  let slotReleased = false;
  const releaseReservedSlot = () => {
    if (slotReleased) return;
    slotReleased = true;
    releaseSlot?.();
  };

  let workspaceDir: string | null = null;
  let sessionId = "";

  try {
    const normalized = normalizeRequest(req);

    if (normalized.kind === "shell") {
      await cancelSupersededShellSessionsForActor({
        ownerKey,
        workspaceKey: normalized.workspaceKey,
      });
    }

    releaseSlot = reserveSessionSlot(ownerKey);
    const timeouts = resolveTimeoutPolicy({
      kind: normalized.kind,
      requestedIdleTimeoutMs: normalized.idleTimeoutMs,
      requestedWallTimeoutMs: normalized.wallTimeoutMs,
    });
    workspaceDir = await createWorkspace(normalized.files);

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

    sessionId = `sess_${crypto.randomUUID()}`;
    const containerName = `zoeskoul_${sessionId}`;

    await ensureWorkspaceRuntimeFiles(workspaceDir, plan.prepareDirs ?? []);

    const container = await docker.createContainer({
      Image: env.runnerImage,
      name: containerName,
      Tty: true,
      OpenStdin: true,
      StdinOnce: false,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: "/workspace",
      User: `${env.execUid}:${env.execGid}`,
      Labels: {
        "com.zoeskoul.runner": "true",
        "com.zoeskoul.runner.session": sessionId,
        "com.zoeskoul.runner.owner": ownerKey.slice(0, 64),
      },
      Env: [
        `PREPARE_DIRS_JSON=${JSON.stringify(plan.prepareDirs ?? [])}`,
        `COMPILE_CMD_JSON=${JSON.stringify(plan.compileCmd ?? null)}`,
        `RUN_CMD_JSON=${JSON.stringify(plan.runCmd)}`,
        "TERM=xterm-256color",
        "COLUMNS=120",
        "LINES=30",
        "PYTHONUNBUFFERED=1",
        "HOME=/workspace",
        "TMPDIR=/tmp",
        "PATH=/usr/bin:/bin",
        "BASH_ENV=/dev/null",
        "ENV=/dev/null",
        "HISTFILE=/workspace/.bash_history",
        "HISTSIZE=1000",
        "HISTFILESIZE=2000",
        "HISTCONTROL=ignoredups:erasedups",
        "PROMPT_COMMAND=history -a; history -n",
      ],
      Cmd: ["python3", "/opt/runner/pty-runner.py"],
      HostConfig: {
        Binds: [`${workspaceDir}:/workspace`],
        NetworkMode: env.childNetwork,
        ReadonlyRootfs: true,
        CapDrop: ["ALL"],
        Memory: env.memoryLimitBytes,
        MemorySwap: env.memoryLimitBytes,
        CpuPeriod: 100000,
        CpuQuota: env.cpuQuota,
        PidsLimit: env.pidsLimit,
        AutoRemove: true,
        SecurityOpt: ["no-new-privileges:true"],
        Tmpfs: {
          "/tmp": "rw,noexec,nosuid,size=64m",
          "/run": "rw,noexec,nosuid,size=16m",
        },
      },
    });

    createSession({
      id: sessionId,
      ownerKey,
      containerId: container.id,
      workspaceDir,
      idleTimeoutMs: timeouts.idleTimeoutMs,
      hardLifetimeMs: timeouts.hardLifetimeMs,
    });
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

      await container.start();

      setSessionStream(sessionId, attach);
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

      void container
        .wait()
        .then(async (result) => {
          const code = result.StatusCode ?? 0;

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
      };
    } catch (e: any) {
      clearAllTimeouts(sessionId);
      pushEvent(sessionId, {
        type: "error",
        message: e?.message ?? "Failed to start container.",
      });
      pushEvent(sessionId, { type: "status", state: "failed" });
      if (workspaceDir) await cleanupWorkspaceNow(workspaceDir);
      return {
        ok: false,
        error: e?.message ?? "Failed.",
      };
    }
  } catch (e: any) {
    releaseReservedSlot();
    if (workspaceDir) await cleanupWorkspaceNow(workspaceDir);
    return {
      ok: false,
      error: e?.message ?? "Failed.",
    };
  }
}
