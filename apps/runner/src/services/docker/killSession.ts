import type { RunSessionState } from "@zoeskoul/code-contracts";
import { getSession, pushEvent } from "../sessions/sessionStore.js";
import { clearAllTimeouts } from "../sessions/timeoutManager.js";
import { scheduleWorkspaceCleanup } from "../workspace/cleanupWorkspace.js";
import { docker } from "./dockerClient.js";
import { closeSessionSockets } from "../../ws/sessionWsServer.js";

type KillFinalState = Extract<
    RunSessionState,
    "canceled" | "timed_out" | "failed"
>;

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
    closeSessionSockets(sessionId, 1012, `Session ${finalState}`);
    (session.attachStream as { destroy?: () => void } | null | undefined)?.destroy?.();

    if (!isTerminalState(session.state)) {
        try {
            const container = docker.getContainer(session.containerId);
            await container.kill();
        } catch {
            // ignore kill errors
        }

        pushEvent(sessionId, { type: "status", state: finalState });
    }

    console.info("RUNNER session cleanup scheduled", {
        sessionId,
        ownerKey: session.ownerKey ?? "anonymous",
        finalState,
    });

    /**
     * Keep the workspace briefly even after cancel/timeout so the UI can
     * pull back files that existed at termination time.
     */
    scheduleWorkspaceCleanup(sessionId, session.workspaceDir);
}
