import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { env } from "../../lib/env.js";



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

export async function killContainer(containerId: string) {
    try {
        await capture("docker", ["kill", containerId]);
    } catch {}
}

