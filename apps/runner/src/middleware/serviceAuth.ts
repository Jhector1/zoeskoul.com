import type { RequestHandler, Request } from "express";
import crypto from "node:crypto";
import { env } from "../lib/env.js";

function getHeader(req: Request, name: string) {
    const value = req.header(name);
    return typeof value === "string" ? value : "";
}

function safeEqualText(a: string, b: string) {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
}

export function getRequiredActorKey(req: Request) {
    const actorKey = getHeader(req, "x-actor-key");
    if (!actorKey) {
        throw new Error("Forbidden.");
    }
    return actorKey;
}

export const requireServiceAuth: RequestHandler = (req, res, next) => {
    const providedSecret = getHeader(req, "x-runner-secret");
    const actorKey = getHeader(req, "x-actor-key");

    if (!providedSecret || !safeEqualText(providedSecret, env.runnerSharedSecret)) {
        console.error("RUNNER auth reject: bad secret", {
            path: req.path,
            hasSecret: Boolean(providedSecret),
            hasActorKey: Boolean(actorKey),
        });

        return res.status(403).json({
            ok: false,
            error: "Forbidden.",
        });
    }

    if (!actorKey) {
        console.error("RUNNER auth reject: missing actor key", {
            path: req.path,
        });

        return res.status(403).json({
            ok: false,
            error: "Forbidden.",
        });
    }

    next();
};