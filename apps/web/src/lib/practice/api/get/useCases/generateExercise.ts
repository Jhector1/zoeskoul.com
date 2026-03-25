import { PracticeKind, PracticePurpose } from "@prisma/client";

import type { Difficulty, Exercise, GenKey, TopicSlug } from "@/lib/practice/types";
import type { TopicContext } from "@/lib/practice/generator/generatorTypes";
import { DIFFICULTIES, rngFromActor } from "@/lib/practice/catalog";
import { getExerciseWithExpected } from "@/lib/practice/generator";
import { loadPracticeTopicI18n } from "@/i18n/loadPracticeTopicI18n";

import type { PracticeGetContext, PracticeGetResult } from "../types";
import type { PracticePurposeDecision } from "../policies/purpose.policy";
import { toPracticeKindOrThrow } from "../../shared/prismaMappers";
import { resolveRequestSalt } from "../services/requestSalt.service";
import { createPracticeInstance } from "../repositories/instance.repo";
import { signKey } from "../mappers/key.mapper";
import { buildRunMeta } from "../policies/runMeta.policy";
import {
    computeAllowRevealEffective,
    getAssignmentDifficulty,
} from "../policies/session.policy";
import { resolveTopicFromScope } from "../services/topicResolver.service";

function isGeneratorTopicMismatch(e: any) {
    const code = String((e as any)?.code ?? "");
    if (
        code === "UNKNOWN_TOPIC" ||
        code === "MISSING_HANDLER" ||
        code === "EMPTY_POOL" ||
        code === "NO_QUESTIONS_AVAILABLE" ||
        code === "NO_GENERATOR"
    ) {
        return true;
    }

    const msg = String(e?.message ?? "");
    return (
        msg.includes("unknown topicSlug=") ||
        msg.includes("no generator registered for topicSlug=") ||
        msg.includes("missing handler key=") ||
        msg.includes("NO_QUESTIONS_AVAILABLE") ||
        msg.includes("EMPTY_POOL") ||
        msg.includes("empty_pool")
    );
}

