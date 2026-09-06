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

const sessionTeardowns = new Map<string, Promise<void>>();

/**
 * Finalize a session synchronously, then tear down its Docker container in the
 * background of that state transition.
 *
 * Browser topic handoff waits for the cancel route before opening the next PTY.
 * Docker can take several seconds to acknowledge a kill, so keeping the session
 * active until that acknowledgement unnecessarily holds the user's terminal
 * capacity at its limit. Marking the session terminal first releases capacity
 * immediately while the same promise still lets internal callers await the
 * physical container teardown when they need to.
 */
export function killSession(
    sessionId: string,
    finalState: KillFinalState = "canceled",
) {
    const existingTeardown = sessionTeardowns.get(sessionId);
    if (existingTeardown) return existingTeardown;

    const session = getSession(sessionId);
    if (!session) return Promise.resolve();

    clearAllTimeouts(sessionId);
    closeSessionSockets(sessionId, 1012, `Session ${finalState}`);
    (session.attachStream as { destroy?: () => void } | null | undefined)?.destroy?.();

    const alreadyTerminal = isTerminalState(session.state);

    if (!alreadyTerminal) {
        // Release runner capacity before waiting on the Docker daemon.
        pushEvent(sessionId, { type: "status", state: finalState });
    }

    if (!session.expiresAt) {
        scheduleWorkspaceCleanup(sessionId, session.workspaceDir);
    }

    console.info("RUNNER session cleanup scheduled", {
        sessionId,
        ownerKey: session.ownerKey ?? "anonymous",
        finalState: alreadyTerminal ? session.state : finalState,
    });

    const teardown = (async () => {
        const container = docker.getContainer(session.containerId);

        // AutoRemove is still enabled on child containers, but it is not enough
        // for never-started containers or daemon edge cases. Force-remove is
        // idempotent from the runner's perspective and prevents container
        // metadata from becoming a long-lived disk leak.
        try {
            await container.kill();
        } catch {
            // The container may already have stopped or been auto-removed.
        }

        try {
            await container.remove({ force: true });
        } catch {
            // AutoRemove may already have removed it after kill.
        }
    })().finally(() => {
        sessionTeardowns.delete(sessionId);
    });

    sessionTeardowns.set(sessionId, teardown);
    return teardown;
}
