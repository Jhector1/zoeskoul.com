import { getSession, pushEvent } from "../sessions/sessionStore";
import { docker } from "./dockerClient";

export async function killSession(sessionId: string) {
    const session = getSession(sessionId);
    if (!session) return;

    try {
        const container = docker.getContainer(session.containerId);
        await container.kill();
    } catch {}

    pushEvent(sessionId, { type: "status", state: "canceled" });
}