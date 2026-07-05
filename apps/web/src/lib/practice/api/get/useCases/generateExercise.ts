import { PracticeKind, PracticePurpose } from "@zoeskoul/db";

import type { Difficulty, Exercise, GenKey, TopicSlug } from "@/lib/practice/types";
import type { TopicContext } from "@/lib/practice/generator/generatorTypes";
import { DIFFICULTIES, rngFromActor } from "@/lib/practice/catalog";
import { getExerciseWithExpected } from "@/lib/practice/generator";
import { buildExerciseFromManifest } from "@/lib/practice/generator/engines/json/buildExerciseFromManifest";
import { loadPracticeTopicI18n } from "@/i18n/loadPracticeTopicI18n";
import { resolveManifestExercise } from "@/lib/curriculum/resolveManifestExercise";
import { resolveTopicBundleManifest } from "@/lib/curriculum/resolveTopicBundleManifest";
import type { SlimTopicManifest } from "@/lib/subjects/_core/subjectManifestTypes";
import type { ManifestExercise } from "@/lib/subjects/_core/manifestTypes";

import type { PracticeGetContext, PracticeGetResult } from "../types";
import type { PracticePurposeDecision } from "../policies/purpose.policy";
import { toPracticeKindOrThrow } from "../../shared/prismaMappers";
import { resolveRequestSalt } from "../services/requestSalt.service";
import { createPracticeInstance } from "../repositories/instance.repo";
import { signKey } from "../mappers/key.mapper";
import { buildRunMetaWithChallengeAttempts } from "../policies/runMeta.policy";
import {
    computeAllowRevealEffective,
    getAssignmentDifficulty,
} from "../policies/session.policy";
import { resolveTopicFromScope } from "../services/topicResolver.service";
import { toDbTopicSlug } from "@/lib/practice/topicSlugs";
import { readSharedChallengeMeta } from "@/lib/practice/challenges/session";

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

function resolveAuthoredProjectExercise(args: {
    subjectSlug: string;
    topicSlug: string;
    topicId: string;
    exerciseKey: string;
    diff: Difficulty;
}) {
    const manifestTopicRef = args.topicSlug || args.topicId;
    const topicBundle = resolveTopicBundleManifest({
        subjectSlug: args.subjectSlug,
        topicSlugOrId: manifestTopicRef,
    });

    if (!topicBundle) {
        throw new Error(
            `Missing compiled topic bundle for topic "${manifestTopicRef}" in subject "${args.subjectSlug}".`,
        );
    }

    const manifestExercise = resolveManifestExercise({
        topicBundle,
        exerciseKey: args.exerciseKey,
    }) as ManifestExercise;

    const built = buildExerciseFromManifest(
        manifestExercise,
        {
            rng: rngFromActor({
                userId: null,
                guestId: null,
                sessionId: null,
                salt: `authored-project|${args.subjectSlug}|${args.topicSlug}|${args.exerciseKey}|${args.diff}`,
            }) as any,
            diff: args.diff,
            id: args.exerciseKey,
            topic: args.topicSlug,
            ctx: {
                topicSlug: args.topicSlug,
                exerciseKey: args.exerciseKey,
            } as TopicContext,
        },
        {
            serviceDefaults: (topicBundle as SlimTopicManifest).serviceDefaults ?? null,
            runtimeDefaults: topicBundle.runtimeDefaults ?? null,
        },
    );

    return {
        exercise: {
            ...(built.exercise as any),
            topic: args.topicSlug,
            exerciseKey: args.exerciseKey,
        } as Exercise,
        expected: built.expected,
        topicBundle,
    };
}


