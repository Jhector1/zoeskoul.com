import "server-only";

import { createJudge0Submission, getJudge0Submission } from "./judge0";
import { getSingleFileLanguageId } from "./langIds";
import { zipProject } from "./projectZip";
import { executeSqlRun } from "../sql/executeSql";
import type {
    BatchRunReq,
    BatchRunResult,
    BatchRunSubmitResult,
    BatchRunPollResult,
} from "../types/batch";
import type { RunLimits } from "../types/common";

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

function isSql(req: BatchRunReq): boolean {
    return req.kind === "sql";
}

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

export function normalizeCodeLimits(input?: RunLimits): RunLimits {
    const src = input ?? {};
    return {
        cpu_time_limit: clampNumber(Number(src.cpu_time_limit ?? DEFAULT_CODE_LIMITS.cpu_time_limit), 1, 10),
        cpu_extra_time: clampNumber(Number(src.cpu_extra_time ?? DEFAULT_CODE_LIMITS.cpu_extra_time), 0, 5),
        wall_time_limit: clampNumber(Number(src.wall_time_limit ?? DEFAULT_CODE_LIMITS.wall_time_limit), 2, 20),
        memory_limit: clampNumber(Number(src.memory_limit ?? DEFAULT_CODE_LIMITS.memory_limit), 64000, 512000),
        stack_limit: clampNumber(Number(src.stack_limit ?? DEFAULT_CODE_LIMITS.stack_limit), 16000, 256000),
        max_processes_and_or_threads: clampNumber(
            Number(src.max_processes_and_or_threads ?? DEFAULT_CODE_LIMITS.max_processes_and_or_threads),
            1,
            120,
        ),
        enable_network: Boolean(src.enable_network ?? DEFAULT_CODE_LIMITS.enable_network),
        number_of_runs: clampNumber(Number(src.number_of_runs ?? DEFAULT_CODE_LIMITS.number_of_runs), 1, 3),
    };
}

function getJudge0BaseUrl() {
    const base = process.env.JUDGE0_URL?.trim();
    if (!base) return null;
    return base.replace(/\/$/, "");
}

function normalizeSqlReq(req: BatchRunReq): BatchRunReq {
    if (!isSql(req)) return req;
    return {
        ...req,
        schemaSql: req.schemaSql ?? req.setupSql,
    };
}

function recordToFileEntries(files: Record<string, string>) {
    return Object.entries(files).map(([path, content]) => ({ path, content }));
}

async function buildSubmissionBody(req: Exclude<BatchRunReq, { kind: "sql" }>) {
    const stdin = b64(req.stdin ?? "");
    const limits = normalizeCodeLimits(req.limits);

    if ("files" in req) {
        const fileEntries = Array.isArray(req.files) ? req.files : recordToFileEntries(req.files);
        const additional_files = await zipProject(req.language, req.entry, fileEntries);
        return { language_id: 89, additional_files, stdin, ...limits };
    }

    return {
        language_id: getSingleFileLanguageId(req.language),
        source_code: b64(req.code),
        stdin,
        ...limits,
    };
}

export async function submitBatchRun(req: BatchRunReq): Promise<BatchRunSubmitResult> {
    const normalized = normalizeSqlReq(req);

    if (isSql(normalized)) {
        const result = await executeSqlRun(normalized);
        return { ok: true, mode: "immediate", result };
    }

    const base = getJudge0BaseUrl();
    if (!base) return { ok: false, error: "Missing JUDGE0_URL env var." };

    const body = await buildSubmissionBody(normalized);
    return createJudge0Submission(`${base}/submissions?base64_encoded=true`, body);
}

export async function pollBatchRun(token: string): Promise<BatchRunPollResult> {
    const base = getJudge0BaseUrl();
    if (!base) {
        return { ok: false, done: true, status: "Error", error: "Missing JUDGE0_URL env var." };
    }
    return getJudge0Submission(`${base}/submissions/${encodeURIComponent(token)}?base64_encoded=true`);
}

export async function runBatch(req: BatchRunReq): Promise<BatchRunResult> {
    const submitted = await submitBatchRun(req);
    if (!submitted.ok) return { ok: false, status: "Error", error: submitted.error };
    if (submitted.mode === "immediate") return submitted.result;

    const pollIntervalMs = envInt("CODE_RUN_POLL_INTERVAL_MS") ?? DEFAULT_POLL_INTERVAL_MS;
    const maxPolls = envInt("CODE_RUN_MAX_POLLS") ?? DEFAULT_MAX_POLLS;

    for (let i = 0; i < maxPolls; i++) {
        const polled = await pollBatchRun(submitted.token);
        if (polled.done) return polled;
        await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    return { ok: false, status: "Timeout", error: "Execution timed out while waiting for Judge0." };
}