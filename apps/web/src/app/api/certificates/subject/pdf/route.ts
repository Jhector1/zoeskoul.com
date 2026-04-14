import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import {
    getActor,
    ensureGuestId,
    attachGuestCookie,
    actorKeyOf,
} from "@/lib/practice/actor";
import { getSubjectCertificateStatus } from "@/lib/certificates/getSubjectCertificateStatus";
import { resolveSubjectFinishState } from "@/lib/review/api/shared/resolveSubjectFinishState";

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

function stripTaggedKey(value?: string | null) {
    const raw = String(value ?? "").trim();
    return raw.startsWith("@:") ? raw.slice(2) : raw;
}

function looksLikeI18nKey(value?: string | null) {
    const raw = stripTaggedKey(value);
    return /^(subjects|modules|sections|topics|reviewQuizUi|common)\./.test(raw);
}

async function resolveAnyText(args: {
    locale: string;
    preferredKey?: string | null;
    dbValue?: string | null;
    fallback?: string | null;
    finalFallback: string;
}) {
    const { locale, preferredKey, dbValue, fallback, finalFallback } = args;

    let t: Awaited<ReturnType<typeof getTranslations>> | null = null;
    try {
        t = await getTranslations({ locale });
    } catch {
        t = null;
    }

    const candidates = [preferredKey, dbValue, fallback]
        .map((v) => stripTaggedKey(v))
        .filter(Boolean);

    for (const candidate of candidates) {
        if (looksLikeI18nKey(candidate)) {
            if (t) {
                try {
                    const out = t(candidate as any);
                    if (out && out !== candidate) {
                        return String(out).trim();
                    }
                } catch {
                    // keep falling through
                }
            }
            continue;
        }

        return candidate;
    }

    return finalFallback;
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

    const dbSubject = await prisma.practiceSubject.findUnique({
        where: { slug: status.subject.slug },
        select: { title: true },
    });

    const subjectTitle = await resolveAnyText({
        locale,
        preferredKey: `subjects.${status.subject.slug}.title`,
        dbValue: dbSubject?.title ?? null,
        fallback: status.subject.title,
        finalFallback: status.subject.slug,
    });

    const dbModules = await prisma.practiceModule.findMany({
        where: {
            subjectId: status.subject.id,
            slug: { in: status.modules.map((m) => m.moduleId) },
        },
        select: { slug: true, title: true },
    });

    const dbModuleTitleBySlug = new Map(dbModules.map((m) => [m.slug, m.title]));

    const resolvedModules = await Promise.all(
        status.modules.map(async (m) => {
            const moduleSlug = m.moduleId;

            const title = await resolveAnyText({
                locale,
                preferredKey: `modules.${status.subject.slug}.${moduleSlug}.title`,
                dbValue: dbModuleTitleBySlug.get(moduleSlug) ?? null,
                fallback: m.title,
                finalFallback: moduleSlug,
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