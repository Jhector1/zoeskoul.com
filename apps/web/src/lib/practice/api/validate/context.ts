import type { PrismaClient } from "@/lib/prisma";
import { NextResponse } from "next/server";

import { attachGuestCookie } from "@/lib/practice/actor";
import { verifyPracticeKey } from "@/lib/practice/key";
import { getLocaleFromCookie } from "@/serverUtils";
import { resolvePracticeAccess } from "@/lib/practice/access/resolvePracticeAccess";

import type { ValidateBody } from "./schemas";
import type { PracticeValidatePrepResult } from "./types";
import { normalizeKey } from "./schemas";
import {
    resolveActorForPayload,
    isActorMismatch,
} from "./services/actorBinding.service";
import { loadValidateInstance } from "./repositories/instance.repo";
import { jsonApiResponse, safeSameOriginUrl } from "../shared/http";


function validateDebugEnabled() {
    return (
        process.env.NODE_ENV !== "production" &&
        process.env.ZOE_DEBUG_PRACTICE_VALIDATE === "1"
    );
}

function logValidate401(reason: string, extra: Record<string, any>) {
    if (!validateDebugEnabled()) return;

    console.warn("[practice-validate-401]", {
        reason,
        ...extra,
    });
}
export async function buildPracticeValidateContext(args: {
    prisma: PrismaClient;
    req: Request;
    requestId: string;
    body: ValidateBody;
}): Promise<PracticeValidatePrepResult> {
    const { prisma, req, requestId, body } = args;

    const key = normalizeKey(body.key);
    if (!key) {
        return {
            kind: "res",
            res: jsonApiResponse({
                requestId,
                message: "Missing key.",
                status: 400,
            }),
        };
    }

    const payload = verifyPracticeKey(key);
    if (!payload) {
        logValidate401("invalid_or_expired_key", {
            requestId,
            hasKey: Boolean(key),
            keyParts: typeof key === "string" ? key.split(".").length : 0,
            keyLength: typeof key === "string" ? key.length : 0,
        });
        return {
            kind: "res",
            res: jsonApiResponse({
                requestId,
                message: "Invalid or expired key.",
                status: 401,
            }),
        };
    }

    const { actor, setGuestId } = await resolveActorForPayload(payload);

    if (isActorMismatch(payload, actor)) {
        logValidate401("actor_mismatch", {
            requestId,
            payloadUserId: payload.userId ? "present" : null,
            payloadGuestId: payload.guestId ? "present" : null,
            actorUserId: actor.userId ? "present" : null,
            actorGuestId: actor.guestId ? "present" : null,
        });
        return {
            kind: "res",
            res: attachGuestCookie(
                jsonApiResponse({
                    requestId,
                    message: "Actor mismatch.",
                    status: 401,
                }),
                setGuestId ?? undefined,
            ) as NextResponse,
        };
    }

    const instance = await loadValidateInstance(prisma, String((payload as any).instanceId));
    if (!instance) {
        return {
            kind: "res",
            res: attachGuestCookie(
                jsonApiResponse({
                    requestId,
                    message: "Instance not found.",
                    status: 404,
                }),
                setGuestId ?? undefined,
            ) as NextResponse,
        };
    }

    const session = instance.session ?? null;
    const locale = await getLocaleFromCookie();

    const derivedModuleSlug =
        instance.topic?.module?.slug ?? null;

    const derivedSubjectSlug =
        instance.topic?.subject?.slug ??
        instance.topic?.module?.subject?.slug ??
        null;

    const access = await resolvePracticeAccess({
        prisma,
        actor,
        locale,
        req,
        params: {
            subject: session ? null : derivedSubjectSlug,
            module: session ? null : derivedModuleSlug,
            sessionId: session?.id ?? null,
            returnUrl: safeSameOriginUrl(req, session?.returnUrl ?? null),
            returnTo: null,
        },
        session: session
            ? {
                id: session.id,
                mode: session.mode ?? "standard",
            }
            : null,
    });

    if (!access.ok) {
        const res = attachGuestCookie(access.res as NextResponse, setGuestId ?? undefined);
        res.headers.set("X-Request-Id", requestId);
        return { kind: "res", res };
    }

    return {
        kind: "ok",
        ctx: {
            prisma,
            req,
            requestId,
            body,
            key,
            payload,
            actor,
            setGuestId,
            instance,
            session,
            locale,
        },
    };
}
