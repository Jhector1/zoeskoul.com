import { getSession } from "./sessionStore.js";

export function requireOwnedSession(sessionId: string, actorKey: string) {
    const session = getSession(sessionId);

    if (!session) {
        throw new Error("Session not found.");
    }

    if (session.ownerKey !== actorKey) {
        throw new Error("Forbidden.");
    }

    return session;
}