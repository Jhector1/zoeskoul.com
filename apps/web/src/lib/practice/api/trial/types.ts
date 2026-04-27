import type { PrismaClient } from "@/lib/prisma";
import type { Actor } from "@/lib/practice/actor";
import type { TrialStartBody } from "./schemas";

export type TrialStartContext = {
    prisma: PrismaClient;
    req: Request;
    requestId: string;
    actor: Actor;
    setGuestId: string | null;
    body: TrialStartBody;
};

export type TrialStartResult =
    | {
    ok: true;
    resumed: boolean;
    completed: boolean;
    sessionId: string;
    requestId: string;
    status: "active" | "completed";
}
    | {
    ok: false;
    statusCode: number;
    body: {
        message: string;
        requestId: string;
    };
};
