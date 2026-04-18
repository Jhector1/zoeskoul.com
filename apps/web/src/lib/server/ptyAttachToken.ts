import {
    createAttachTokenWithSecret,
    verifyAttachTokenWithSecret,
    fingerprintSecret,
    type AttachClaims,
} from "@zoeskoul/pty-auth";

function getSecret() {
    const secret = process.env.PTY_ATTACH_SECRET;
    if (!secret) {
        throw new Error("Missing PTY_ATTACH_SECRET");
    }
    return secret;
}

export function createAttachToken(args: {
    sessionId: string;
    actorKey: string;
    ttlSeconds?: number;
}) {
    const secret = getSecret();

    const token = createAttachTokenWithSecret({
        secret,
        sessionId: args.sessionId,
        actorKey: args.actorKey,
        ttlSeconds: args.ttlSeconds,
    });

    if (process.env.NODE_ENV !== "production") {
        const [payload, sig] = token.split(".");

    }

    return token;
}

export function verifyAttachToken(token: string): AttachClaims {
    return verifyAttachTokenWithSecret({
        secret: getSecret(),
        token,
    });
}