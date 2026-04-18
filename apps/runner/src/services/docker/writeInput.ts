import { requireOwnedSession } from "../sessions/ownership.js";
import { touchSession } from "../sessions/sessionStore.js";

export async function writeInput(
    sessionId: string,
    input: string,
    actorKey: string,
) {
    const session = requireOwnedSession(sessionId, actorKey);



    if (!session.attachStream) {
        throw new Error("Session is not accepting input.");
    }

    session.attachStream.write(Buffer.from(String(input ?? ""), "utf8"));
    touchSession(sessionId);


}