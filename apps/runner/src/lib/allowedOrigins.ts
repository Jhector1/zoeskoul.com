import { env } from "./env.js";

function normalizeOrigin(value?: string | null) {
    if (!value) return null;
    try {
        return new URL(value).origin.toLowerCase();
    } catch {
        return null;
    }
}

export function getAllowedOrigins() {
    const fromList = String(env.allowedWebOriginsRaw ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);

    const all = [...fromList, env.webUrl ?? ""]
        .map((v) => normalizeOrigin(v))
        .filter((v): v is string => Boolean(v));

    return new Set(all);
}

export function isAllowedOrigin(origin?: string | null) {
    if (!origin) return true;
    const normalized = normalizeOrigin(origin);
    if (!normalized) return false;

    const allowed = getAllowedOrigins();
    return allowed.has(normalized);
}