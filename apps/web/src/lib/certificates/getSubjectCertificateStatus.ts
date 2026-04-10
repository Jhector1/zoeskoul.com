import { prisma } from "@/lib/prisma";
import { hasReviewModule } from "@/lib/subjects/registry";
import { CERT_REQUIRE_ASSIGNMENT } from "@/lib/certificates/policy";
import { resolveSubjectRuntimeWindow } from "@/lib/review/api/shared/resolveSubjectFinishState";

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

function latestIso(values: Array<string | null | undefined>) {
    return values.filter(Boolean).sort().slice(-1)[0] ?? null;
}

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

    const runtime = await resolveSubjectRuntimeWindow({ subjectSlug });

    if (!runtime.ok) {
        return {
            ok: false,
            status: runtime.statusCode,
            message: runtime.message,
        };
    }

    const publishedReviewModuleSlugs = runtime.publishedModules
        .map((m) => m.slug)
        .filter((slug) => hasReviewModule(subjectSlug, slug));

    if (!publishedReviewModuleSlugs.length) {
        return {
            ok: false,
            status: 404,
            message: "No published review modules for this subject.",
        };
    }

    const dbModules = await prisma.practiceModule.findMany({
        where: {
            subjectId: subject.id,
            slug: { in: publishedReviewModuleSlugs },
        },
        orderBy: { order: "asc" },
        select: { slug: true, title: true, order: true },
    });

    const reviewModules = dbModules.filter((m) =>
        publishedReviewModuleSlugs.includes(m.slug),
    );

    if (!reviewModules.length) {
        return {
            ok: false,
            status: 404,
            message: "No published review modules found in database for this subject.",
        };
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

    const progressByModule = new Map(progressRows.map((r) => [r.moduleId, r]));
    const requireAssignment = CERT_REQUIRE_ASSIGNMENT;

    const assignmentSessionIds = Array.from(
        new Set(
            progressRows
                .map((row) => {
                    const state = (row.state ?? null) as any;
                    return state?.assignmentSessionId
                        ? String(state.assignmentSessionId)
                        : null;
                })
                .filter(Boolean) as string[],
        ),
    );

    const assignmentSessions = assignmentSessionIds.length
        ? await prisma.practiceSession.findMany({
            where: { id: { in: assignmentSessionIds } },
            select: { id: true, status: true, completedAt: true },
        })
        : [];

    const sessionById = new Map(
        assignmentSessions.map((s) => [s.id, s]),
    );

    const modules: SubjectCertificateModuleStatus[] = reviewModules.map((m) => {
        const row = progressByModule.get(m.slug);
        const state = (row?.state ?? null) as any;

        const moduleCompleted = Boolean(state?.moduleCompleted);

        const assignmentSessionId = state?.assignmentSessionId
            ? String(state.assignmentSessionId)
            : null;

        const session = assignmentSessionId
            ? sessionById.get(assignmentSessionId)
            : null;

        const assignmentCompleted = session?.status === "completed";

        return {
            moduleId: m.slug,
            title: m.title,
            order: m.order,
            moduleCompleted,
            assignmentSessionId,
            assignmentCompleted,
            completedAt: state?.moduleCompletedAt ?? null,
        };
    });

    const eligibleByWork = modules.every(
        (m) => m.moduleCompleted && (!requireAssignment || m.assignmentCompleted),
    );

    const eligible =
        eligibleByWork &&
        runtime.curriculumComplete &&
        runtime.certificateEnabled;

    const completedAt =
        latestIso(modules.map((m) => m.completedAt)) ??
        latestIso(progressRows.map((r) => r.updatedAt.toISOString()));

    return {
        ok: true,
        subject,
        requireAssignment,
        modules,
        eligible,
        completedAt,
    };
}