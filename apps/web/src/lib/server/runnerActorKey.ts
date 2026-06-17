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

    if (userId) {
        return `u:${sha(userId)}`;
    }

    /**
     * Playwright/dev-clone routes intentionally exercise PTY behavior without a
     * real authenticated user. Keep production locked down, but give e2e runs a
     * stable actor key so terminal-session endpoints can create/reuse leases.
     */
    if (
        process.env.E2E_ALLOW_DEV_ROUTES === "1" ||
        process.env.PLAYWRIGHT === "1" ||
        process.env.PLAYWRIGHT_TEST === "1"
    ) {
        return `e2e:${sha("playwright")}`;
    }

    throw new Error("Unauthorized");
}
