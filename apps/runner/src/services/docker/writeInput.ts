import { getSession, pushEvent, touchSession } from "../sessions/sessionStore";

export async function writeInput(sessionId: string, input: string) {
    const session = getSession(sessionId);
    if (!session?.attachStream) {
        throw new Error("Session is not accepting input.");
    }

    session.attachStream.write(input);
    touchSession(sessionId);
    pushEvent(sessionId, { type: "status", state: "running" });
}