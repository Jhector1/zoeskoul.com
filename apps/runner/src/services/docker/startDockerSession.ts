import crypto from "node:crypto";
import type {
    FileEntry,
    InteractiveLanguage,
    InteractiveRunReq,
    StartSessionResult,
} from "@zoeskoul/code-contracts";
import { createSession, pushEvent, setSessionStream } from "../sessions/sessionStore";
import { createWorkspace } from "../workspace/createWorkspace";
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

export async function startDockerSession(
    req: InteractiveRunReq,
): Promise<StartSessionResult> {
    const { files, entry } = normalizeFiles(req);
    const workspaceDir = await createWorkspace(files);
    const sessionId = `sess_${crypto.randomUUID()}`;
    const containerName = `zoeskoul_${sessionId}`;
    const plan = getExecutionPlan(req.language, entry);

    const container = await docker.createContainer({
        Image: process.env.RUNNER_IMAGE || "zoeskoul-runtime:latest",
        name: containerName,
        Tty: false,
        OpenStdin: true,
        StdinOnce: false,
        Env: [
            `COMPILE_CMD=${plan.compileCmd ?? ""}`,
            `RUN_CMD=${plan.runCmd}`,
        ],
        WorkingDir: "/workspace",
        HostConfig: {
            Binds: [`${workspaceDir}:/workspace`],
            NetworkMode: "none",
            Memory: 512 * 1024 * 1024,
            NanoCpus: 1_000_000_000,
            PidsLimit: 128,
            AutoRemove: true,
        },
    });

    createSession({
        id: sessionId,
        containerId: container.id,
        workspaceDir,
    });

    pushEvent(sessionId, { type: "status", state: "preparing" });

    await container.start();

    const attach = await container.attach({
        stream: true,
        stdin: true,
        stdout: true,
        stderr: true,
    });

    setSessionStream(sessionId, attach);

    pushEvent(sessionId, { type: "status", state: "running" });

    attach.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        pushEvent(sessionId, { type: "stdout", chunk: text });
    });

    container.wait().then((result) => {
        const code = result.StatusCode ?? 0;
        pushEvent(sessionId, { type: "exit", code });
        pushEvent(sessionId, {
            type: "status",
            state: code === 0 ? "completed" : "failed",
        });
    }).catch((err: Error) => {
        pushEvent(sessionId, { type: "error", message: err.message });
        pushEvent(sessionId, { type: "status", state: "failed" });
    });

    return {
        ok: true,
        sessionId,
        state: "running",
    };
}