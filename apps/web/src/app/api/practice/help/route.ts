import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { attachGuestCookie, ensureGuestId, getActor } from "@/lib/practice/actor";
import { verifyPracticeKey } from "@/lib/practice/key";
import { requireEntitledUser } from "@/lib/billing/requireEntitledUser";
import { explainPracticeConcept } from "@/lib/ai/explainPractice";
import { rateLimit } from "@/lib/security/ratelimit";
import {
    getClientIp,
    hardenApiResponse,
} from "@/lib/practice/api/shared/http";
import { getExpectedCanon } from "@/lib/practice/api/validate/mappers/expected.mapper";
import { buildRevealForInstance } from "@/lib/practice/api/help/reveal/buildRevealForInstance";
import {
    canOpenHelpStep,
    getPracticeHelpStepDef,
    getPracticeHelpStepIndex,
    isRevealStepKey,
    resolveEffectivePracticeHelpPolicy,
} from "@/lib/practice/help/steps";
import { assertSessionOwnerMatchesActor } from "@/lib/practice/api/shared/sessionAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
    key: z.any(),
    stepKey: z.string().min(1),
    userAnswer: z.any().optional(),
});

function normalizeKey(input: unknown): string | null {
    if (typeof input === "string") return input;
    if (input && typeof input === "object") {
        const anyValue = input as any;
        if (typeof anyValue.token === "string") return anyValue.token;
        if (typeof anyValue.key === "string") return anyValue.key;
        if (typeof anyValue.value === "string") return anyValue.value;
    }
    return null;
}

function getAuthoredHelpContent(publicPayload: any, stepKey: string): string | null {
    const help = publicPayload?.help ?? null;

    if (help && typeof help === "object" && typeof help[stepKey] === "string") {
        const text = String(help[stepKey]).trim();
        if (text) return text;
    }

    const helpSteps = Array.isArray(help?.steps) ? help.steps : [];
    const found = helpSteps.find((step: any) => String(step?.key ?? "") === stepKey);

    if (typeof found?.content === "string" && found.content.trim()) {
        return found.content;
    }

    if (
        stepKey === "hint_1" &&
        typeof publicPayload?.hint === "string" &&
        publicPayload.hint.trim()
    ) {
        return publicPayload.hint;
    }

    return null;
}

