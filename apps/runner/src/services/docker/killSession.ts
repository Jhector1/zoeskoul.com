import { getSession, pushEvent } from "../sessions/sessionStore.js";
import { clearAllTimeouts } from "../sessions/timeoutManager.js";
import { cleanupWorkspace } from "../workspace/cleanupWorkspace.js";
import { docker } from "./dockerClient.js";

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