import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    getActor,
    ensureGuestId,
    attachGuestCookie,
    actorKeyOf,
} from "@/lib/practice/actor";
import { getSubjectCertificateStatus } from "@/lib/certificates/getSubjectCertificateStatus";
import { resolveSubjectFinishState } from "@/lib/review/api/shared/resolveSubjectFinishState";
import { resolveSubjectTitle } from "@/lib/subjects/resolveSubjectTitle";
import { resolveModuleTitle } from "@/lib/subjects/resolveModuleTitle";

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
    const subjectSlug = (searchParams.get("subjectSlug") ?? "").trim();
    const locale = (searchParams.get("locale") ?? "en").trim();

    const actor0 = await getActor();
    const ensured = ensureGuestId(actor0);
    const actor = ensured.actor;
    const setGuestId = ensured.setGuestId;
    const actorKey = actorKeyOf(actor);

    if (!subjectSlug) {
        return jsonErr("Missing subjectSlug.", 400, null, setGuestId);
    }

    const finish = await resolveSubjectFinishState({
        subjectSlug,
        actor,
        locale,
        currentModuleSlug: null,
    });

    if (!finish.ok) {
        return jsonErr(finish.message, finish.statusCode, { subjectSlug }, setGuestId);
    }

    const status = await getSubjectCertificateStatus({
        actorKey,
        subjectSlug,
        locale,
    });

    if (!status.ok) {
        return jsonErr(status.message, status.status, { subjectSlug }, setGuestId);
    }

    const certificate = await prisma.courseCertificate.findUnique({
        where: {
            actorKey_subjectSlug_locale: {
                actorKey,
                subjectSlug: status.subject.slug,
                locale,
            },
        },
        select: { id: true, issuedAt: true, completedAt: true },
    });

    let displayName = "Learner";
    if (actor.userId) {
        const u = await prisma.user.findUnique({
            where: { id: actor.userId },
            select: { name: true, email: true },
        });
        displayName = (u?.name || u?.email || "Learner").trim();
    } else {
        displayName = "Guest Learner";
    }

    const subjectTitle = await resolveSubjectTitle({
        subjectSlug: status.subject.slug,
        locale,
        fallback: status.subject.title,
    });

    const resolvedModules = await Promise.all(
        status.modules.map(async (m) => {
            const moduleSlug = m.moduleId;

            const title = await resolveModuleTitle({
                subjectSlug: status.subject.slug,
                moduleSlug,
                locale,
                fallback: m.title,
            });

            return {
                ...m,
                title,
            };
        }),
    );

    const effectiveEligible =
        Boolean(certificate?.id) ||
        (status.eligible && finish.state.certificateEligible);

    return jsonOk(
        {
            eligible: effectiveEligible,
            requireAssignment: status.requireAssignment,
            subject: {
                slug: status.subject.slug,
                title: subjectTitle,
            },
            locale,
            completedAt: status.completedAt,
            modules: resolvedModules,
            certificate: certificate
                ? {
                    ...certificate,
                    issuedAt: certificate.issuedAt.toISOString(),
                    completedAt: certificate.completedAt?.toISOString() ?? null,
                }
                : null,
            displayName,
            actor: {
                isGuest: Boolean(actor.guestId && !actor.userId),
            },
            finishState: finish.state,
        },
        setGuestId,
    );
}