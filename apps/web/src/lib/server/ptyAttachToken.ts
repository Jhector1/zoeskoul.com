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
        console.log("WEB createAttachToken", {
            sessionId: args.sessionId,
            actorKey: args.actorKey,
            payloadPrefix: payload?.slice(0, 24),
            sigPrefix: sig?.slice(0, 16),
            secretFp: fingerprintSecret(secret),
            hasAttachSecret: true,
        });
    }

    return token;
}

export function verifyAttachToken(token: string): AttachClaims {
    return verifyAttachTokenWithSecret({
        secret: getSecret(),
        token,
    });
}