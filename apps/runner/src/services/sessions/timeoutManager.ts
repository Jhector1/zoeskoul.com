import { getSession, pushEvent } from "./sessionStore.js";
import { killSession } from "../docker/killSession.js";

const wallTimers = new Map<string, NodeJS.Timeout>();
const idleTimers = new Map<string, NodeJS.Timeout>();

function isTerminalState(state: string) {
    return (
        state === "completed" ||
        state === "failed" ||
        state === "canceled" ||
        state === "timed_out"
    );
}

export function armWallTimeout(sessionId: string, ms: number) {
    clearWallTimeout(sessionId);

    const timer = setTimeout(async () => {
        const session = getSession(sessionId);
        if (!session || isTerminalState(session.state)) return;

        pushEvent(sessionId, { type: "error", message: "Execution timed out." });
        await killSession(sessionId, "timed_out");
    }, ms);

    wallTimers.set(sessionId, timer);
}

export function clearWallTimeout(sessionId: string) {
    const t = wallTimers.get(sessionId);
    if (t) clearTimeout(t);
    wallTimers.delete(sessionId);
}

export function armIdleTimeout(sessionId: string, ms: number) {
    clearIdleTimeout(sessionId);

    const timer = setInterval(async () => {
        const session = getSession(sessionId);
        if (!session) {
            clearIdleTimeout(sessionId);
            return;
        }

        if (isTerminalState(session.state)) {
            clearIdleTimeout(sessionId);
            return;
        }

        const idleFor = Date.now() - session.lastActivityAt;
        if (idleFor >= ms) {
            clearIdleTimeout(sessionId);
            pushEvent(sessionId, {
                type: "error",
                message: "Session timed out from inactivity.",
            });
            await killSession(sessionId, "timed_out");
        }
    }, 1000);

    idleTimers.set(sessionId, timer);
}

export function clearIdleTimeout(sessionId: string) {
    const t = idleTimers.get(sessionId);
    if (t) clearInterval(t);
    idleTimers.delete(sessionId);
}

export function clearAllTimeouts(sessionId: string) {
    clearWallTimeout(sessionId);
    clearIdleTimeout(sessionId);
}