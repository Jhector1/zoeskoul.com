import fs from "node:fs/promises";
import path from "node:path";
import { PassThrough } from "node:stream";

import type {
  BatchRunReq,
  BatchRunResult,
  FileEntry,
  RunnerCodeLanguage,
  WorkspaceSyncEntry,
} from "@zoeskoul/code-contracts";

import { env } from "../../lib/env.js";
import { getExecutionPlan } from "../execution/executionPlan.js";
import { consumeStartToken } from "../sessions/startRateLimit.js";
import { reserveSessionSlot } from "../sessions/sessionStore.js";
import { cleanupWorkspaceNow } from "../workspace/cleanupWorkspace.js";
import { createWorkspace, ensureWorkspaceRuntimeFiles } from "../workspace/createWorkspace.js";
import { snapshotWorkspaceFiles } from "../workspace/snapshotWorkspaceFiles.js";
import { ensureWorkspaceWritableForShellUser } from "../workspace/workspacePermissions.js";
import { docker } from "./dockerClient.js";

function normalizeEntries(
  files: WorkspaceSyncEntry[] | Record<string, string> | undefined,
): WorkspaceSyncEntry[] {
  if (!files) return [];
  if (Array.isArray(files)) return files;
  return Object.entries(files).map(([filePath, content]) => ({
    kind: "file" as const,
    path: filePath,
    content: String(content ?? ""),
  }));
}

function onlyFiles(entries: WorkspaceSyncEntry[]): FileEntry[] {
  return entries.filter((entry): entry is FileEntry => entry.kind !== "directory");
}

function defaultEntry(language: RunnerCodeLanguage) {
  switch (language) {
    case "python": return "main.py";
    case "javascript": return "main.js";
    case "r": return "main.R";
    case "java": return "Main.java";
    case "c": return "main.c";
    case "cpp": return "main.cpp";
  }
}

function replaceEntryCode(args: {
  entries: WorkspaceSyncEntry[];
  entry: string;
  code: string;
}) {
  let replaced = false;
  const next = args.entries.map((entry) => {
    if (entry.kind === "directory" || entry.path !== args.entry) return entry;
    if ((entry as any).encoding === "base64") {
      throw new Error("Project entry files must be text files.");
    }
    replaced = true;
    return { ...entry, kind: "file" as const, content: args.code };
  });
  if (!replaced) {
    next.push({ kind: "file", path: args.entry, content: args.code });
  }
  return next;
}

function collect(stream: PassThrough) {
  const chunks: Buffer[] = [];
  stream.on("data", (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  });
  return () => Buffer.concat(chunks).toString("utf8");
}

async function writeBatchRequest(workspaceDir: string, payload: Record<string, unknown>) {
  const stateDir = path.join(workspaceDir, ".zoeskoul");
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(path.join(stateDir, "batch-request.json"), JSON.stringify(payload), "utf8");
}

export async function runDockerBatch(
  request: BatchRunReq,
  ownerKey: string,
): Promise<BatchRunResult> {
  consumeStartToken(ownerKey, "code");
  const releaseSlot = reserveSessionSlot(ownerKey);
  let workspaceDir: string | null = null;

  try {
    let payload: Record<string, unknown>;
    if (request.kind === "code") {
      const entry = request.entry ?? defaultEntry(request.language);
      let entries = normalizeEntries(request.files);
      if (typeof request.code === "string") {
        entries = replaceEntryCode({ entries, entry, code: request.code });
      }
      if (!entries.some((item) => item.kind !== "directory" && item.path === entry)) {
        throw new Error("Code batch run requires code or an entry file in files[].");
      }
      workspaceDir = await createWorkspace(entries);
      const plan = getExecutionPlan(request.language, entry, onlyFiles(entries));
      await ensureWorkspaceRuntimeFiles(workspaceDir, plan.prepareDirs ?? []);
      await ensureWorkspaceWritableForShellUser(workspaceDir);
      payload = { ...request, entry, plan };
    } else {
      workspaceDir = await createWorkspace([]);
      await ensureWorkspaceWritableForShellUser(workspaceDir);
      payload = { ...request };
    }

    await writeBatchRequest(workspaceDir, payload);

    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const getStdout = collect(stdout);
    const getStderr = collect(stderr);

    const container = await docker.createContainer({
      Image: env.runnerImage,
      name: `zoeskoul_batch_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      Tty: false,
      OpenStdin: false,
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: "/workspace",
      User: `${env.execUid}:${env.execGid}`,
      Env: [
        "PYTHONUNBUFFERED=1",
        "HOME=/workspace",
        "TMPDIR=/tmp",
        "PATH=/usr/bin:/bin",
        "GIT_PAGER=cat",
        "PAGER=cat",
        "GIT_TERMINAL_PROMPT=0",
        "BATCH_REQUEST_PATH=/workspace/.zoeskoul/batch-request.json",
      ],
      Entrypoint: ["python3", "/opt/runner/batch-runner.py"],
      Cmd: [],
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

    const attach = await container.attach({ stream: true, stdout: true, stderr: true });
    docker.modem.demuxStream(attach, stdout, stderr);
    await container.start();

    const hardTimeoutMs =
      request.kind === "code"
        ? Math.max(2_000, (request.wallTimeoutMs ?? 8_000) + 5_000)
        : Math.max(2_000, (request.limits?.statementTimeoutMs ?? 4_000) + 5_000);

    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeoutResult = new Promise<{ StatusCode: number }>((resolve) => {
      timer = setTimeout(async () => {
        try { await container.kill(); } catch {}
        resolve({ StatusCode: 124 });
      }, hardTimeoutMs);
    });

    const waitResult = await Promise.race([container.wait(), timeoutResult]);
    if (timer) clearTimeout(timer);
    await new Promise<void>((resolve) => setTimeout(resolve, 20));

    const rawStdout = getStdout().trim();
    const rawStderr = getStderr().trim();
    if (!rawStdout) {
      return {
        kind: request.kind,
        ok: false,
        status: waitResult.StatusCode === 124 ? "Timeout" : "Error",
        ...(request.kind === "sql" ? { dialect: request.dialect } : {}),
        error: rawStderr || (waitResult.StatusCode === 124
          ? "Runner batch container timed out."
          : "Runner batch container returned no result."),
        stderr: rawStderr,
      } as BatchRunResult;
    }

    let result: BatchRunResult;
    try {
      const lines = rawStdout.split(/\r?\n/).filter(Boolean);
      result = JSON.parse(lines[lines.length - 1] ?? "") as BatchRunResult;
    } catch {
      return {
        kind: request.kind,
        ok: false,
        status: "Error",
        ...(request.kind === "sql" ? { dialect: request.dialect } : {}),
        error: `Invalid runner batch result: ${rawStdout.slice(0, 500)}`,
        stderr: rawStderr,
      } as BatchRunResult;
    }

    if (request.kind === "code" && request.captureWorkspace && workspaceDir) {
      (result as any).workspaceFiles = await snapshotWorkspaceFiles(workspaceDir);
    }
    return result;
  } finally {
    releaseSlot();
    if (workspaceDir) await cleanupWorkspaceNow(workspaceDir).catch(() => {});
  }
}
