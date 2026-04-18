import crypto from "node:crypto";

export type AttachClaims = {
    sid: string;
    actor: string;
    exp: number;
};

function base64url(input) {
    return Buffer.from(input)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

function unbase64url(input: string) {
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
    const pad =
        normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    return Buffer.from(normalized + pad, "base64");
}

function signText(secret: string, text: string) {
    return crypto.createHmac("sha256", secret).update(text).digest();
}

function safeEqualText(a: string, b: string) {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
}

export function fingerprintSecret(secret: string) {
    return crypto.createHash("sha256").update(secret).digest("hex").slice(0, 12);
}

export function createAttachTokenWithSecret(args: {
    secret: string;
    sessionId: string;
    actorKey: string;
    ttlSeconds?: number;
}) {
    const claims: AttachClaims = {
        sid: args.sessionId,
        actor: args.actorKey,
        exp: Math.floor(Date.now() / 1000) + (args.ttlSeconds ?? 60 * 30),
    };

    const payload = base64url(JSON.stringify(claims));
    const sig = base64url(signText(args.secret, payload));
    return `${payload}.${sig}`;
}

export function verifyAttachTokenWithSecret(args: {
    secret: string;
    token: string;
}): AttachClaims {
    const [payload, sig] = args.token.split(".");
    if (!payload || !sig) {
        throw new Error("Invalid attach token");
    }

    const expected = base64url(signText(args.secret, payload));
    if (!safeEqualText(sig, expected)) {
        throw new Error("Invalid attach token signature");
    }

    const claims = JSON.parse(unbase64url(payload).toString("utf8")) as AttachClaims;

    if (!claims?.sid || !claims?.actor || !claims?.exp) {
        throw new Error("Invalid attach token payload");
    }

    if (claims.exp < Math.floor(Date.now() / 1000)) {
        throw new Error("Attach token expired");
    }

    return claims;
}