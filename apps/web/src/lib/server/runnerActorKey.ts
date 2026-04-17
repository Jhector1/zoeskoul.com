// src/lib/server/runnerActorKey.ts
import "server-only";
import { createHash } from "node:crypto";
import { auth } from "@/lib/auth";

function sha(s: string) {
    return createHash("sha256").update(s).digest("hex");
}

export async function requireRunnerActorKey(): Promise<string> {
    const session = await auth();
    const userId = (session?.user as any)?.id ?? null;

    if (!userId) {
        throw new Error("Unauthorized");
    }

    return `u:${sha(userId)}`;
}