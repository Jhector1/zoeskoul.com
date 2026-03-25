import { getSession, pushEvent } from "./sessionStore";
import { killSession } from "../docker/killSession";

const wallTimers = new Map<string, NodeJS.Timeout>();
const idleTimers = new Map<string, NodeJS.Timeout>();

export function armWallTimeout(sessionId: string, ms: number) {
    clearWallTimeout(sessionId);

    const timer = setTimeout(async () => {
        await killSession(sessionId);
        pushEvent(sessionId, { type: "error", message: "Execution timed out." });
        pushEvent(sessionId, { type: "status", state: "timed_out" });
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
        const s = getSession(sessionId);
        if (!s) {
            clearIdleTimeout(sessionId);
            return;
        }

        const idleFor = Date.now() - s.lastActivityAt;
        if (idleFor >= ms) {
            clearIdleTimeout(sessionId);
            await killSession(sessionId);
            pushEvent(sessionId, { type: "error", message: "Session timed out from inactivity." });
            pushEvent(sessionId, { type: "status", state: "timed_out" });
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