// src/lib/certificates/getSubjectCertificateStatus.ts
import { prisma } from "@/lib/prisma";
import { hasReviewModule } from "@/lib/subjects/registry";
import { CERT_REQUIRE_ASSIGNMENT } from "@/lib/certificates/policy";

export type SubjectCertificateModuleStatus = {
    moduleId: string;
    title: string;
    order: number;
    moduleCompleted: boolean;
    assignmentSessionId: string | null;
    assignmentCompleted: boolean;
    completedAt: string | null;
};

export type SubjectCertificateStatus =
    | {
    ok: false;
    status: number;
    message: string;
}
    | {
    ok: true;
    subject: {
        id: string;
        slug: string;
        title: string;
    };
    requireAssignment: boolean;
    modules: SubjectCertificateModuleStatus[];
    eligible: boolean;
    completedAt: string | null;
};

export async function getSubjectCertificateStatus(opts: {
    actorKey: string;
    subjectSlug: string;
    locale: string;
}): Promise<SubjectCertificateStatus> {
    const { actorKey, subjectSlug, locale } = opts;

    const subject = await prisma.practiceSubject.findUnique({
        where: { slug: subjectSlug },
        select: { id: true, slug: true, title: true },
    });

    if (!subject) {
        return { ok: false, status: 404, message: "Unknown subjectSlug." };
    }

    const dbModules = await prisma.practiceModule.findMany({
        where: { subjectId: subject.id },
        orderBy: { order: "asc" },
        select: { slug: true, title: true, order: true },
    });

    const reviewModules = dbModules.filter((m) => hasReviewModule(subjectSlug, m.slug));
    if (!reviewModules.length) {
        return { ok: false, status: 404, message: "No review modules for this subject." };
    }

    // Shared truth for certificate progress:
    // reviewProgress.moduleId is matched the same way your working status route does now.
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

    const eligible = modules.every(
        (x) => x.moduleCompleted && (!requireAssignment || x.assignmentCompleted),
    );

    const completedAt =
        modules.map((m) => m.completedAt).filter(Boolean).sort().slice(-1)[0] ??
        progressRows.map((r) => r.updatedAt.toISOString()).sort().slice(-1)[0] ??
        null;

    return {
        ok: true,
        subject,
        requireAssignment,
        modules,
        eligible,
        completedAt,
    };
}