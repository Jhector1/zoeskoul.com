import "server-only";

import { zipProject } from "./projectZip";
import { createJudge0Submission, getJudge0Submission } from "./judge0";
import { getSingleFileLanguageId } from "./langIds";
import { executeSqlRun } from "./sql/executeSql";
import type {
  CodeRunReq,
  RunLimits,
  RunPollResult,
  RunReq,
  RunResult,
  RunSubmitResult,
} from "./types";
import { isSqlRunReq } from "./types";

const DEFAULT_POLL_INTERVAL_MS = 250;
const DEFAULT_MAX_POLLS = 120;

const DEFAULT_CODE_LIMITS: Required<
    Pick<
        RunLimits,
        | "cpu_time_limit"
        | "cpu_extra_time"
        | "wall_time_limit"
        | "memory_limit"
        | "stack_limit"
        | "max_processes_and_or_threads"
        | "enable_network"
        | "number_of_runs"
    >
> = {
  cpu_time_limit: 2,
  cpu_extra_time: 0.5,
  wall_time_limit: 8,
  memory_limit: 256000,
  stack_limit: 64000,
  max_processes_and_or_threads: 30,
  enable_network: false,
  number_of_runs: 1,
};

function b64(s: string) {
  return Buffer.from(String(s ?? ""), "utf8").toString("base64");
}

function envInt(name: string) {
  const raw = process.env[name];
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function clampNumber(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function normalizeCodeLimits(input?: RunLimits): RunLimits {
  const src = input ?? {};

  return {
    cpu_time_limit: clampNumber(
        Number(src.cpu_time_limit ?? DEFAULT_CODE_LIMITS.cpu_time_limit),
        1,
        10,
    ),
    cpu_extra_time: clampNumber(
        Number(src.cpu_extra_time ?? DEFAULT_CODE_LIMITS.cpu_extra_time),
        0,
        5,
    ),
    wall_time_limit: clampNumber(
        Number(src.wall_time_limit ?? DEFAULT_CODE_LIMITS.wall_time_limit),
        2,
        20,
    ),
    memory_limit: clampNumber(
        Number(src.memory_limit ?? DEFAULT_CODE_LIMITS.memory_limit),
        64000,
        512000,
    ),
    stack_limit: clampNumber(
        Number(src.stack_limit ?? DEFAULT_CODE_LIMITS.stack_limit),
        16000,
        256000,
    ),
    max_processes_and_or_threads: clampNumber(
        Number(
            src.max_processes_and_or_threads ??
            DEFAULT_CODE_LIMITS.max_processes_and_or_threads,
        ),
        1,
        120,
    ),
    // Production safety: code execution never gets outbound network access,
    // regardless of what a caller sends.
    enable_network: false,
    number_of_runs: clampNumber(
        Number(src.number_of_runs ?? DEFAULT_CODE_LIMITS.number_of_runs),
        1,
        3,
    ),
  };
}

function recordToFileEntries(files: Record<string, string>) {
  return Object.entries(files).map(([path, content]) => ({
    path,
    content,
  }));
}

function getJudge0BaseUrl() {
  const base = process.env.JUDGE0_URL?.trim();
  if (!base) return null;
  return base.replace(/\/$/, "");
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function syntheticEntryFor(language: string) {
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
    case "bash":
      return "main.sh";
    default:
      return "main.txt";
  }
}

function normalizeFileEntries(
    files:
        | Array<{ path: string; content: string }>
        | Record<string, string>
        | undefined,
) {
  if (!files) return [];

  return Array.isArray(files)
      ? files.map((file) => ({
        path: file.path,
        content: String(file.content ?? ""),
      }))
      : recordToFileEntries(files);
}

function replaceEntryContent(args: {
  files: Array<{ path: string; content: string }>;
  entry: string;
  code: string;
}) {
  let replaced = false;

  const next = args.files.map((file) => {
    if (file.path !== args.entry) return file;

    replaced = true;
    return {
      path: file.path,
      content: args.code,
    };
  });

  if (!replaced) {
    next.push({
      path: args.entry,
      content: args.code,
    });
  }

  return next;
}

async function buildSubmissionBody(req: CodeRunReq) {
  const stdinRaw = ("stdin" in req && req.stdin ? req.stdin : "") ?? "";
  const stdin = b64(stdinRaw);
  const limits = normalizeCodeLimits((req as any).limits);

  const shouldUseProjectMode =
      "files" in req || req.captureWorkspace === true;

  if (shouldUseProjectMode) {
    const entry =
        "entry" in req && typeof req.entry === "string" && req.entry.trim()
            ? req.entry
            : syntheticEntryFor(req.language);

    const baseFiles =
        "files" in req ? normalizeFileEntries(req.files) : [];
//0
    const fileEntries =
        typeof req.code === "string"
            ? replaceEntryContent({
              files: baseFiles,
              entry,
              code: req.code,
            })
            : baseFiles;

    if (!fileEntries.some((file) => file.path === entry)) {
      throw new Error(
          "Project run requires either code or an entry file in files[].",
      );
    }

    const additional_files = await zipProject(
        req.language,
        entry,
        fileEntries,
    );

    return {
      language_id: 89,
      additional_files,
      stdin,
      ...limits,
    };
  }

  const language_id = getSingleFileLanguageId(req.language);

  return {
    language_id,
    source_code: b64(req.code),
    stdin,
    ...limits,
  };
}
function normalizeSqlReq(req: RunReq): RunReq {
  if (!isSqlRunReq(req)) return req;

  const dialect =
      (req as any).dialect ??
      (req as any).sqlDialect ??
      "sqlite";

  return {
    ...req,
    dialect,
    schemaSql: (req as any).schemaSql ?? (req as any).setupSql,
  } as any;
}

export async function submitRun(req: RunReq): Promise<RunSubmitResult> {
  const normalized = normalizeSqlReq(req);

  if (isSqlRunReq(normalized)) {
    const result = await executeSqlRun(normalized);
    return {
      ok: true,
      mode: "immediate",
      result,
    };
  }

  const base = getJudge0BaseUrl();
  if (!base) return { ok: false, error: "Missing JUDGE0_URL env var." };

  const body = await buildSubmissionBody(normalized);
  const queued = await createJudge0Submission(
      `${base}/submissions?base64_encoded=true`,
      body,
  );

  if (!queued.ok) return queued;
  return queued;
}

export async function pollRun(token: string): Promise<RunPollResult> {
  const base = getJudge0BaseUrl();
  if (!base) {
    return {
      ok: false,
      done: true,
      status: "Error",
      error: "Missing JUDGE0_URL env var.",
    };
  }

  const safeToken = encodeURIComponent(String(token ?? "").trim());
  return getJudge0Submission(`${base}/submissions/${safeToken}?base64_encoded=true`);
}

export async function runCode(req: RunReq): Promise<RunResult> {
  const submit = await submitRun(req);
  if (!submit.ok) {
    return {
      ok: false,
      status: "Error",
      error: submit.error,
    };
  }

  if (submit.mode === "immediate") {
    return submit.result;
  }

  const pollIntervalMs = envInt("CODE_RUN_POLL_INTERVAL_MS") ?? DEFAULT_POLL_INTERVAL_MS;
  const maxPolls = envInt("CODE_RUN_MAX_POLLS") ?? DEFAULT_MAX_POLLS;

  for (let i = 0; i < maxPolls; i++) {
    const polled = await pollRun(submit.token);
    if (polled.done) return polled;

    await sleep(pollIntervalMs);
  }

  return {
    ok: false,
    status: "Timeout",
    error: "Execution timed out while waiting for Judge0.",
  };
}
