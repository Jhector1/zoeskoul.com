import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import type { FileEntry } from "../types/common";
import type { InteractiveRunReq, StartSessionResult } from "../types/session";
import {
    attachProcess,
    createSession, getSession,
    patchSession,
    pushEvent,
} from "./sessionStore";
import { createWorkspace } from "../runtime/sandbox/createWorkspace";
import { getExecutionPlan } from "../runtime/executors/plans";

function now() {
    return new Date().toISOString();
}

function recordToFileEntries(files: Record<string, string>): FileEntry[] {
    return Object.entries(files).map(([path, content]) => ({ path, content }));
}

function inferSingleFileName(language: InteractiveRunReq["language"]) {
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

function normalizeFiles(req: InteractiveRunReq): { files: FileEntry[]; entry: string } {
    if ("files" in req) {
        const files = Array.isArray(req.files) ? req.files : recordToFileEntries(req.files);

        return { files, entry: req.entry };
    }

    const entry = inferSingleFileName(req.language);
    return {
        entry,
        files: [{ path: entry, content: req.code }],
    };
}

async function runCompileStep(sessionId: string, cwd: string, compile: { command: string; args: string[] }) {
    patchSession(sessionId, { state: "compiling" });
    pushEvent(sessionId, { type: "status", state: "compiling" });

    return await new Promise<{ ok: true } | { ok: false; stdout: string; stderr: string; code: number | null }>((resolve) => {
        const proc = spawn(compile.command, compile.args, {
            cwd,
            stdio: ["ignore", "pipe", "pipe"],
            env: process.env,
        });

        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (chunk) => {
            const text = String(chunk);
            stdout += text;
            pushEvent(sessionId, { type: "stdout", chunk: text });
        });

        proc.stderr.on("data", (chunk) => {
            const text = String(chunk);
            stderr += text;
            pushEvent(sessionId, { type: "stderr", chunk: text });
        });

        proc.on("close", (code) => {
            if (code === 0) {
                resolve({ ok: true });
            } else {
                resolve({ ok: false, stdout, stderr, code });
            }
        });
    });
}

function looksLikePromptTail(text: string) {
    const t = text.trimEnd();
    return /[:?]$/.test(t);
}


function requestInputIfNeeded(sessionId: string, recentStdout: string) {
    const session = getSession(sessionId);
    if (!session) return;

    if (session.state === "waiting_for_input") return;

    if (looksLikePromptTail(recentStdout)) {
        patchSession(sessionId, { state: "waiting_for_input" });
        pushEvent(sessionId, { type: "status", state: "waiting_for_input" });
        pushEvent(sessionId, { type: "input_request" });
    }
}

export async function startInteractiveSession(args: {
    actorKey: string;
    req: InteractiveRunReq;
}): Promise<StartSessionResult> {
    const sessionId = `sess_${crypto.randomUUID()}`;
    const createdAt = now();

    createSession({
        id: sessionId,
        actorKey: args.actorKey,
        language: args.req.language,
        state: "queued",
        createdAt,
        updatedAt: createdAt,
        exitCode: null,
        compileExitCode: null,
        events: [],
        workspaceDir: undefined,
    });

    queueMicrotask(async () => {
        try {
            patchSession(sessionId, { state: "preparing" });
            pushEvent(sessionId, { type: "status", state: "preparing" });

            const { files, entry } = normalizeFiles(args.req);
            const workspaceDir = await createWorkspace(files);
            patchSession(sessionId, { workspaceDir });

            const plan = getExecutionPlan(args.req.language, entry);

            if (plan.compile) {
                const compileResult = await runCompileStep(sessionId, workspaceDir, plan.compile);

                if (!compileResult.ok) {
                    patchSession(sessionId, {
                        state: "failed",
                        compileExitCode: compileResult.code,
                    });

                    pushEvent(sessionId, {
                        type: "compile_error",
                        stdout: compileResult.stdout,
                        stderr: compileResult.stderr,
                    });

                    pushEvent(sessionId, {
                        type: "status",
                        state: "failed",
                    });

                    return;
                }
            }

            patchSession(sessionId, { state: "running" });
            pushEvent(sessionId, { type: "status", state: "running" });

            const proc = spawn(plan.run.command, plan.run.args, {
                cwd: workspaceDir,
                stdio: ["pipe", "pipe", "pipe"],
                env: process.env,
            });

            attachProcess(sessionId, proc);

            let recentStdout = "";

            proc.stdout.on("data", (chunk) => {
                const text = String(chunk);
                recentStdout += text;
                if (recentStdout.length > 4000) {
                    recentStdout = recentStdout.slice(-4000);
                }

                pushEvent(sessionId, { type: "stdout", chunk: text });
                requestInputIfNeeded(sessionId, text);
            });

            proc.stderr.on("data", (chunk) => {
                const text = String(chunk);
                pushEvent(sessionId, { type: "stderr", chunk: text });
            });

            proc.on("close", async (code) => {
                patchSession(sessionId, {
                    state: "completed",
                    exitCode: code,
                });

                pushEvent(sessionId, { type: "exit", code: code ?? 0 });
                pushEvent(sessionId, { type: "status", state: "completed" });

                if (workspaceDir) {
                    await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => {});
                }
            });

            proc.on("error", async (err) => {
                patchSession(sessionId, { state: "failed" });
                pushEvent(sessionId, { type: "error", message: err.message });
                pushEvent(sessionId, { type: "status", state: "failed" });

                if (workspaceDir) {
                    await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => {});
                }
            });

            console.log("RAW INTERACTIVE REQ", JSON.stringify(args.req, null, 2));
            console.log("NORMALIZED FILES", files.map((f) => f.path));
            console.log("NORMALIZED ENTRY", entry);
            console.log("WORKSPACE DIR", workspaceDir);
        } catch (e: any) {
            patchSession(args.req.language, { state: "failed" });
            pushEvent(sessionId, {
                type: "error",
                message: e?.message ?? "Failed to start interactive session.",
            });
            pushEvent(sessionId, { type: "status", state: "failed" });
        }
    });

    return {
        ok: true,
        sessionId,
        state: "queued",
    };
}