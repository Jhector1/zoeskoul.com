import { prisma } from "@/lib/prisma";
import SubjectPicker from "@/features/practice/ui/subject-picker/SubjectPicker";
import { getActor, actorKeyOf } from "@/lib/practice/actor";
import { getResolvedSubjectCatalogMap } from "@/lib/subjects/server/resolveSubjectPresentation";
import { ROUTES } from "@/utils";

type SubjectStatus = "active" | "coming_soon" | "disabled";

export default async function PracticePage() {
    const actor = await getActor();
    const actorKey =
        actor.userId || actor.guestId
            ? actorKeyOf({ userId: actor.userId ?? null, guestId: actor.guestId ?? null })
            : null;

    const subjects = await prisma.practiceSubject.findMany({
        orderBy: { order: "asc" },
        select: {
            id: true,
            slug: true,
            status: true,
            title: true,
            description: true,
            imagePublicId: true,
            imageAlt: true,
            modules: {
                orderBy: { order: "asc" },
                select: { slug: true, order: true },
            },
        },
    });

    const enrolledSet = new Set<string>();

    if (actorKey) {
        const rows = await prisma.subjectEnrollment.findMany({
            where: {
                actorKey,
                subjectId: { in: subjects.map((s) => s.id) },
                status: { in: ["enrolled", "completed"] },
            },
            select: { subjectId: true },
        });

        rows.forEach((r) => enrolledSet.add(r.subjectId));
    }

    const manifestMap = await getResolvedSubjectCatalogMap();

    const cards = subjects
        .filter((s) => s.status !== "disabled" && enrolledSet.has(s.id))
        .map((s) => {
            const view = manifestMap[s.slug];

            return {
                slug: s.slug,
                title: view?.title ?? s.title,
                description: view?.description ?? s.description ?? "",
                defaultModuleSlug: view?.defaultModuleSlug ?? s.modules[0]?.slug ?? null,
                imagePublicId: view?.imagePublicId ?? s.imagePublicId ?? null,
                imageAlt: view?.imageAlt ?? s.imageAlt ?? view?.title ?? s.slug,
                enrolled: enrolledSet.has(s.id),
                status: (s.status ?? "active") as SubjectStatus,
            };
        });

    return (
        <SubjectPicker
            initialSubjects={cards}
            pageKicker="My learning"
            pageTitle="My Courses"
            pageSubtitle="Continue the courses you are already enrolled in, and use catalogs to discover new learning paths."
            emptyTitle="No enrolled courses yet"
            emptySubtitle="Browse the catalog to find a course, and enrolling from a catalog will bring it back here automatically."
            browseHref={ROUTES.catalogs}
            browseLabel="Browse catalogs"
            allowEnrollment={false}
        />
    );
}
