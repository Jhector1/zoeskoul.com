import crypto from "node:crypto";
import type {
    FileEntry,
    InteractiveLanguage,
    InteractiveRunReq,
    StartSessionResult,
} from "@zoeskoul/code-contracts";
import { env } from "../../lib/env.js";
import {
    createSession,
    getSession,
    pushEvent,
    setSessionStream,
    touchSession,
} from "../sessions/sessionStore.js";
import {
    armIdleTimeout,
    armWallTimeout,
    clearAllTimeouts,
} from "../sessions/timeoutManager.js";
import { createWorkspace } from "../workspace/createWorkspace.js";
import { cleanupWorkspace } from "../workspace/cleanupWorkspace.js";
import { getExecutionPlan } from "../execution/executionPlan.js";
import { docker } from "./dockerClient.js";

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
): Promise<StartSessionResult> {
    const { files, entry } = normalizeFiles(req);
    const workspaceDir = await createWorkspace(files);
    const plan = getExecutionPlan(req.language, entry);

    const sessionId = `sess_${crypto.randomUUID()}`;
    const containerName = `zoeskoul_${sessionId}`;

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
        Env: [
            `COMPILE_CMD=${plan.compileCmd ?? ""}`,
            `RUN_CMD=${plan.runCmd}`,
            "TERM=xterm-256color",
            "COLUMNS=120",
            "LINES=30",
            "PYTHONUNBUFFERED=1",
        ],
        Cmd: ["python3", "/opt/runner/pty-runner.py"],
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

        setSessionStream(sessionId, attach);
        pushEvent(sessionId, { type: "status", state: "running" });

        const wallTimeout = req.wallTimeoutMs ?? env.wallTimeoutMsDefault;
        const idleTimeout = req.idleTimeoutMs ?? env.idleTimeoutMsDefault;

        armWallTimeout(sessionId, wallTimeout);
        armIdleTimeout(sessionId, idleTimeout);

        attach.on("data", (chunk: Buffer | string) => {
            const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
            if (!text) return;

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

                if (!alreadyFinal || session?.state === "running" || session?.state === "preparing") {
                    pushEvent(sessionId, {
                        type: "status",
                        state: code === 0 ? "completed" : "failed",
                    });
                }

                await cleanupWorkspace(workspaceDir);
            })
            .catch(async (err: Error) => {
                clearAllTimeouts(sessionId);

                const session = getSession(sessionId);
                if (session && !isTerminalState(session.state)) {
                    pushEvent(sessionId, { type: "error", message: err.message });
                    pushEvent(sessionId, { type: "status", state: "failed" });
                }

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