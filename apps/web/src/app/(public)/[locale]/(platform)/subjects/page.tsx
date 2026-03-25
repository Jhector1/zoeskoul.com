import { prisma } from "@/lib/prisma";
import SubjectPicker from "@/features/practice/ui/subject-picker/SubjectPicker";
import { getActor, actorKeyOf } from "@/lib/practice/actor";
import {getServerI18n} from "@/i18n/server";
// import { getServerI18n } from "@/i18n/serverTagged";

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
            title: true,
            description: true,
            imagePublicId: true,
            imageAlt: true,
            status: true, // ✅ long-term status support
            modules: {
                orderBy: { order: "asc" },
                select: { slug: true, title: true, order: true },
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

    const { tMaybe } = await getServerI18n();

    const cards = subjects
        .filter((s) => s.status !== "disabled")
        .map((s) => {
            const titleKey = `subjects.${s.slug}.title`;
            const descKey = `subjects.${s.slug}.description`;
            const altKey = `subjects.${s.slug}.imageAlt`;

            const title = tMaybe(titleKey, s.title);
            const description = tMaybe(descKey, s.description ?? "");
            const imageAlt = tMaybe(altKey, s.imageAlt ?? title);

            return {
                slug: s.slug,
                title,
                description,
                defaultModuleSlug: s.modules[0]?.slug ?? null,
                imagePublicId: s.imagePublicId ?? null,
                imageAlt,
                enrolled: enrolledSet.has(s.id),
                status: (s.status ?? "active") as SubjectStatus,
            };
        });

    return <SubjectPicker initialSubjects={cards} />;
}