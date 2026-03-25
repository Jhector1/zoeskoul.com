import type { Difficulty } from "@/lib/practice/types";

import type { PracticeGetContext, PracticeGetResult } from "../types";
import type { PracticePurposeDecision } from "../policies/purpose.policy";
import { buildActorOrWhere } from "../../shared/prismaFilters";
import { buildRunMeta } from "../policies/runMeta.policy";
import {
    computeAllowRevealEffective,
    getAssignmentDifficulty,
} from "../policies/session.policy";

function canRevealExpectedForStatusOnly(session: any): boolean {
    if (!session) return false;
    if (session.assignmentId) return Boolean(session.assignment?.allowReveal);
    return true;
}

function sanitizeExpectedForHistory(kind: string, raw: any) {
    const k = String(kind);

    if (k === "single_choice") {
        const optionId = raw?.optionId ?? raw?.correctOptionId ?? raw?.correct ?? raw;
        return optionId ? { kind: "single_choice", optionId: String(optionId) } : null;
    }

    if (k === "multi_choice") {
        const ids = raw?.optionIds ?? raw?.correctOptionIds ?? raw?.correct ?? raw;
        return Array.isArray(ids) && ids.length
            ? { kind: "multi_choice", optionIds: ids.map((x) => String(x)) }
            : null;
    }

    if (k === "drag_reorder") {
        const order = raw?.order ?? raw;
        return Array.isArray(order) && order.length
            ? { kind: "drag_reorder", order: order.map((x) => String(x)) }
            : null;
    }

    return null;
}

function pickExpectedPayload(kind: string, secretPayload: any) {
    const k = String(kind);
    if (k === "code_input") return null;

    const sp = secretPayload ?? null;
    if (!sp || typeof sp !== "object") return null;

    const safe = (sp as any).expectedAnswerPayload ?? null;
    if (safe != null) return sanitizeExpectedForHistory(k, safe);

    const legacy = (sp as any).expected ?? (sp as any).answer ?? (sp as any).correct ?? null;
    return sanitizeExpectedForHistory(k, legacy);
}

function pickExplanation(kind: string, secretPayload: any) {
    const k = String(kind);
    if (k === "code_input") return null;
    if (k !== "single_choice" && k !== "multi_choice" && k !== "drag_reorder") return null;

    const sp = secretPayload ?? null;
    if (!sp || typeof sp !== "object") return null;
    return (sp as any).explanation ?? (sp as any).rationale ?? null;
}

