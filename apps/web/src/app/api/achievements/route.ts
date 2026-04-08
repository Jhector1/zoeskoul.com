import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    getActor,
    ensureGuestId,
    attachGuestCookie,
    actorKeyOf,
} from "@/lib/practice/actor";
import { getSubjectCertificateStatus } from "@/lib/certificates/getSubjectCertificateStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonOk(data: any, setGuestId?: string) {
    const res = NextResponse.json(data, { status: 200 });
    return attachGuestCookie(res, setGuestId);
}

function jsonErr(message: string, status = 400, detail?: any, setGuestId?: string) {
    const res = NextResponse.json({ message, detail }, { status });
    return attachGuestCookie(res, setGuestId);
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const locale = (searchParams.get("locale") ?? "en").trim();

    const actor0 = await getActor();
    const ensured = ensureGuestId(actor0);
    const actor = ensured.actor;
    const setGuestId = ensured.setGuestId;
    const actorKey = actorKeyOf(actor);

    const enrollments = await prisma.subjectEnrollment.findMany({
        where: {
            actorKey,
            status: { in: ["enrolled", "completed"] },
        },
        orderBy: [{ updatedAt: "desc" }],
        select: {
            status: true,
            startedAt: true,
            lastSeenAt: true,
            completedAt: true,
            subjectId: true,
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

    if (!enrollments.length) {
        return jsonOk(
            {
                locale,
                actor: {
                    isGuest: Boolean(actor.guestId && !actor.userId),
                    userId: actor.userId ?? null,
                    guestId: actor.guestId ?? null,
                },
                items: [],
            },
            setGuestId,
        );
    }

    const subjectSlugs = enrollments.map((e) => e.subject.slug);

    const certRows = await prisma.courseCertificate.findMany({
        where: {
            actorKey,
            locale,
            subjectSlug: { in: subjectSlugs },
        },
        select: { id: true, subjectSlug: true, issuedAt: true, completedAt: true },
    });

    const certBySubjectSlug = new Map(certRows.map((c) => [c.subjectSlug, c]));

    const items = await Promise.all(
        enrollments.map(async (enr) => {
            const s = enr.subject;

            const status = await getSubjectCertificateStatus({
                actorKey,
                subjectSlug: s.slug,
                locale,
            });

            const certificate = certBySubjectSlug.get(s.slug) ?? null;

            if (!status.ok) {
                return {
                    subject: {
                        id: s.id,
                        slug: s.slug,
                        title: s.title,
                        order: s.order,
                        imagePublicId: s.imagePublicId,
                        imageAlt: s.imageAlt,
                    },
                    enrollment: {
                        status: enr.status,
                        startedAt: enr.startedAt.toISOString(),
                        lastSeenAt: enr.lastSeenAt?.toISOString() ?? null,
                        completedAt: enr.completedAt?.toISOString() ?? null,
                    },
                    requireAssignment: false,
                    eligible: Boolean(certificate),
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
                };
            }

            const modulesTotal = status.modules.length;
            const modulesDone = status.modules.filter((m) => m.moduleCompleted).length;
            const assignmentsDone = status.modules.filter((m) => m.assignmentCompleted).length;

            const percent =
                modulesTotal === 0 ? 0 : Math.round((modulesDone / Math.max(1, modulesTotal)) * 100);

            return {
                subject: {
                    id: s.id,
                    slug: s.slug,
                    title: s.title,
                    order: s.order,
                    imagePublicId: s.imagePublicId,
                    imageAlt: s.imageAlt,
                },
                enrollment: {
                    status: enr.status,
                    startedAt: enr.startedAt.toISOString(),
                    lastSeenAt: enr.lastSeenAt?.toISOString() ?? null,
                    completedAt: enr.completedAt?.toISOString() ?? null,
                },
                requireAssignment: status.requireAssignment,
                eligible: status.eligible || Boolean(certificate),
                completedAt: status.completedAt ?? certificate?.completedAt?.toISOString() ?? null,
                progress: {
                    modulesTotal,
                    modulesDone,
                    assignmentsDone,
                    percent,
                },
                modules: status.modules.map((m) => ({
                    moduleId: m.moduleId,
                    title: m.title,
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