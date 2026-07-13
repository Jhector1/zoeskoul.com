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
import { buildCertificatePdf } from "@/lib/certificates/buildCertificatePdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function formatCertificateDate(value: string | null | undefined, locale: string) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "long",
        day: "numeric",
    }).format(date);
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

    const effectiveEligible =
        Boolean(certificate?.id) ||
        (status.eligible && finish.state.certificateEligible);

    if (!effectiveEligible) {
        return jsonErr(
            "Certificate is not available for this subject.",
            403,
            { subjectSlug },
            setGuestId,
        );
    }

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

    const completionDate =
        certificate?.completedAt?.toISOString() ??
        status.completedAt ??
        certificate?.issuedAt?.toISOString() ??
        new Date().toISOString();

    const completionDateStr = formatCertificateDate(completionDate, locale);
    const appName = "ZoeSkoul";

    const [t, pageT] = await Promise.all([
        getTranslations({
            locale,
            namespace: "certificatePreview",
        }).catch(() => null),
        getTranslations({
            locale,
            namespace: "certificatePage",
        }).catch(() => null),
    ]);

    // Mirror CertificateClient exactly: an unlocked but not-yet-issued
    // certificate shows an empty issued date and no certificate ID.
    const emptyDate = pageT?.("fallbacks.emptyDate") ?? "—";
    const issuedDateStr = certificate?.issuedAt
        ? formatCertificateDate(certificate.issuedAt.toISOString(), locale)
        : emptyDate;
    const certificateId = certificate?.id ?? null;

    const pdf = await buildCertificatePdf({
        learnerName: displayName,
        subjectTitle,
        completionDateStr,
        appName,
        copy: {
            title: t?.("title") ?? "CERTIFICATE",
            subtitle: t?.("subtitle") ?? "OF COMPLETION",
            presentedTo:
                t?.("presentedTo") ??
                "This certificate is proudly presented to",
            completionOf:
                t?.("completionOf") ??
                "for the successful completion of",
            dateAwarded: t?.("dateAwarded") ?? "Date awarded",
            issuedBadge: t?.("issuedBadge") ?? "ISSUED",
            issuedOn:
                t?.("issuedOn", { date: issuedDateStr }) ??
                `Issued: ${issuedDateStr}`,
            certificateIdLabel: certificateId
                ? t?.("certificateId", { id: certificateId }) ??
                  `Certificate ID: ${certificateId}`
                : "",
        },
    });

    const response = new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
            "Content-Type": "application/pdf",
            "Content-Length": String(pdf.byteLength),
            "Content-Disposition": `attachment; filename="${status.subject.slug}-certificate.pdf"`,
            "Cache-Control": "no-store",
        },
    });

    return attachGuestCookie(response, setGuestId);
}
