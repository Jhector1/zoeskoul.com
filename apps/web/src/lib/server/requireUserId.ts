// src/lib/server/requireUserId.ts
import "server-only";
import { auth } from "@/lib/auth";

export async function requireUserId(): Promise<string> {
    const session = await auth();
    const userId = (session?.user as any)?.id ?? null;

    if (!userId) {
        throw new Error("Unauthorized");
    }

    return userId;
}