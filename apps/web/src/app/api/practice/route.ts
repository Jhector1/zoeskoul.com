import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { actorKeyOf, attachGuestCookie } from "@/lib/practice/actor";
import { rateLimit } from "@/lib/security/ratelimit";
import { getLocaleFromCookie } from "@/serverUtils";
import { resolvePracticeAccess } from "@/lib/practice/access/resolvePracticeAccess";

import { GetParamsSchema } from "@/lib/practice/api/get/schemas";
import { getActorWithGuest } from "@/lib/practice/api/get/services/actor.service";
import { buildPracticeGetContext } from "@/lib/practice/api/get/context";
import { handlePracticeGet } from "@/lib/practice/api/get/handler";
import {
    bodyJsonWithGuestCookie,
    getClientIp,
    hardenApiResponse,
    safeSameOriginUrl,
} from "@/lib/practice/api/shared/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    const requestId = crypto.randomUUID();

    const url = new URL(req.url);
    const rawParams = Object.fromEntries(url.searchParams.entries());
    const parsed = GetParamsSchema.safeParse(rawParams);

    if (!parsed.success) {
        const { setGuestId } = await getActorWithGuest();

        const res = bodyJsonWithGuestCookie(
            {
                message: "Invalid query params",
                issues: parsed.error.issues,
                requestId,
            },
            400,
            setGuestId,
        );

        res.headers.set("X-Request-Id", requestId);
        return res;
    }

    const params = parsed.data;

    const { actor, setGuestId } = await getActorWithGuest({
        createIfMissing: !Boolean(params.sessionId),
    });

    const ip = getClientIp(req);
    const rlKey = `practice:${actorKeyOf(actor)}:${ip}`;

    try {
        const rl = await rateLimit(rlKey);

        if (!rl.ok) {
            const res = bodyJsonWithGuestCookie(
                { message: "Too many requests", requestId },
                429,
                setGuestId,
            );

            const retryAfterSeconds = Math.max(1, Math.ceil((rl.resetMs - Date.now()) / 1000));
            res.headers.set("Retry-After", String(retryAfterSeconds));
            res.headers.set("X-RateLimit-Limit", String(rl.limit));
            res.headers.set("X-RateLimit-Remaining", String(rl.remaining));
            res.headers.set("X-RateLimit-Reset", String(rl.resetMs));
            res.headers.set("X-Request-Id", requestId);

            return res;
        }
    } catch (e) {
        console.error("[/api/practice] ratelimit error", { requestId, e });

        const res = bodyJsonWithGuestCookie(
            { message: "Service unavailable", requestId },
            503,
            setGuestId,
        );

        res.headers.set("X-Request-Id", requestId);
        return res;
    }

    const locale = await getLocaleFromCookie();

    const safeReturnUrl = safeSameOriginUrl(req, params.returnUrl ?? null);
    const safeReturnTo = safeSameOriginUrl(req, params.returnTo ?? null);

    const ctx = await buildPracticeGetContext({
        prisma,
        actor,
        params,
        locale,
        safeReturnUrl,
        safeReturnTo,
    });

    const access = await resolvePracticeAccess({
        prisma,
        actor,
        locale,
        req,
        params: {
            subject: ctx.params.subject ?? null,
            module: ctx.params.module ?? null,
            sessionId: ctx.params.sessionId ?? null,
            returnUrl: ctx.params.returnUrl ?? null,
            returnTo: ctx.params.returnTo ?? null,
        },
        session: ctx.session,
    });

    if (!access.ok) {
        const res = attachGuestCookie(access.res as NextResponse, setGuestId);
        res.headers.set("X-Request-Id", requestId);
        return hardenApiResponse(res as Response);
    }

    try {
        const out = await handlePracticeGet(ctx);

        const res =
            out.kind === "res"
                ? attachGuestCookie(out.res, setGuestId)
                : bodyJsonWithGuestCookie(out.body, out.status, setGuestId);

        res.headers.set("X-Request-Id", requestId);
        return hardenApiResponse(res as Response);
    } catch (err: any) {
        console.error("[/api/practice] ERROR", { requestId, err });

        const body =
            process.env.NODE_ENV === "development"
                ? {
                    message: "Practice API failed",
                    explanation: err?.message ?? String(err),
                    stack: err?.stack,
                    requestId,
                }
                : {
                    message: "Practice API failed",
                    requestId,
                };

        const res = bodyJsonWithGuestCookie(body, 500, setGuestId);
        res.headers.set("X-Request-Id", requestId);
        return res;
    }
}