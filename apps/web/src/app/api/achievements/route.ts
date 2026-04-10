import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import {
    getActor,
    ensureGuestId,
    attachGuestCookie,
    actorKeyOf,
} from "@/lib/practice/actor";
import { getLocaleFromCookie } from "@/serverUtils";
import { getSubjectCertificateStatus } from "@/lib/certificates/getSubjectCertificateStatus";
import { resolveSubjectFinishState } from "@/lib/review/api/shared/resolveSubjectFinishState";
import { SUBJECTS } from "@/lib/subjects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FinishState = {
    status:
        | "in_progress"
        | "more_coming"
        | "reward_ready"
        | "certificate_ready"
        | "certificate_issued";
    message: string | null;
    rewardEligible: boolean;
    certificateEligible: boolean;
    certificateIssued: boolean;
    curriculumComplete: boolean;
};

type AchievementReward = {
    badgeLabel?: string | null;
    badgeDescription?: string | null;
    capstoneHref?: string | null;
    subjectHref?: string | null;
    certificateHref?: string | null;
};

function jsonOk(data: unknown, setGuestId?: string | null) {
    const res = NextResponse.json(data, { status: 200 });
    return attachGuestCookie(res, setGuestId ?? null);
}

function jsonErr(
    message: string,
    status = 400,
    detail?: unknown,
    setGuestId?: string | null,
) {
    const res = NextResponse.json({ message, detail }, { status });
    return attachGuestCookie(res, setGuestId ?? null);
}

function isTaggedI18n(value: unknown): value is string {
    return typeof value === "string" && value.startsWith("@:");
}

async function makeTextResolver(locale: string) {
    const t = await getTranslations({ locale });

    return (value: unknown, fallback = ""): string => {
        if (typeof value !== "string") return fallback;

        if (!isTaggedI18n(value)) {
            return value;
        }

        const key = value.slice(2).trim();
        if (!key) return fallback;

        try {
            const out = t(key as never);
            return out ? String(out) : fallback || key;
        } catch {
            return fallback || key;
        }
    };
}

function makeReward(args: {
    subjectSlug: string;
    subjectTitle: string;
    finishState: FinishState;
}): AchievementReward | null {
    const { subjectSlug, subjectTitle, finishState } = args;

    if (!finishState.rewardEligible && !finishState.certificateEligible && !finishState.certificateIssued) {
        return null;
    }

    return {
        badgeLabel: `${subjectTitle} Finisher`,
        badgeDescription:
            finishState.status === "certificate_issued"
                ? `Certificate issued for ${subjectTitle}`
                : finishState.status === "certificate_ready"
                    ? `Certificate ready for ${subjectTitle}`
                    : `Final reward unlocked for ${subjectTitle}`,
        capstoneHref: `/subjects/${encodeURIComponent(subjectSlug)}/modules`,
        subjectHref: `/subjects/${encodeURIComponent(subjectSlug)}/modules`,
        certificateHref: `/subjects/${encodeURIComponent(subjectSlug)}/certificate`,
    };
}

