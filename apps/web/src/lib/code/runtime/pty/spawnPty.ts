import type { PtyHandle } from "./types";

export async function spawnPty(_args: {
    cwd: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
}): Promise<PtyHandle> {
    throw new Error("PTY runtime not implemented yet.");
}