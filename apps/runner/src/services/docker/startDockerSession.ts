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
import { resolveTimeoutPolicy } from "../sessions/timeoutPolicy.js";
import { createWorkspace } from "../workspace/createWorkspace.js";
import { cleanupWorkspace } from "../workspace/cleanupWorkspace.js";
import { getExecutionPlan } from "../execution/executionPlan.js";
import { docker } from "./dockerClient.js";

type NormalizedRequest =
    | {
    kind: "code";
    language: InteractiveLanguage;
    files: FileEntry[];
    entry: string;
    wallTimeoutMs?: number;
    idleTimeoutMs?: number;
    cwd?: string;
    shell: false;
}
    | {
    kind: "shell";
    language: "bash";
    files: FileEntry[];
    entry?: undefined;
    wallTimeoutMs?: number;
    idleTimeoutMs?: number;
    cwd?: string;
    shell: true;
};

const ATTACH_NOISE_TEXT =
    '{"stream":true,"stdin":true,"stdout":true,"stderr":true,"hijack":true}';

function stripAttachNoise(text: string) {
    if (!text) return text;
    return text.split(ATTACH_NOISE_TEXT).join("");
}

function normalizeFilesMap(
    files: FileEntry[] | Record<string, string> | undefined,
): FileEntry[] {
    if (!files) return [];
    return Array.isArray(files)
        ? files
        : Object.entries(files).map(([path, content]) => ({ path, content }));
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
        case "bash":
            return "main.sh";
    }
}

function normalizeRequest(req: InteractiveRunReq): NormalizedRequest {
    if (req.kind === "shell") {
        return {
            kind: "shell",
            language: "bash",
            files: normalizeFilesMap(req.files),
            wallTimeoutMs: req.wallTimeoutMs,
            idleTimeoutMs: req.idleTimeoutMs,
            cwd: req.cwd,
            shell: true,
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
            shell: false,
        };
    }

    const entry = defaultEntry(req.language);

    return {
        kind: "code",
        language: req.language,
        files: [{ path: entry, content: req.code }],
        entry,
        wallTimeoutMs: req.wallTimeoutMs,
        idleTimeoutMs: req.idleTimeoutMs,
        shell: false,
    };
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
    const normalized = normalizeRequest(req);
    const workspaceDir = await createWorkspace(normalized.files);

    const plan =
        normalized.kind === "shell"
            ? getExecutionPlan("bash", undefined, normalized.files, {
                shell: true,
                cwd: normalized.cwd,
            })
            : getExecutionPlan(
                normalized.language,
                normalized.entry,
                normalized.files,
                {
                    shell: false,
                    cwd: normalized.cwd,
                },
            );

    const sessionId = `sess_${crypto.randomUUID()}`;
    const containerName = `zoeskoul_${sessionId}`;

    console.log("PTY start normalized", {
        sessionId,
        kind: normalized.kind,
        language: normalized.language,
        entry: "entry" in normalized ? normalized.entry : undefined,
        filesCount: normalized.files.length,
        cwd: normalized.cwd,
    });

    console.log("PTY execution plan", {
        sessionId,
        compileCmd: plan.compileCmd ?? null,
        runCmd: plan.runCmd,
        prepareDirs: plan.prepareDirs ?? [],
    });

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
            `PREPARE_DIRS_JSON=${JSON.stringify(plan.prepareDirs ?? [])}`,
            `COMPILE_CMD_JSON=${JSON.stringify(plan.compileCmd ?? null)}`,
            `RUN_CMD_JSON=${JSON.stringify(plan.runCmd)}`,
            "TERM=xterm-256color",
            "COLUMNS=120",
            "LINES=30",
            "PYTHONUNBUFFERED=1",
            "HOME=/tmp",
            "PATH=/usr/bin:/bin",
            "BASH_ENV=/dev/null",
            "ENV=/dev/null",
        ],
        Cmd: ["python3", "/opt/runner/pty-runner.py"],
        HostConfig: {
            Binds: [`${workspaceDir}:/workspace`],
            NetworkMode: "none",
            ReadonlyRootfs: true,
            CapDrop: ["ALL"],
            Memory: 512 * 1024 * 1024,
            NanoCpus: 1_000_000_000,
            PidsLimit: 128,
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
    });

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

        const timeouts = resolveTimeoutPolicy({
            kind: normalized.kind,
            requestedIdleTimeoutMs: normalized.idleTimeoutMs,
            requestedWallTimeoutMs: normalized.wallTimeoutMs,
        });

        console.log("PTY timeout policy", {
            sessionId,
            kind: normalized.kind,
            idleTimeoutMs: timeouts.idleTimeoutMs,
            wallTimeoutMs: timeouts.wallTimeoutMs,
        });

        armWallTimeout(sessionId, timeouts.wallTimeoutMs);
        armIdleTimeout(sessionId, timeouts.idleTimeoutMs);

        let startupChunkBudget = 6;

        attach.on("data", (chunk: Buffer | string) => {
            let text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
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
            state: normalized.kind === "shell" ? "waiting_for_input" : "running",
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
            error: e?.message ?? "Failed." ,
        };
    }
}