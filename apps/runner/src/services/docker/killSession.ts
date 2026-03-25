import { getSession, pushEvent } from "../sessions/sessionStore";
import { clearAllTimeouts } from "../sessions/timeoutManager";
import { cleanupWorkspace } from "../workspace/cleanupWorkspace";
import { docker } from "./dockerClient";

export async function killSession(sessionId: string) {
    const session = getSession(sessionId);
    if (!session) return;

    clearAllTimeouts(sessionId);

    try {
        const container = docker.getContainer(session.containerId);
        await container.kill();
    } catch {}

    pushEvent(sessionId, { type: "status", state: "canceled" });
    await cleanupWorkspace(session.workspaceDir);
}