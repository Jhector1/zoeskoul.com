import crypto from "crypto";

function requestNonce() {
    return crypto.randomUUID?.() ?? crypto.randomBytes(16).toString("hex");
}

export function resolveRequestSalt(saltParam?: string) {
    const stableSalt = String(saltParam ?? "").trim() || null;
    const reqSalt = stableSalt ?? `rnd:${requestNonce()}`;
    return { stableSalt, reqSalt };
}