export async function POST(req: Request) {
    const requestId = crypto.randomUUID();

    const parsedBody = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) {
        const res = NextResponse.json(
            {
                message: "Invalid request body.",
                issues: parsedBody.error.issues,
                requestId,
            },
            { status: 400 },
        );
        res.headers.set("X-Request-Id", requestId);
        return hardenApiResponse(res);
    }

    const key = normalizeKey(parsedBody.data.key);
    if (!key) {
        const res = NextResponse.json(
            { message: "Missing key.", requestId },
            { status: 400 },
        );
        res.headers.set("X-Request-Id", requestId);
        return hardenApiResponse(res);
    }

    const stepKey = parsedBody.data.stepKey;
    const stepDef = getPracticeHelpStepDef(stepKey);
    if (!stepDef) {
        const res = NextResponse.json(
            { message: "Unknown help step.", requestId },
            { status: 400 },
        );
        res.headers.set("X-Request-Id", requestId);
        return hardenApiResponse(res);
    }

    const actor0 = await getActor();
    const payload = verifyPracticeKey(key);

    if (!payload) {
        const res = NextResponse.json(
            { message: "Invalid or expired key.", requestId },
            { status: 401 },
        );
        res.headers.set("X-Request-Id", requestId);
        return hardenApiResponse(res);
    }

    let actor = actor0;
    let setGuestId: string | null = null;

    if (!actor0.userId && !actor0.guestId && (payload as any).guestId) {
        actor = { ...actor0, guestId: (payload as any).guestId };
        setGuestId = (payload as any).guestId;
    } else {
        const ensured = ensureGuestId(actor0);
        actor = ensured.actor;
        setGuestId = ensured.setGuestId ?? null;
    }

    if (
        ((payload as any).userId && (payload as any).userId !== (actor.userId ?? null)) ||
        ((payload as any).guestId && (payload as any).guestId !== (actor.guestId ?? null))
    ) {
        const res = NextResponse.json(
            { message: "Actor mismatch.", requestId },
            { status: 401 },
        );
        res.headers.set("X-Request-Id", requestId);
        return attachGuestCookie(hardenApiResponse(res), setGuestId);
    }

    const ip = getClientIp(req);
    const rl = await rateLimit(`practice-help:${ip}:${(payload as any).instanceId}`).catch(
        () => null,
    );

    if (rl && !rl.ok) {
        const res = NextResponse.json(
            { message: "Too many requests.", requestId },
            { status: 429 },
        );
        res.headers.set("X-Request-Id", requestId);
        return attachGuestCookie(hardenApiResponse(res), setGuestId);
    }

    const instance = await prisma.practiceQuestionInstance.findUnique({
        where: { id: (payload as any).instanceId },
        include: {
            topic: { select: { slug: true } },
            session: {
                include: {
                    assignment: {
                        select: {
                            allowReveal: true,
                            helpPolicy: true,
                            showDebug: true,
                        },
                    },
                    preset: {
                        select: {
                            allowReveal: true,
                            helpPolicy: true,
                        },
                    },
                },
            },
        },
    });

    if (!instance) {
        const res = NextResponse.json(
            { message: "Instance not found.", requestId },
            { status: 404 },
        );
        res.headers.set("X-Request-Id", requestId);
        return attachGuestCookie(hardenApiResponse(res), setGuestId);
    }

    const session = instance.session;

    try {
        assertSessionOwnerMatchesActor(session, actor);
    } catch (e: any) {
        const res = NextResponse.json(
            {
                message: e?.message ?? "Forbidden.",
                code: e?.code ?? "SESSION_OWNER_MISMATCH",
                requestId,
            },
            { status: Number(e?.status) || 403 },
        );
        res.headers.set("X-Request-Id", requestId);
        return attachGuestCookie(hardenApiResponse(res), setGuestId);
    }

    if (session?.assignmentId) {
        const gate = await requireEntitledUser();
        if (!gate.ok) return gate.res;

        if (session.userId && session.userId !== gate.userId) {
            const res = NextResponse.json(
                { message: "Forbidden.", requestId },
                { status: 403 },
            );
            res.headers.set("X-Request-Id", requestId);
            return attachGuestCookie(hardenApiResponse(res), setGuestId);
        }
    }

    const helpPolicy = resolveEffectivePracticeHelpPolicy({
        isAssignment: Boolean(session?.assignmentId),
        payloadAllowReveal: Boolean((payload as any).allowReveal),
        assignmentAllowReveal: Boolean(session?.assignment?.allowReveal),
        sessionHelpPolicy: session?.helpPolicy ?? null,
        assignmentHelpPolicy: session?.assignment?.helpPolicy ?? null,
        presetHelpPolicy: session?.preset?.helpPolicy ?? null,
        presetAllowReveal: session?.preset?.allowReveal ?? true,
    });

    if (!canOpenHelpStep(helpPolicy, stepKey)) {
        const res = NextResponse.json(
            { message: "This help step is disabled.", requestId },
            { status: 403 },
        );
        res.headers.set("X-Request-Id", requestId);
        return attachGuestCookie(hardenApiResponse(res), setGuestId);
    }

    let source: "authored" | "ai" | "system" = "authored";
    let content: string | null = null;
    let reveal: any | null = null;

    if (isRevealStepKey(stepKey)) {
        source = "system";

        const expectedCanon = getExpectedCanon(instance as any);
        if (!expectedCanon) {
            const res = NextResponse.json(
                {
                    message: "Server bug: missing secretPayload.expected.",
                    requestId,
                },
                { status: 500 },
            );
            res.headers.set("X-Request-Id", requestId);
            return attachGuestCookie(hardenApiResponse(res), setGuestId);
        }

        const built = await buildRevealForInstance({
            instance: instance as any,
            expectedCanon,
            showDebug: Boolean(session?.assignment?.showDebug),
        });

        reveal = built.revealAnswer;
        content = built.explanation ?? null;
    } else {
        content = getAuthoredHelpContent(instance.publicPayload, stepKey);

        if (!content) {
            source = "ai";
            content = await explainPracticeConcept({
                mode: stepDef.aiMode ?? "hint",
                title: instance.title,
                prompt: instance.prompt,
                kind: instance.kind,
                topicSlug: instance.topic?.slug ?? "unknown",
                userAnswer: parsedBody.data.userAnswer ?? null,
            });
        }
    }

    await prisma.practiceHelpEvent.create({
        data: {
            sessionId: session?.id ?? null,
            instanceId: instance.id,
            userId: actor.userId ?? null,
            guestId: actor.guestId ?? null,
            stepKey,
            stepIndex: getPracticeHelpStepIndex(stepKey),
            kind: stepDef.kind,
            source,
            content: { text: content, reveal },
        },
    });

    const res = NextResponse.json({
        requestId,
        stepKey,
        step: {
            key: stepDef.key,
            label: stepDef.label,
            kind: stepDef.kind,
        },
        source,
        content,
        reveal,
    });

    res.headers.set("X-Request-Id", requestId);
    return attachGuestCookie(hardenApiResponse(res), setGuestId);
}