export async function generatePracticeExercise(
    ctx: PracticeGetContext,
    decision: Extract<PracticePurposeDecision, { ok: true }>,
): Promise<PracticeGetResult> {
    const { prisma, actor, params, locale, session } = ctx;

    const {
        subject,
        module,
        topic,
        difficulty,
        section,
        allowReveal,
        preferKind,
        salt,
        exerciseKey,
        seedPolicy,
    } = params;

    const isTrial = session?.mode === "onboarding_trial";
    const allowRevealEffective = computeAllowRevealEffective(session, allowReveal);

    const assignmentDiff = getAssignmentDifficulty(session);
    const diff: Difficulty =
        assignmentDiff ??
        (session ? (session.difficulty as any as Difficulty) : null) ??
        (difficulty === "easy" || difficulty === "medium" || difficulty === "hard"
            ? difficulty
            : rngFromActor({
                userId: actor.userId,
                guestId: actor.guestId,
                sessionId: session?.id,
                salt: "diff-pick",
            }).pick(DIFFICULTIES));

    const { reqSalt } = resolveRequestSalt(salt);

    const purposeMode = decision.effective;
    const preferPurposeForGenerator: "quiz" | "project" | null =
        isTrial ? "quiz" : purposeMode === "mixed" ? null : purposeMode;

    const moduleIdFromSession = session?.section?.moduleId ?? null;
    const assignmentIdFromSession = session?.assignmentId ?? null;
    const excludedTopicSlugs = new Set<string>();

    const preferKindEnum: PracticeKind | null = preferKind
        ? toPracticeKindOrThrow(preferKind)
        : null;

    const effectiveSeedPolicy = seedPolicy === "global" ? "global" : "actor";
    const rngArgs =
        effectiveSeedPolicy === "global"
            ? { userId: null, guestId: null, sessionId: null }
            : {
                userId: actor.userId,
                guestId: actor.guestId,
                sessionId: session?.id ?? null,
            };

    let resolved: any = null;
    let out: any = null;
    let lastGenErr: any = null;

    for (let attempt = 0; attempt < 6; attempt++) {
        resolved = await resolveTopicFromScope({
            prisma,
            subjectSlug: session ? undefined : subject,
            moduleSlug: session ? undefined : module,
            sectionSlug: session?.section?.slug ?? section,
            rawTopic: attempt === 0 ? topic : null,
            subjectIdFromSession: session?.section?.subjectId ?? null,
            moduleIdFromSession,
            assignmentIdFromSession,
            rngSeedParts: {
                userId: actor.userId,
                guestId: actor.guestId,
                sessionId: session?.id ?? null,
            },
            topicPickSalt: `topic-pick|${reqSalt}`,
            fallbackOnMissing: true,
            excludeTopicSlugs: Array.from(excludedTopicSlugs),
        } as any);

        if (resolved.kind !== "ok") {
            return {
                kind: "json",
                status: 400,
                body: { message: "Invalid topic/filters", explanation: resolved.message },
            };
        }

        const topicSlug = resolved.topicSlug as TopicSlug;
        const genKey = resolved.genKey as GenKey | null;

        if (!genKey) {
            excludedTopicSlugs.add(String(topicSlug));
            lastGenErr = new Error(`Topic "${topicSlug}" has no genKey in DB.`);
            continue;
        }

        const exerciseRng = rngFromActor({
            ...rngArgs,
            salt: [
                "practice-ex",
                `seedPolicy=${effectiveSeedPolicy}`,
                `purposeMode=${purposeMode}`,
                `genKey=${genKey}`,
                `topic=${topicSlug}`,
                `diff=${diff}`,
                `preferKind=${preferKindEnum ?? ""}`,
                `preferPurpose=${preferPurposeForGenerator ?? ""}`,
                `exerciseKey=${exerciseKey ?? ""}`,
                `salt=${reqSalt ?? ""}`,
            ].join("|"),
        });

        const practiceI18n = await loadPracticeTopicI18n({
            locale: locale ?? "en",
            subjectSlug: subject ?? session?.section?.subject?.slug ?? null,
            moduleSlug: module ?? session?.section?.module?.slug ?? null,
            topicSlug,
        });

        const meta2 = {
            ...(resolved.meta ?? {}),
            i18n: {
                ...((resolved.meta as any)?.i18n ?? {}),
                ...(practiceI18n ?? {}),
                common: {
                    ...(((resolved.meta as any)?.i18n?.common) ?? {}),
                    ...((practiceI18n as any)?.common ?? {}),
                },
                quiz: {
                    ...(((resolved.meta as any)?.i18n?.quiz) ?? {}),
                    ...((practiceI18n as any)?.quiz ?? {}),
                },
            },
            forceKey: exerciseKey ?? undefined,
            preferPurpose: preferPurposeForGenerator,
        };

        try {
            out = await getExerciseWithExpected(genKey as GenKey, diff, {
                topicSlug,
                variant: resolved.variant ?? null,
                meta: meta2,
                subjectSlug: subject ?? null,
                moduleSlug: module ?? null,
                preferKind: preferKindEnum ?? null,
                preferPurpose: preferPurposeForGenerator,
                rng: exerciseRng as any,
                salt: reqSalt ?? null,
                exerciseKey: (exerciseKey ?? null) as any,
            } as TopicContext);

            lastGenErr = null;
            break;
        } catch (e: any) {
            lastGenErr = e;
            if (isGeneratorTopicMismatch(e)) {
                excludedTopicSlugs.add(String(topicSlug));
                continue;
            }
            break;
        }
    }

    if (!resolved || resolved.kind !== "ok" || !out) {
        return {
            kind: "json",
            status: 404,
            body: {
                message: `No ${purposeMode} questions available for this scope yet.`,
                explanation: lastGenErr?.message ?? "All eligible topics were filtered out.",
                meta: {
                    purposeMode,
                    preferKind: preferKindEnum ?? null,
                    excludedTopicSlugs: Array.from(excludedTopicSlugs),
                    lastTopicTried: resolved?.kind === "ok" ? resolved.topicSlug : null,
                },
            },
        };
    }

    const topicSlug = resolved.topicSlug as TopicSlug;
    const topicIdHint = resolved.topicId as string;
    const genKey = resolved.genKey as GenKey;

    const ex0 = out?.exercise;
    const kind0 = ex0?.kind;

    if (!ex0 || typeof kind0 !== "string" || !kind0.trim()) {
        return {
            kind: "json",
            status: 500,
            body: {
                message: "Generator returned invalid exercise",
                explanation: `Missing/invalid kind. genKey="${genKey}" topic="${topicSlug}" variant="${resolved.variant ?? "null"}"`,
                got: { exercise: ex0 },
            },
        };
    }

    const exercise = { ...(ex0 as any), topic: topicSlug } as Exercise;

    const chosenPurpose: "quiz" | "project" =
        (out as any)?.meta?.purpose === "project" ? "project" : "quiz";

    const persistedPurpose: "quiz" | "project" =
        isTrial
            ? "quiz"
            : purposeMode === "mixed"
                ? chosenPurpose
                : purposeMode === "project"
                    ? "project"
                    : "quiz";

    const instance = await createPracticeInstance({
        prisma,
        sessionId: session?.id ?? null,
        exercise,
        expected: out?.expected,
        topicSlug,
        difficulty: diff,
        topicIdHint,
        purpose: persistedPurpose,
    });

    const key = signKey({
        instanceId: instance.id,
        sessionId: instance.sessionId ?? null,
        userId: actor.userId ?? null,
        guestId: actor.guestId ?? null,
        allowReveal: allowRevealEffective,
    });

    const run = buildRunMeta({ session, diff, allowRevealEffective });

    return {
        kind: "json",
        status: 200,
        body: {
            exercise,
            key,
            sessionId: session?.id ?? null,
            run,
            meta: {
                genKey,
                topic: topicSlug,
                variant: resolved.variant ?? null,
                allowReveal: allowRevealEffective,
                salt: reqSalt ?? null,
                purposeMode,
                preferPurposeForGenerator,
                chosenPurpose,
                excludedTopicSlugs: Array.from(excludedTopicSlugs),
                purpose: {
                    effective: decision.effective,
                    requested: decision.requested,
                    allowed: decision.allowed,
                    policy: decision.policy,
                    source: decision.source,
                    reason: decision.reason ?? null,
                },
            },
        },
    };
}