export async function GET(req: Request) {
    const url = new URL(req.url);
    const locale =
        (url.searchParams.get("locale") ?? "").trim() || (await getLocaleFromCookie()) || "en";

    const actor0 = await getActor();
    const { actor, setGuestId } = ensureGuestId(actor0);
    const actorKey = actorKeyOf(actor);

    const resolveText = await makeTextResolver(locale);

    const enrollments = await prisma.subjectEnrollment.findMany({
        where: {
            actorKey,
            archivedAt: null,
        },
        orderBy: [{ lastSeenAt: "desc" }],
        select: {
            status: true,
            startedAt: true,
            lastSeenAt: true,
            completedAt: true,
            subject: {
                select: {
                    id: true,
                    slug: true,
                    title: true,
                    order: true,
                    imagePublicId: true,
                    imageAlt: true,
                },
            },
        },
    });

    const certificateRows = await prisma.courseCertificate.findMany({
        where: { actorKey, locale },
        select: {
            id: true,
            subjectSlug: true,
            issuedAt: true,
            completedAt: true,
        },
    });

    const certificateBySubject = new Map(
        certificateRows.map((c) => [c.subjectSlug, c]),
    );

    const items = await Promise.all(
        enrollments.map(async (enr) => {
            const dbSubject = enr.subject;
            const registrySubject = SUBJECTS.find((s) => s.slug === dbSubject.slug);

            const subjectTitle = resolveText(
                dbSubject.title ?? registrySubject?.title ?? dbSubject.slug,
                dbSubject.slug,
            );

            const subjectImageAlt = resolveText(
                dbSubject.imageAlt ?? registrySubject?.imageAlt ?? subjectTitle,
                subjectTitle,
            );

            const finish = await resolveSubjectFinishState({
                subjectSlug: dbSubject.slug,
                actor,
                locale,
                currentModuleSlug: null,
            });

            const finishState: FinishState = finish.ok
                ? finish.state
                : {
                    status: "in_progress",
                    message: null,
                    rewardEligible: false,
                    certificateEligible: false,
                    certificateIssued: false,
                    curriculumComplete: false,
                };

            const status = await getSubjectCertificateStatus({
                actorKey,
                subjectSlug: dbSubject.slug,
                locale,
            });

            const certificate = certificateBySubject.get(dbSubject.slug) ?? null;
            const reward = makeReward({
                subjectSlug: dbSubject.slug,
                subjectTitle,
                finishState,
            });

            if (!status.ok) {
                return {
                    subject: {
                        id: dbSubject.id,
                        slug: dbSubject.slug,
                        title: subjectTitle,
                        order: dbSubject.order,
                        imagePublicId:
                            dbSubject.imagePublicId ?? registrySubject?.imagePublicId ?? null,
                        imageAlt: subjectImageAlt,
                    },
                    enrollment: {
                        status: enr.status,
                        startedAt: enr.startedAt.toISOString(),
                        lastSeenAt: enr.lastSeenAt?.toISOString() ?? null,
                        completedAt: enr.completedAt?.toISOString() ?? null,
                    },
                    requireAssignment: false,
                    eligible: Boolean(certificate) || finishState.certificateEligible,
                    completedAt:
                        certificate?.completedAt?.toISOString() ??
                        enr.completedAt?.toISOString() ??
                        null,
                    progress: {
                        modulesTotal: 0,
                        modulesDone: 0,
                        assignmentsDone: 0,
                        percent: 0,
                    },
                    modules: [],
                    certificate: certificate
                        ? {
                            id: certificate.id,
                            issuedAt: certificate.issuedAt.toISOString(),
                            completedAt: certificate.completedAt?.toISOString() ?? null,
                        }
                        : null,
                    finishState,
                    reward,
                };
            }

            const modulesTotal = status.modules.length;
            const modulesDone = status.modules.filter((m) => m.moduleCompleted).length;
            const assignmentsDone = status.modules.filter((m) => m.assignmentCompleted).length;
            const percent =
                modulesTotal === 0
                    ? 0
                    : Math.round((modulesDone / Math.max(1, modulesTotal)) * 100);

            return {
                subject: {
                    id: dbSubject.id,
                    slug: dbSubject.slug,
                    title: subjectTitle,
                    order: dbSubject.order,
                    imagePublicId:
                        dbSubject.imagePublicId ?? registrySubject?.imagePublicId ?? null,
                    imageAlt: subjectImageAlt,
                },
                enrollment: {
                    status: enr.status,
                    startedAt: enr.startedAt.toISOString(),
                    lastSeenAt: enr.lastSeenAt?.toISOString() ?? null,
                    completedAt: enr.completedAt?.toISOString() ?? null,
                },
                requireAssignment: status.requireAssignment,
                eligible:
                    status.eligible ||
                    Boolean(certificate) ||
                    finishState.certificateEligible,
                completedAt:
                    status.completedAt ??
                    certificate?.completedAt?.toISOString() ??
                    null,
                progress: {
                    modulesTotal,
                    modulesDone,
                    assignmentsDone,
                    percent,
                },
                modules: status.modules.map((m) => ({
                    moduleId: m.moduleId,
                    title: resolveText(m.title, m.moduleId),
                    order: m.order,
                    moduleCompleted: m.moduleCompleted,
                    assignmentCompleted: m.assignmentCompleted,
                    completedAt: m.completedAt,
                    updatedAt: null,
                })),
                certificate: certificate
                    ? {
                        id: certificate.id,
                        issuedAt: certificate.issuedAt.toISOString(),
                        completedAt: certificate.completedAt?.toISOString() ?? null,
                    }
                    : null,
                finishState,
                reward,
            };
        }),
    );

    items.sort((a, b) => (a.subject.order ?? 0) - (b.subject.order ?? 0));

    return jsonOk(
        {
            locale,
            actor: {
                isGuest: Boolean(actor.guestId && !actor.userId),
                userId: actor.userId ?? null,
                guestId: actor.guestId ?? null,
            },
            items,
        },
        setGuestId,
    );
}