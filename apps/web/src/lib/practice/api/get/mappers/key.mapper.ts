import { signPracticeKey } from "@/lib/practice/key";

export function signKey(args: {
    instanceId: string;
    sessionId: string | null;
    userId: string | null;
    guestId: string | null;
    allowReveal: boolean;
}) {
    const nowSec = Math.floor(Date.now() / 1000);

    return signPracticeKey({
        instanceId: args.instanceId,
        sessionId: args.sessionId,
        userId: args.userId,
        guestId: args.guestId,
        allowReveal: args.allowReveal,
        exp: nowSec + 60 * 60,
    });
}