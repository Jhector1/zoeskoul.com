import crypto from "node:crypto";

type AttachClaims = {
    sid: string;
    actor: string;
    exp: number;
};

function base64url(input: Buffer | string) {
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

function getSecret() {
    const secret = process.env.PTY_ATTACH_SECRET || process.env.AUTH_SECRET;
    if (!secret) {
        throw new Error("Missing PTY_ATTACH_SECRET or AUTH_SECRET");
    }
    return secret;
}

function signText(text: string) {
    return crypto.createHmac("sha256", getSecret()).update(text).digest();
}

function safeEqualText(a: string, b: string) {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
}

export function createAttachToken(args: {
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
    const sig = base64url(signText(payload));
    return `${payload}.${sig}`;
}

export function verifyAttachToken(token: string): AttachClaims {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) {
        throw new Error("Invalid attach token");
    }

    const expected = base64url(signText(payload));
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