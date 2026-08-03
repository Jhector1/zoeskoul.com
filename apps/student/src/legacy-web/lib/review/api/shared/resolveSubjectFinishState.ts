import { prisma } from "@/lib/prisma";
import {Actor, actorKeyOf} from "@/lib/practice/actor";
import { MODULES, SUBJECTS } from "@/lib/subjects";

type ActorLike = {
    userId?: string | null;
    guestId?: string | null;
};

type RegistrySubjectLike = {
    slug: string;
    meta?: Record<string, unknown> | null;
};

type RegistryModuleLike = {
    slug: string;
    subjectSlug: string;
    order: number;
};

type CurriculumState = "growing" | "complete";

type AuthoredSubjectMeta = {
    curriculum?: {
        plannedModuleCount?: number;
        isTerminalRelease?: boolean;
        moreComingMessage?: string;
        moreComingMessageKey?: string;
    };
    completionPolicy?: {
        requireAllPublishedModules?: boolean;
        rewardEnabledByDefault?: boolean;
        certificateEnabledByDefault?: boolean;
    };
};

type RuntimeSubjectMeta = {
    curriculumState?: CurriculumState;
    publishedModuleCount?: number;
    rewardEnabled?: boolean;
    certificateEnabled?: boolean;
};

export type ResolvedSubjectFinishState = {
    subjectSlug: string;
    currentModuleSlug: string | null;

    curriculumState: CurriculumState;
    curriculumComplete: boolean;

    publishedModuleCount: number;
    plannedModuleCount: number | null;

    lastPublishedModuleSlug: string | null;
    atEndOfPublishedTrack: boolean;

    completedPublishedModuleCount: number;
    remainingPublishedModuleCount: number;

    rewardEnabled: boolean;
    certificateEnabled: boolean;

    rewardEligible: boolean;
    certificateEligible: boolean;
    certificateIssued: boolean;

    status:
        | "in_progress"
        | "more_coming"
        | "reward_ready"
        | "certificate_ready"
        | "certificate_issued";

    message: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
    return typeof value === "boolean" ? value : null;
}

function asString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value : null;
}

function parseAuthoredMeta(raw: unknown): AuthoredSubjectMeta {
    const obj = asRecord(raw);
    if (!obj) return {};

    const curriculum = asRecord(obj.curriculum);
    const completionPolicy = asRecord(obj.completionPolicy);

    return {
        curriculum: curriculum
            ? {
                plannedModuleCount:
                    asNumber(curriculum.plannedModuleCount) ?? undefined,
                isTerminalRelease:
                    asBoolean(curriculum.isTerminalRelease) ?? undefined,
                moreComingMessage:
                    asString(curriculum.moreComingMessage) ??
                    asString(curriculum.moreComingMessageKey) ??
                    undefined,
            }
            : undefined,
        completionPolicy: completionPolicy
            ? {
                requireAllPublishedModules:
                    asBoolean(completionPolicy.requireAllPublishedModules) ?? undefined,
                rewardEnabledByDefault:
                    asBoolean(completionPolicy.rewardEnabledByDefault) ?? undefined,
                certificateEnabledByDefault:
                    asBoolean(completionPolicy.certificateEnabledByDefault) ?? undefined,
            }
            : undefined,
    };
}

function parseRuntimeMeta(raw: unknown): RuntimeSubjectMeta {
    const obj = asRecord(raw);
    if (!obj) return {};

    return {
        curriculumState:
            asString(obj.curriculumState) === "complete" ? "complete" : "growing",
        publishedModuleCount: asNumber(obj.publishedModuleCount) ?? undefined,
        rewardEnabled: asBoolean(obj.rewardEnabled) ?? undefined,
        certificateEnabled: asBoolean(obj.certificateEnabled) ?? undefined,
    };
}

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.floor(n)));
}

export async function resolveSubjectRuntimeWindow(args: {
    subjectSlug: string;
}) {
    const registrySubject = (SUBJECTS as RegistrySubjectLike[]).find(
        (s) => s.slug === args.subjectSlug,
    );

    if (!registrySubject) {
        return {
            ok: false as const,
            statusCode: 404,
            message: "Unknown subjectSlug.",
        };
    }

    const registryModules = (MODULES as RegistryModuleLike[])
        .filter((m) => m.subjectSlug === args.subjectSlug)
        .sort((a, b) => a.order - b.order);

    const subjectRow = await prisma.practiceSubject.findUnique({
        where: { slug: args.subjectSlug },
        select: {
            id: true,
            meta: true,
        },
    });

    const authoredMeta = parseAuthoredMeta(registrySubject.meta);
    const runtimeMeta = parseRuntimeMeta(subjectRow?.meta);

    const totalRegistryModules = registryModules.length;
    const plannedModuleCount =
        authoredMeta.curriculum?.plannedModuleCount ?? totalRegistryModules;

    const publishedModuleCount = clampInt(
        runtimeMeta.publishedModuleCount ?? totalRegistryModules,
        0,
        totalRegistryModules,
    );

    const curriculumComplete =
        runtimeMeta.curriculumState === "complete" ||
        Boolean(authoredMeta.curriculum?.isTerminalRelease);

    const rewardEnabled =
        runtimeMeta.rewardEnabled ??
        authoredMeta.completionPolicy?.rewardEnabledByDefault ??
        false;

    const certificateEnabled =
        runtimeMeta.certificateEnabled ??
        authoredMeta.completionPolicy?.certificateEnabledByDefault ??
        false;

    return {
        ok: true as const,
        subjectId: subjectRow?.id ?? null,
        registrySubject,
        registryModules,
        plannedModuleCount,
        publishedModuleCount,
        publishedModules: registryModules.slice(0, publishedModuleCount),
        curriculumComplete,
        rewardEnabled,
        certificateEnabled,
        requireAllPublishedModules:
            authoredMeta.completionPolicy?.requireAllPublishedModules ?? true,
        moreComingMessage:
            authoredMeta.curriculum?.moreComingMessage ??
            "You completed everything published so far. More modules are coming soon.",
    };
}

