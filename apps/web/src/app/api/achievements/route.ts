// src/app/api/achievements/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasReviewModule } from "@/lib/subjects/registry";
import {
    getActor,
    ensureGuestId,
    attachGuestCookie,
    actorKeyOf,
} from "@/lib/practice/actor";
import { CERT_REQUIRE_ASSIGNMENT } from "@/lib/certificates/policy";

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

type ModState = {
    moduleCompleted?: boolean;
    moduleCompletedAt?: string | null;
    assignmentSessionId?: string | null;
};

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const locale = (searchParams.get("locale") ?? "en").trim();

    const actor0 = await getActor();
    const ensured = ensureGuestId(actor0);
    const actor = ensured.actor;
    const setGuestId = ensured.setGuestId;
    const actorKey = actorKeyOf(actor);

    // Only show active/completed enrollments; hide archived by default
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

    const subjects = enrollments.map((e) => e.subject).filter(Boolean);
    const subjectIds = subjects.map((s) => s.id);
    const subjectSlugs = subjects.map((s) => s.slug);

    // Load modules for all enrolled subjects
    // ✅ include id (DB id) AND subjectId (nullable in schema)
    const allModules = await prisma.practiceModule.findMany({
        where: { subjectId: { in: subjectIds } },
        orderBy: [{ order: "asc" }],
        select: { id: true, subjectId: true, slug: true, title: true, order: true },
    });

    type ModuleRow = (typeof allModules)[number];

    const modulesBySubjectId = new Map<string, ModuleRow[]>();

    for (const m of allModules) {
        // ✅ FIX TS: subjectId can be null in schema
        if (!m.subjectId) continue;

        const sid = m.subjectId;
        const arr = modulesBySubjectId.get(sid) ?? [];
        arr.push(m);
        modulesBySubjectId.set(sid, arr);
    }

    // Determine the review modules for each subject (registry-driven)
    const reviewModuleKeys: Array<{
        subjectSlug: string;
        subjectId: string;
        moduleId: string;   // ✅ DB id
        moduleSlug: string; // ✅ slug for URLs / registry
    }> = [];

    for (const s of subjects) {
        const mods = modulesBySubjectId.get(s.id) ?? [];
        for (const m of mods) {
            if (hasReviewModule(s.slug, m.slug)) {
                reviewModuleKeys.push({
                    subjectSlug: s.slug,
                    subjectId: s.id,
                    moduleId: m.id,
                    moduleSlug: m.slug,
                });
            }
        }
    }

    // If no review modules exist, still return enrollments
    const allReviewModuleIds = Array.from(new Set(reviewModuleKeys.map((k) => k.moduleId)));

    // ✅ IMPORTANT: ReviewProgress.moduleId stores the module *DB id*, not slug
    const progressRows =
        allReviewModuleIds.length > 0
            ? await prisma.reviewProgress.findMany({
                where: {
                    actorKey,
                    locale,
                    subjectSlug: { in: subjectSlugs },
                    moduleId: { in: allReviewModuleIds },
                },
                select: { subjectSlug: true, moduleId: true, state: true, updatedAt: true },
            })
            : [];

    const progressByKey = new Map<string, { state: any; updatedAt: Date }>();
    const sessionIds = new Set<string>();

    for (const r of progressRows) {
        progressByKey.set(`${r.subjectSlug}:${r.moduleId}`, {
            state: r.state as any,
            updatedAt: r.updatedAt,
        });

        const st = (r.state ?? null) as ModState | null;
        const sid = st?.assignmentSessionId ? String(st.assignmentSessionId) : null;
        if (sid) sessionIds.add(sid);
    }

    const sessions =
        sessionIds.size > 0
            ? await prisma.practiceSession.findMany({
                where: { id: { in: Array.from(sessionIds) } },
                select: { id: true, status: true, completedAt: true },
            })
            : [];

    const sessionById = new Map(sessions.map((s) => [s.id, s]));

    const certRows = await prisma.courseCertificate.findMany({
        where: {
            actorKey,
            locale,
            subjectSlug: { in: subjectSlugs },
        },
        select: { id: true, subjectSlug: true, issuedAt: true, completedAt: true },
    });

    const certBySubjectSlug = new Map(certRows.map((c) => [c.subjectSlug, c]));

    const requireAssignment = CERT_REQUIRE_ASSIGNMENT;

    const items = enrollments
        .map((enr) => {
            const s = enr.subject;

            const mods = modulesBySubjectId.get(s.id) ?? [];
            const reviewMods = mods.filter((m) => hasReviewModule(s.slug, m.slug));

            const moduleStatuses = reviewMods.map((m) => {
                // ✅ Use module DB id for progress lookup
                const row = progressByKey.get(`${s.slug}:${m.id}`);
                const state = (row?.state ?? null) as ModState | null;

                const moduleCompleted = Boolean(state?.moduleCompleted);
                const assignmentSessionId = state?.assignmentSessionId ? String(state.assignmentSessionId) : null;

                let assignmentCompleted = false;
                if (assignmentSessionId) {
                    const sess = sessionById.get(assignmentSessionId);
                    assignmentCompleted = sess?.status === "completed";
                }

                return {
                    // Keep old field for UI compatibility (slug)
                    moduleId: m.slug,

                    // ✅ add DB id so clients can migrate safely
                    moduleDbId: m.id,

                    title: m.title,
                    order: m.order,
                    moduleCompleted,
                    assignmentCompleted,
                    completedAt: state?.moduleCompletedAt ?? null,
                    updatedAt: row?.updatedAt?.toISOString() ?? null,
                };
            });

            const modulesTotal = moduleStatuses.length;
            const modulesDone = moduleStatuses.filter((x) => x.moduleCompleted).length;
            const assignmentsDone = moduleStatuses.filter((x) => x.assignmentCompleted).length;

            const eligible =
                modulesTotal > 0 &&
                moduleStatuses.every((x) => x.moduleCompleted && (!requireAssignment || x.assignmentCompleted));

            const completedAt =
                moduleStatuses
                    .map((m) => m.completedAt)
                    .filter(Boolean)
                    .sort()
                    .slice(-1)[0] ??
                moduleStatuses
                    .map((m) => m.updatedAt)
                    .filter(Boolean)
                    .sort()
                    .slice(-1)[0] ??
                enr.completedAt?.toISOString() ??
                null;

            const percent = modulesTotal === 0 ? 0 : Math.round((modulesDone / Math.max(1, modulesTotal)) * 100);

            const certificate = certBySubjectSlug.get(s.slug) ?? null;

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
                requireAssignment,
                eligible,
                completedAt,
                progress: {
                    modulesTotal,
                    modulesDone,
                    assignmentsDone,
                    percent,
                },
                modules: moduleStatuses,
                certificate: certificate
                    ? {
                        id: certificate.id,
                        issuedAt: certificate.issuedAt.toISOString(),
                        completedAt: certificate.completedAt?.toISOString() ?? null,
                    }
                    : null,
            };
        })
        .sort((a, b) => (a.subject.order ?? 0) - (b.subject.order ?? 0));

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