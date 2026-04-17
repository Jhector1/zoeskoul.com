import { requireOwnedSession } from "../sessions/ownership.js";
import { touchSession } from "../sessions/sessionStore.js";

export async function writeInput(
    sessionId: string,
    input: string,
    actorKey: string,
) {
    const session = requireOwnedSession(sessionId, actorKey);

    console.log("WRITE INPUT begin", {
        sessionId,
        actorKey,
        input: JSON.stringify(input),
        bytes: [...Buffer.from(String(input ?? ""), "utf8")],
        hasAttachStream: !!session.attachStream,
        state: session.state,
    });

    if (!session.attachStream) {
        throw new Error("Session is not accepting input.");
    }

    session.attachStream.write(Buffer.from(String(input ?? ""), "utf8"));
    touchSession(sessionId);

    console.log("WRITE INPUT done", { sessionId });
}