export async function getPracticeStatus(
    ctx: PracticeGetContext,
    decision: Extract<PracticePurposeDecision, { ok: true }>,
): Promise<PracticeGetResult> {
    const { prisma, actor, params, session } = ctx;

    if (!session) {
        return {
            kind: "json",
            status: 400,
            body: { message: "statusOnly requires sessionId." },
        };
    }

    const answeredCount = await prisma.practiceQuestionInstance.count({
        where: { sessionId: session.id, answeredAt: { not: null } },
    });

    const targetCount = Number(session.targetCount ?? 0);
    const pct = targetCount > 0 ? Math.min(1, answeredCount / targetCount) : 0;
    const complete =
        session.status === "completed" || (targetCount > 0 && answeredCount >= targetCount);

    const allowRevealEffective = computeAllowRevealEffective(session, params.allowReveal);
    const assignmentDiff = getAssignmentDifficulty(session);
    const diff: Difficulty = assignmentDiff ?? (session?.difficulty as any as Difficulty) ?? "easy";
    const run = buildRunMeta({ session, diff, allowRevealEffective });

    const actorOR = buildActorOrWhere(actor);
    const includeMissed = params.includeMissed === "true";
    const includeHistory = params.includeHistory === "true";
    const canRevealExpected = canRevealExpectedForStatusOnly(session);

    let missed: any[] = [];
    if (includeMissed) {
        const rows = await prisma.practiceQuestionInstance.findMany({
            where: {
                sessionId: session.id,
                answeredAt: { not: null },
            },
            orderBy: { answeredAt: "asc" },
            select: {
                id: true,
                answeredAt: true,
                createdAt: true,
                kind: true,
                title: true,
                prompt: true,
                publicPayload: true,
                secretPayload: true,
                topic: { select: { slug: true } },
                attempts: {
                    where: {
                        revealUsed: false,
                        ...(actorOR.length ? ({ OR: actorOR } as any) : {}),
                    },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: {
                        answerPayload: true,
                        ok: true,
                        createdAt: true,
                    },
                },
            },
        });

        missed = rows
            .map((row) => {
                const last = Array.isArray(row.attempts) ? row.attempts[0] : null;
                if (!last || last.ok) return null;

                const topicSlug = String(row?.topic?.slug ?? "all");
                const expected = canRevealExpected ? pickExpectedPayload(row.kind, row.secretPayload) : null;
                const explanation = canRevealExpected ? pickExplanation(row.kind, row.secretPayload) : null;

                return {
                    id: `${row.id}-missed`,
                    at: last?.createdAt
                        ? new Date(last.createdAt).getTime()
                        : row?.answeredAt
                            ? new Date(row.answeredAt).getTime()
                            : row?.createdAt
                                ? new Date(row.createdAt).getTime()
                                : 0,
                    topic: topicSlug,
                    kind: String(row?.kind ?? ""),
                    title: String(row?.title ?? ""),
                    prompt: String(row?.prompt ?? ""),
                    publicPayload: row.publicPayload ?? null,
                    userAnswer: last?.answerPayload ?? null,
                    expected,
                    explanation,
                };
            })
            .filter(Boolean) as any[];
    }

    let history: any[] = [];
    if (includeHistory) {
        const counts = await prisma.practiceAttempt.groupBy({
            by: ["instanceId"],
            where: {
                sessionId: session.id,
                revealUsed: false,
                ...(actorOR.length ? ({ OR: actorOR } as any) : {}),
            },
            _count: { _all: true },
        });

        const countMap = new Map(counts.map((c) => [c.instanceId, c._count._all]));

        const attemptRows = await prisma.practiceAttempt.findMany({
            where: {
                sessionId: session.id,
                ...(actorOR.length ? ({ OR: actorOR } as any) : {}),
            },
            orderBy: { createdAt: "desc" },
            select: {
                instanceId: true,
                ok: true,
                revealUsed: true,
                createdAt: true,
                answerPayload: true,
            },
        });

        const lastNonReveal = new Map<string, any>();
        const revealUsedAny = new Map<string, boolean>();

        for (const a of attemptRows) {
            if (a.revealUsed) {
                revealUsedAny.set(a.instanceId, true);
                continue;
            }
            if (!lastNonReveal.has(a.instanceId)) lastNonReveal.set(a.instanceId, a);
        }

        const instances = await prisma.practiceQuestionInstance.findMany({
            where: { sessionId: session.id, answeredAt: { not: null } },
            orderBy: { answeredAt: "asc" },
            select: {
                id: true,
                createdAt: true,
                answeredAt: true,
                kind: true,
                difficulty: true,
                title: true,
                prompt: true,
                publicPayload: true,
                secretPayload: true,
                topic: { select: { slug: true } },
            },
        });

        history = instances.map((row) => {
            const last = lastNonReveal.get(row.id) ?? null;
            const expectedAnswerPayload = canRevealExpected
                ? pickExpectedPayload(row.kind, row.secretPayload)
                : null;
            const explanation = canRevealExpected ? pickExplanation(row.kind, row.secretPayload) : null;

            return {
                instanceId: row.id,
                createdAt: row.createdAt,
                answeredAt: row.answeredAt,
                topic: row.topic?.slug ?? "all",
                kind: row.kind,
                difficulty: row.difficulty,
                title: row.title,
                prompt: row.prompt,
                publicPayload: row.publicPayload ?? null,
                attempts: countMap.get(row.id) ?? 0,
                lastOk: last ? Boolean(last.ok) : null,
                lastRevealUsed: Boolean(revealUsedAny.get(row.id) ?? false),
                lastAnswerPayload: last?.answerPayload ?? null,
                lastAttemptAt: last?.createdAt ?? null,
                expectedAnswerPayload,
                explanation,
            };
        });
    }

    return {
        kind: "json",
        status: 200,
        body: {
            complete,
            pct,
            status: session.status,
            answeredCount,
            targetCount,
            correctCount: session.correct ?? 0,
            totalCount: session.total ?? 0,
            correct: session.correct ?? 0,
            total: session.total ?? 0,
            assignmentId: session.assignmentId ?? null,
            sessionId: session.id,
            purpose: {
                effective: decision.effective,
                requested: decision.requested,
                allowed: decision.allowed,
                policy: decision.policy,
                source: decision.source,
                reason: decision.reason ?? null,
            },
            missed,
            history,
            run,
            returnUrl: run.returnUrl,
        },
    };
}
