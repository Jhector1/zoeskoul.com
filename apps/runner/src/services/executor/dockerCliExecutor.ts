import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { env } from "../../lib/env.js";

export type CreatedContainer = {
    id: string;
};

function dockerEnv() {
    return {
        ...process.env,
        DOCKER_HOST:  env.dockerHost,
    };
}

async function capture(cmd: string, args: string[], stdinBuffer?: Buffer) {
    const child = spawn(cmd, args, {
        env: dockerEnv(),
        stdio: ["pipe", "pipe", "pipe"],
    });

    const out: Buffer[] = [];
    const err: Buffer[] = [];

    child.stdout.on("data", (d) => out.push(Buffer.from(d)));
    child.stderr.on("data", (d) => err.push(Buffer.from(d)));

    if (stdinBuffer) {
        child.stdin.write(stdinBuffer);
    }
    child.stdin.end();

    const [code] = (await once(child, "close")) as [number];
    if (code !== 0) {
        throw new Error(Buffer.concat(err).toString("utf8") || `docker failed: ${args.join(" ")}`);
    }

    return Buffer.concat(out).toString("utf8").trim();
}

export async function createContainer(opts: {
    image: string;
    uid: number;
    gid: number;
    compileCmdJson: string | null;
    runCmdJson: string;
}) {
    const args = [
        "container",
        "create",
        "--tty",
        "--interactive",
        "--read-only",
        "--network",
        "none",
        "--memory",
        "512m",
        "--cpus",
        "1",
        "--pids-limit",
        "128",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges:true",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,size=64m",
        "--tmpfs",
        "/run:rw,noexec,nosuid,size=16m",
        "--workdir",
        "/workspace",
        "--user",
        `${opts.uid}:${opts.gid}`,
        "--env",
        `COMPILE_CMD_JSON=${opts.compileCmdJson ?? ""}`,
        "--env",
        `RUN_CMD_JSON=${opts.runCmdJson}`,
        "--env",
        "TERM=xterm-256color",
        "--env",
        "COLUMNS=120",
        "--env",
        "LINES=30",
        "--env",
        "PYTHONUNBUFFERED=1",
        "--env",
        "HOME=/tmp",
        "--env",
        "PATH=/usr/bin:/bin",
        "--env",
        "BASH_ENV=/dev/null",
        "--env",
        "ENV=/dev/null",
        opts.image,
    ];

    const id = await capture("docker", args);
    return { id };
}

export async function copyArchiveToWorkspace(containerId: string, archive: Buffer) {
    await capture("docker", ["container", "cp", "-", `${containerId}:/workspace`], archive);
}

export function startAttached(containerId: string): ChildProcessWithoutNullStreams {
    return spawn("docker", ["container", "start", "-a", "-i", containerId], {
        env: dockerEnv(),
        stdio: ["pipe", "pipe", "pipe"],
    });
}

export async function inspectExitCode(containerId: string) {
    const out = await capture("docker", [
        "inspect",
        "--format",
        "{{.State.ExitCode}}",
        containerId,
    ]);
    const code = Number(out);
    return Number.isFinite(code) ? code : 1;
}

export async function killContainer(containerId: string) {
    try {
        await capture("docker", ["kill", containerId]);
    } catch {}
}

export async function removeContainer(containerId: string) {
    try {
        await capture("docker", ["rm", "-f", containerId]);
    } catch {}
}