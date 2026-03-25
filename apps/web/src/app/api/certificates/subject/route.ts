// src/app/api/certificates/subject/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasReviewModule } from "@/lib/subjects/registry";
import {
    getActor,
    ensureGuestId,
    attachGuestCookie,
    actorKeyOf,
} from "@/lib/practice/actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { CERT_REQUIRE_ASSIGNMENT } from "@/lib/certificates/policy";
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

    if (!subjectSlug) return jsonErr("Missing subjectSlug.", 400, null, setGuestId);

    const subject = await prisma.practiceSubject.findUnique({
        where: { slug: subjectSlug },
        select: { id: true, slug: true, title: true },
    });
    if (!subject) return jsonErr("Unknown subjectSlug.", 404, { subjectSlug }, setGuestId);

    const dbModules = await prisma.practiceModule.findMany({
        where: { subjectId: subject.id },
        orderBy: { order: "asc" },
        select: { slug: true, title: true, order: true },
    });

    // DB order is authoritative; but only include modules that have ReviewModule content
    const reviewModules = dbModules.filter((m) => hasReviewModule(subjectSlug, m.slug));
    if (!reviewModules.length) {
        return jsonErr("No review modules for this subject.", 404, { subjectSlug }, setGuestId);
    }

    const progressRows = await prisma.reviewProgress.findMany({
        where: {
            actorKey,
            subjectSlug,
            locale,
            moduleId: { in: reviewModules.map((m) => m.slug) },
        },
        select: { moduleId: true, state: true, updatedAt: true },
    });

    const progressByModule = new Map(progressRows.map((r) => [r.moduleId, r as any]));

    // ✅ Decide whether assignment is required for certificate
    const requireAssignment = CERT_REQUIRE_ASSIGNMENT;

    const modules = await Promise.all(
        reviewModules.map(async (m) => {
            const row = progressByModule.get(m.slug);
            const state = (row?.state ?? null) as any;

            const moduleCompleted = Boolean(state?.moduleCompleted);

            const assignmentSessionId = state?.assignmentSessionId
                ? String(state.assignmentSessionId)
                : null;

            let assignmentCompleted = false;
            if (assignmentSessionId) {
                const sess = await prisma.practiceSession.findUnique({
                    where: { id: assignmentSessionId },
                    select: { status: true, completedAt: true },
                });
                assignmentCompleted = sess?.status === "completed";
            }

            return {
                moduleId: m.slug,
                title: m.title,
                order: m.order,
                moduleCompleted,
                assignmentSessionId,
                assignmentCompleted,
                completedAt: state?.moduleCompletedAt ?? null,
            };
        }),
    );

    const eligible = modules.every((x) => x.moduleCompleted && (!requireAssignment || x.assignmentCompleted));

    const completedAt =
        modules
            .map((m) => m.completedAt)
            .filter(Boolean)
            .sort()
            .slice(-1)[0] ??
        progressRows.map((r) => r.updatedAt.toISOString()).sort().slice(-1)[0] ??
        null;

    // ✅ If already issued, return it (don’t create here; create on PDF download)
    const certificate = await prisma.courseCertificate.findUnique({
        where: {
            actorKey_subjectSlug_locale: {
                actorKey,
                subjectSlug: subject.slug,
                locale,
            },
        },
        select: { id: true, issuedAt: true, completedAt: true },
    });
// Name on certificate (same as PDF route)
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
    return jsonOk(
        {
            eligible,
            requireAssignment,
            subject: { slug: subject.slug, title: subject.title },
            locale,
            completedAt,
            modules,
            certificate, // null until PDF route issues it
            displayName, // ✅ add this

            actor: {
                isGuest: Boolean(actor.guestId && !actor.userId),
                // userId: actor.userId ?? null,
                // guestId: actor.guestId ?? null,
            },
        },
        setGuestId,
    );
}