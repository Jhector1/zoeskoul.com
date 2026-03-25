import type { RunSessionState } from "@zoeskoul/code-contracts";
import { getSession, pushEvent } from "../sessions/sessionStore.js";
import { clearAllTimeouts } from "../sessions/timeoutManager.js";
import { cleanupWorkspace } from "../workspace/cleanupWorkspace.js";
import { docker } from "./dockerClient.js";

type KillFinalState = Extract<RunSessionState, "canceled" | "timed_out" | "failed">;

function isTerminalState(state: string) {
    return (
        state === "completed" ||
        state === "failed" ||
        state === "canceled" ||
        state === "timed_out"
    );
}

export async function killSession(
    sessionId: string,
    finalState: KillFinalState = "canceled",
) {
    const session = getSession(sessionId);
    if (!session) return;

    clearAllTimeouts(sessionId);

    if (!isTerminalState(session.state)) {
        try {
            const container = docker.getContainer(session.containerId);
            await container.kill();
        } catch {
            // ignore kill errors
        }

        pushEvent(sessionId, { type: "status", state: finalState });
    }

    await cleanupWorkspace(session.workspaceDir);
}