export async function resolveSubjectFinishState(args: {
    subjectSlug: string;
    actor: Actor;
    locale: string;
    currentModuleSlug?: string | null;
}) {
    const runtime = await resolveSubjectRuntimeWindow({
        subjectSlug: args.subjectSlug,
    });

    if (!runtime.ok) return runtime;

    const actorKey = actorKeyOf(args.actor);
    const publishedModuleSlugs = runtime.publishedModules.map((m) => m.slug);

    const progressRows = publishedModuleSlugs.length
        ? await prisma.reviewProgress.findMany({
            where: {
                actorKey,
                subjectSlug: args.subjectSlug,
                locale: args.locale,
                moduleId: { in: publishedModuleSlugs },
            },
            select: {
                moduleId: true,
                state: true,
            },
        })
        : [];

    const progressByModule = new Map<string, unknown>(
        progressRows.map((row) => [row.moduleId, row.state]),
    );

    const completedPublishedModuleCount = runtime.publishedModules.reduce((acc, mod) => {
        const state = asRecord(progressByModule.get(mod.slug));
        return acc + (state?.moduleCompleted === true ? 1 : 0);
    }, 0);

    const remainingPublishedModuleCount = Math.max(
        0,
        runtime.publishedModuleCount - completedPublishedModuleCount,
    );

    const allPublishedModulesComplete =
        runtime.publishedModuleCount > 0 &&
        completedPublishedModuleCount >= runtime.publishedModuleCount;

    const subjectCompleted = runtime.requireAllPublishedModules
        ? allPublishedModulesComplete
        : allPublishedModulesComplete;

    const certificateRow = await prisma.courseCertificate.findUnique({
        where: {
            actorKey_subjectSlug_locale: {
                actorKey,
                subjectSlug: args.subjectSlug,
                locale: args.locale,
            },
        },
        select: { id: true },
    });

    const certificateIssued = Boolean(certificateRow?.id);
    const lastPublishedModuleSlug =
        runtime.publishedModules[runtime.publishedModules.length - 1]?.slug ?? null;

    const atEndOfPublishedTrack = Boolean(
        args.currentModuleSlug &&
        lastPublishedModuleSlug &&
        args.currentModuleSlug === lastPublishedModuleSlug,
    );

    const rewardEligible = subjectCompleted;
    const certificateEligible =
        subjectCompleted && runtime.curriculumComplete && runtime.certificateEnabled;

    let status: ResolvedSubjectFinishState["status"] = "in_progress";
    let message: string | null = null;

    if (certificateIssued) {
        status = "certificate_issued";
        message = "Your certificate has already been issued.";
    } else if (subjectCompleted && !runtime.curriculumComplete) {
        status = "more_coming";
        message = runtime.moreComingMessage;
    } else if (subjectCompleted && runtime.curriculumComplete && runtime.certificateEnabled) {
        status = "certificate_ready";
        message = "You completed the full course and can now claim your certificate.";
    } else if (subjectCompleted && runtime.curriculumComplete && runtime.rewardEnabled) {
        status = "reward_ready";
        message = "You completed the full course and unlocked the final reward.";
    }

    const state: ResolvedSubjectFinishState = {
        subjectSlug: args.subjectSlug,
        currentModuleSlug: args.currentModuleSlug ?? null,

        curriculumState: runtime.curriculumComplete ? "complete" : "growing",
        curriculumComplete: runtime.curriculumComplete,

        publishedModuleCount: runtime.publishedModuleCount,
        plannedModuleCount: runtime.plannedModuleCount,

        lastPublishedModuleSlug,
        atEndOfPublishedTrack,

        completedPublishedModuleCount,
        remainingPublishedModuleCount,

        rewardEnabled: runtime.rewardEnabled,
        certificateEnabled: runtime.certificateEnabled,

        rewardEligible,
        certificateEligible,
        certificateIssued,

        status,
        message,
    };

    return {
        ok: true as const,
        state,
    };
}