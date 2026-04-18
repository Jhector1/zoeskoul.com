import {
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

export function verifyAttachToken(token: string): AttachClaims {
    const secret = getSecret();
    const [payload, sig] = token.split(".");

    const claims = verifyAttachTokenWithSecret({
        secret,
        token,
    });

    if (process.env.NODE_ENV !== "production") {
        console.log("RUNNER verifyAttachToken", {
            payloadPrefix: payload?.slice(0, 24),
            sigPrefix: sig?.slice(0, 16),
            secretFp: fingerprintSecret(secret),
            hasAttachSecret: true,
        });
    }

    return claims;
}