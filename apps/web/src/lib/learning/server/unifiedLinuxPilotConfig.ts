import "server-only";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

export const pilotOrigin = "http://localhost:3000";
export const pilotActorValid = (value: unknown): value is string => typeof value === "string" && /^u:[a-f0-9]{64}$/.test(value);

function root(): string | null {
    if (process.env.NODE_ENV !== "development" ||
        process.env.ZOESKOUL_LEARNING_UNIFIED_WEB_PILOT !== "true" ||
        process.env.ZOESKOUL_LEARNING_STUDENT_ADMIN_LABS_ENABLED !== "true" ||
        process.env.ZOESKOUL_LEARNING_WEB_ORIGIN !== pilotOrigin) return null;
    try {
        const path = process.env.ZOESKOUL_LEARNING_UNIFIED_PILOT_ROOT;
        if (!path || realpathSync(path) !== path || !/^\/(?:private\/)?tmp\/zoe-u4d\.[A-Za-z0-9_]+$/.test(path)) return null;
        const st = lstatSync(path);
        if (!st.isDirectory() || st.uid !== process.getuid?.() || (st.mode & 0o777) !== 0o700) return null;
        return path;
    } catch { return null; }
}

function privateText(path: string, file: string): string | null {
    try {
        const f = join(path, file), st = lstatSync(f);
        if (!st.isFile() || st.uid !== process.getuid?.() || (st.mode & 0o777) !== 0o600 ||
            st.nlink !== 1 || st.size > 128 || realpathSync(f) !== f) return null;
        return readFileSync(f, "utf8").trim();
    } catch { return null; }
}

export function unifiedPilotConfig() {
    const path = root();
    if (!path) return null;
    const bridge = privateText(path, "bridge-secret"), grant = privateText(path, "grant-secret"), actor = privateText(path, "actor");
    if (!bridge || !grant || !/^[a-f0-9]{64}$/.test(bridge) || !/^[a-f0-9]{64}$/.test(grant) || bridge === grant) return null;
    return { bridge, grant, actor: pilotActorValid(actor) ? actor : null, socketPath: join(path, "web.sock") };
}
