import { getSession } from "../sessions/sessionStore.js";
import { docker } from "./dockerClient.js";

export async function resizeSession(sessionId: string, cols: number, rows: number) {
    const session = getSession(sessionId);
    if (!session) {
        throw new Error("Session not found.");
    }

    const container = docker.getContainer(session.containerId);
    await container.resize({
        w: Math.max(1, Math.floor(cols || 80)),
        h: Math.max(1, Math.floor(rows || 24)),
    });
}