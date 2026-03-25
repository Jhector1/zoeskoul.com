import crypto from "node:crypto";
import { PassThrough } from "node:stream";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import type {
    FileEntry,
    InteractiveLanguage,
    InteractiveRunReq,
    StartSessionResult,
} from "@zoeskoul/code-contracts";
import { env } from "../../lib/env";
import {
    createSession,
    pushEvent,
    setSessionStream,
    touchSession,
    getSession,
} from "../sessions/sessionStore";
import {
    armIdleTimeout,
    armWallTimeout,
    clearAllTimeouts,
} from "../sessions/timeoutManager";
import { createWorkspace } from "../workspace/createWorkspace";
import { cleanupWorkspace } from "../workspace/cleanupWorkspace";
import { getExecutionPlan } from "../execution/executionPlan";
import { docker } from "./dockerClient";

function normalizeFiles(req: InteractiveRunReq): { files: FileEntry[]; entry: string } {
    if ("files" in req) {
        const files = Array.isArray(req.files)
            ? req.files
            : Object.entries(req.files).map(([path, content]) => ({ path, content }));
        return { files, entry: req.entry };
    }

    const entry = defaultEntry(req.language);
    return {
        files: [{ path: entry, content: req.code }],
        entry,
    };
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

function looksLikePromptTail(text: string) {
    const t = String(text ?? "").trimEnd();
    return /[:?]$/.test(t);
}

function maybeEmitInputRequest(sessionId: string, chunk: string) {
    const session = getSession(sessionId);
    if (!session) return;
    if (session.state === "waiting_for_input") return;

    if (looksLikePromptTail(chunk)) {
        pushEvent(sessionId, { type: "status", state: "waiting_for_input" });
        pushEvent(sessionId, { type: "input_request" });
    }
}

export async function startDockerSession(
    req: InteractiveRunReq,
): Promise<StartSessionResult> {
    const { files, entry } = normalizeFiles(req);
    const workspaceDir = await createWorkspace(files);

    const rootFiles = await fs.readdir(workspaceDir);
    console.log("WORKSPACE DIR", workspaceDir);
    console.log("WORKSPACE ROOT FILES", rootFiles);

    const tree = spawnSync("bash", ["-lc", "find . -maxdepth 5 -type f | sort"], {
        cwd: workspaceDir,
        encoding: "utf8",
    });
    console.log("WORKSPACE TREE\n" + tree.stdout);

    console.log("NORMALIZED ENTRY", entry);
    console.log("NORMALIZED FILES", files.map((f) => f.path));

    const plan = getExecutionPlan(req.language, entry);
    console.log("RUN PLAN", {
        language: req.language,
        entry,
        files: files.map((f) => f.path),
        compileCmd: plan.compileCmd,
        runCmd: plan.runCmd,
    });

    const sessionId = `sess_${crypto.randomUUID()}`;
    const containerName = `zoeskoul_${sessionId}`;

    const container = await docker.createContainer({
        Image: env.runnerImage,
        name: containerName,
        Tty: false,
        OpenStdin: true,
        StdinOnce: false,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: "/workspace",
        User: "1000:1000",
        Env: [
            `COMPILE_CMD=${plan.compileCmd ?? ""}`,
            `RUN_CMD=${plan.runCmd}`,
        ],
        HostConfig: {
            Binds: [`${workspaceDir}:/workspace`],
            NetworkMode: "none",
            Memory: 512 * 1024 * 1024,
            NanoCpus: 1_000_000_000,
            PidsLimit: 128,
            AutoRemove: true,
            SecurityOpt: ["no-new-privileges"],
            Tmpfs: {
                "/tmp": "rw,noexec,nosuid,size=64m",
            },
        },
    });

    createSession({
        id: sessionId,
        containerId: container.id,
        workspaceDir,
    });

    pushEvent(sessionId, { type: "status", state: "preparing" });

    try {
        await container.start();

        const attach = await container.attach({
            stream: true,
            stdin: true,
            stdout: true,
            stderr: true,
        });

        // Keep raw attach stream for stdin writes later
        setSessionStream(sessionId, attach);

        // Demux stdout/stderr so Docker framing bytes do not leak into terminal
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        docker.modem.demuxStream(attach, stdout, stderr);

        pushEvent(sessionId, { type: "status", state: "running" });

        const wallTimeout = req.wallTimeoutMs ?? env.wallTimeoutMsDefault;
        const idleTimeout = req.idleTimeoutMs ?? env.idleTimeoutMsDefault;

        armWallTimeout(sessionId, wallTimeout);
        armIdleTimeout(sessionId, idleTimeout);

        stdout.on("data", (chunk: Buffer) => {
            const text = chunk.toString("utf8");
            touchSession(sessionId);
            pushEvent(sessionId, { type: "stdout", chunk: text });
            maybeEmitInputRequest(sessionId, text);
        });

        stderr.on("data", (chunk: Buffer) => {
            const text = chunk.toString("utf8");
            touchSession(sessionId);
            pushEvent(sessionId, { type: "stderr", chunk: text });
        });

        container
            .wait()
            .then(async (result) => {
                const code = result.StatusCode ?? 0;
                clearAllTimeouts(sessionId);
                pushEvent(sessionId, { type: "exit", code });
                pushEvent(sessionId, {
                    type: "status",
                    state: code === 0 ? "completed" : "failed",
                });
                await cleanupWorkspace(workspaceDir);
            })
            .catch(async (err: Error) => {
                clearAllTimeouts(sessionId);
                pushEvent(sessionId, { type: "error", message: err.message });
                pushEvent(sessionId, { type: "status", state: "failed" });
                await cleanupWorkspace(workspaceDir);
            });

        return {
            ok: true,
            sessionId,
            state: "running",
        };
    } catch (e: any) {
        clearAllTimeouts(sessionId);
        pushEvent(sessionId, {
            type: "error",
            message: e?.message ?? "Failed to start container.",
        });
        pushEvent(sessionId, { type: "status", state: "failed" });
        await cleanupWorkspace(workspaceDir);

        return {
            ok: false,
            error: e?.message ?? "Failed to start container.",
        };
    }
}