function readVariantFromAuthoredTopicMeta(meta: unknown) {
    const v = (meta as any)?.variant;
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

function authoredTopicLookupSlugs(rawTopic: string) {
    const primary = String(toDbTopicSlug(String(rawTopic ?? ""))).trim();
    const suffix = primary.includes(".")
        ? primary.split(".").filter(Boolean).at(-1) ?? ""
        : "";

    return Array.from(new Set([primary, suffix].filter(Boolean)));
}

// D_SQL_AUTHORED_MANIFEST_TOPIC_SELF_HEAL
type AuthoredFallbackTopicRow = {
    id: string;
    slug: string;
    genKey: string | null;
    meta: unknown;
};

function lastAuthoredTopicSegment(value: unknown) {
    const parts = String(value ?? "")
        .split(".")
        .map((part) => part.trim())
        .filter(Boolean);
    return parts.length ? parts[parts.length - 1] : String(value ?? "").trim();
}

function authoredTopicRowToResolved(args: {
    row: AuthoredFallbackTopicRow;
    requestedTopic: string;
    reason: string;
}) {
    return {
        kind: "ok" as const,
        topicId: args.row.id,
        topicSlug: args.row.slug as TopicSlug,
        genKey: args.row.genKey ? String(args.row.genKey) : null,
        variant: readVariantFromAuthoredTopicMeta(args.row.meta),
        meta: args.row.meta ?? null,
        requestedTopic: args.requestedTopic,
        topicFallbackUsed: true,
        topicFallbackReason: args.reason,
    };
}

async function findAuthoredFallbackTopicRow(
    prisma: PracticeGetContext["prisma"],
    candidateSlugs: string[],
): Promise<AuthoredFallbackTopicRow | null> {
    for (const slug of candidateSlugs) {
        const row = await prisma.practiceTopic.findUnique({
            where: { slug },
            select: {
                id: true,
                slug: true,
                genKey: true,
                meta: true,
            },
        });

        if (row) return row;
    }

    return null;
}

async function ensureAuthoredManifestPracticeTopicRow(args: {
    prisma: PracticeGetContext["prisma"];
    subjectSlug: string;
    rawTopic: string;
    topicBundle: SlimTopicManifest;
    originalMessage: string;
}): Promise<AuthoredFallbackTopicRow | null> {
    const topicId =
        String((args.topicBundle as any)?.topicId ?? "").trim() ||
        lastAuthoredTopicSegment(args.rawTopic);

    if (!topicId) return null;

    const candidateSlugs = Array.from(
        new Set([...authoredTopicLookupSlugs(args.rawTopic), topicId].filter(Boolean)),
    );

    const existing = await findAuthoredFallbackTopicRow(args.prisma, candidateSlugs);
    if (existing) return existing;

    const subjectSlug = String(args.subjectSlug ?? "").trim();
    const moduleSlug = String((args.topicBundle as any)?.moduleSlug ?? "").trim();
    const sectionSlug = String((args.topicBundle as any)?.sectionSlug ?? "").trim();

    const [subjectRow, moduleRow] = await Promise.all([
        subjectSlug
            ? args.prisma.practiceSubject.findUnique({
                where: { slug: subjectSlug },
                select: { id: true },
            })
            : Promise.resolve(null),
        moduleSlug
            ? args.prisma.practiceModule.findUnique({
                where: { slug: moduleSlug },
                select: { id: true },
            })
            : Promise.resolve(null),
    ]);

    const topicMeta =
        (args.topicBundle as any)?.topic && typeof (args.topicBundle as any).topic === "object"
            ? ((args.topicBundle as any).topic as Record<string, unknown>)
            : {};

    const titleKey =
        typeof topicMeta.labelKey === "string" && topicMeta.labelKey.trim()
            ? topicMeta.labelKey.trim()
            : `topics.${subjectSlug || "subject"}.${moduleSlug || "module"}.${topicId}.label`;

    const data: Record<string, unknown> = {
        slug: topicId,
        titleKey,
        description: null,
        order: 0,
        genKey: null,
        meta: {
            ...topicMeta,
            source: "manifest-authored-topic-self-heal",
            subjectSlug: subjectSlug || null,
            moduleSlug: moduleSlug || null,
            sectionSlug: sectionSlug || null,
            topicId,
            requestedTopic: args.rawTopic,
            reason: args.originalMessage,
        },
    };

    if (subjectRow?.id) data.subjectId = subjectRow.id;
    if (moduleRow?.id) data.moduleId = moduleRow.id;

    try {
        const created = await args.prisma.practiceTopic.create({
            data: data as any,
            select: {
                id: true,
                slug: true,
                genKey: true,
                meta: true,
            },
        });

        return created;
    } catch {
        return findAuthoredFallbackTopicRow(args.prisma, candidateSlugs);
    }
}

async function resolveAuthoredTopicFromManifestFallback(args: {
    prisma: PracticeGetContext["prisma"];
    subjectSlug: string;
    rawTopic: string;
    exerciseKey: string;
    originalMessage: string;
}) {
    const topicBundle = resolveTopicBundleManifest({
        subjectSlug: args.subjectSlug,
        topicSlugOrId: args.rawTopic,
    });

    if (!topicBundle) return null;

    try {
        resolveManifestExercise({
            topicBundle,
            exerciseKey: args.exerciseKey,
        });
    } catch {
        return null;
    }

    const candidateSlugs = authoredTopicLookupSlugs(args.rawTopic);

    const existingRow = await findAuthoredFallbackTopicRow(args.prisma, candidateSlugs);
    if (existingRow) {
        return authoredTopicRowToResolved({
            row: existingRow,
            requestedTopic: args.rawTopic,
            reason: `manifest_authored_topic_scope_bypass: ${args.originalMessage}`,
        });
    }

    const ensuredRow = await ensureAuthoredManifestPracticeTopicRow({
        prisma: args.prisma,
        subjectSlug: args.subjectSlug,
        rawTopic: args.rawTopic,
        topicBundle,
        originalMessage: args.originalMessage,
    });

    if (ensuredRow) {
        return authoredTopicRowToResolved({
            row: ensuredRow,
            requestedTopic: args.rawTopic,
            reason: `manifest_authored_topic_db_self_healed: ${args.originalMessage}`,
        });
    }

    return null;
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

    const isOnboardingTrial = session?.mode === "onboarding_trial";
    const isDailyPractice = session?.mode === "daily_five";
    const sharedChallenge = readSharedChallengeMeta(session?.meta ?? null);
    const isSharedChallenge = Boolean(sharedChallenge);
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

    // Persisted sessions must resume their current unanswered instance instead
    // of silently creating a second question on refresh or React retry. This is
    // especially important for public challenges and daily-practice uniqueness.
    if (session?.id) {
        const openInstance = await prisma.practiceQuestionInstance.findFirst({
            where: {
                sessionId: session.id,
                answeredAt: null,
            },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                sessionId: true,
                publicPayload: true,
            },
        });

        if (openInstance) {
            const key = signKey({
                instanceId: openInstance.id,
                sessionId: openInstance.sessionId ?? null,
                userId: actor.userId ?? null,
                guestId: actor.guestId ?? null,
                allowReveal: allowRevealEffective,
            });
            const run = await buildRunMetaWithChallengeAttempts({
                prisma,
                actor,
                session,
                diff,
                allowRevealEffective,
            });

            return {
                kind: "json",
                status: 200,
                body: {
                    exercise: openInstance.publicPayload as any,
                    key,
                    sessionId: session.id,
                    run,
                    meta: { resumedOpenInstance: true },
                },
            };
        }
    }

    const purposeMode = decision.effective;
    const preferPurposeForGenerator: "quiz" | "project" | null =
        isOnboardingTrial && !isSharedChallenge
            ? "quiz"
            : purposeMode === "mixed"
                ? null
                : purposeMode;
    const effectiveSubjectSlug =
        subject ??
        session?.section?.subject?.slug ??
        null;

    const moduleIdFromSession = session?.section?.moduleId ?? null;
    const assignmentIdFromSession = session?.assignmentId ?? null;
    // Daily practice stores one anchor section on the session, but its queue may
    // intentionally contain exercises from other sections in the same module.
    // The queued section is server-authored in applyDailyFiveParams, so it is
    // safe—and necessary—to use it instead of the anchor section here.
    const effectiveSectionSlug = isDailyPractice
        ? section
        : session?.section?.slug ?? section;
    const excludedTopicSlugs = new Set<string>();

    const hasRequestedTopic = Boolean(topic && topic !== "all");
    const hasRequestedExerciseKey = Boolean(exerciseKey);
    const requiresExactTopicAndExercise =
        hasRequestedTopic || hasRequestedExerciseKey;
    const maxTopicResolveAttempts = requiresExactTopicAndExercise ? 1 : 6;

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

    const canResolveExactAuthoredProjectExercise =
        (!isOnboardingTrial || isSharedChallenge) &&
        purposeMode === "project" &&
        hasRequestedTopic &&
        hasRequestedExerciseKey &&
        Boolean(effectiveSubjectSlug);

    if (canResolveExactAuthoredProjectExercise) {
        let authoredResolved = await resolveTopicFromScope({
            prisma,
            subjectSlug: session ? undefined : subject,
            moduleSlug: session ? undefined : module,
            sectionSlug: effectiveSectionSlug,
            rawTopic: topic,
            subjectIdFromSession: session?.section?.subjectId ?? null,
            moduleIdFromSession,
            assignmentIdFromSession,
            rngSeedParts: {
                userId: actor.userId,
                guestId: actor.guestId,
                sessionId: session?.id ?? null,
            },
            topicPickSalt: `topic-pick|${reqSalt}`,
            fallbackOnMissing: false,
            excludeTopicSlugs: [],
        } as any);

        if (authoredResolved.kind !== "ok") {
            const manifestFallback = await resolveAuthoredTopicFromManifestFallback({
                prisma,
                subjectSlug: String(effectiveSubjectSlug),
                rawTopic: String(topic),
                exerciseKey: String(exerciseKey),
                originalMessage: authoredResolved.message,
            });

            if (!manifestFallback) {
                return {
                    kind: "json",
                    status: 400,
                    body: {
                        message: "Invalid topic/filters",
                        explanation: authoredResolved.message,
                    },
                };
            }

            authoredResolved = manifestFallback;
        }

        const authored = resolveAuthoredProjectExercise({
            subjectSlug: String(effectiveSubjectSlug),
            topicSlug: String(authoredResolved.topicSlug),
            topicId: String(authoredResolved.topicId),
            exerciseKey: String(exerciseKey),
            diff,
        });

        const instance = await createPracticeInstance({
            prisma,
            sessionId: session?.id ?? null,
            sessionMode: session?.mode ?? null,
            exercise: authored.exercise,
            expected: authored.expected,
            topicSlug: authoredResolved.topicSlug as TopicSlug,
            difficulty: diff,
            topicIdHint: authoredResolved.topicId as string,
            purpose: "project",
        });

        const key = signKey({
            instanceId: instance.id,
            sessionId: instance.sessionId ?? null,
            userId: actor.userId ?? null,
            guestId: actor.guestId ?? null,
            allowReveal: allowRevealEffective,
        });

        const run = await buildRunMetaWithChallengeAttempts({ prisma, actor, session, diff, allowRevealEffective });

        return {
            kind: "json",
            status: 200,
            body: {
                exercise: authored.exercise,
                key,
                sessionId: session?.id ?? null,
                run,
                meta: {
                    genKey: authoredResolved.genKey as GenKey | null,
                    topic: authoredResolved.topicSlug as TopicSlug,
                    variant: authoredResolved.variant ?? null,
                    allowReveal: allowRevealEffective,
                    salt: reqSalt ?? null,
                    purposeMode,
                    preferPurposeForGenerator,
                    chosenPurpose: "project",
                    authored: true,
                    source: "topic-bundle",
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

    let resolved: any = null;
    let out: any = null;
    let lastGenErr: any = null;

    for (let attempt = 0; attempt < maxTopicResolveAttempts; attempt++) {
        resolved = await resolveTopicFromScope({
            prisma,
            subjectSlug: session ? undefined : subject,
            moduleSlug: session ? undefined : module,
            sectionSlug: effectiveSectionSlug,
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
            // A project/review step that asks for a specific topic or exerciseKey
            // must never silently fall back to another topic. Silent fallback is
            // how the UI can show an old prompt such as rectangle_area while the
            // Tools pane is bound to the correct imports workspace.
            fallbackOnMissing: !requiresExactTopicAndExercise,
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

            // If the caller requested an exact topic/exercise, do not recover by
            // trying a different topic. A wrong exercise is worse than an explicit
            // error because it corrupts the learner-facing card while the tool
            // pane may still bind to the requested workspace.
            if (requiresExactTopicAndExercise) {
                break;
            }

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
        isOnboardingTrial && !isSharedChallenge
            ? "quiz"
            : purposeMode === "mixed"
                ? chosenPurpose
                : purposeMode === "project"
                    ? "project"
                    : "quiz";

    const instance = await createPracticeInstance({
        prisma,
        sessionId: session?.id ?? null,
        sessionMode: session?.mode ?? null,
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

    const run = await buildRunMetaWithChallengeAttempts({ prisma, actor, session, diff, allowRevealEffective });

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
