"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import type { SubjectCard } from "@/features/practice/ui/subject-picker/SubjectPicker";
import SubjectTile from "@/features/practice/ui/subject-picker/SubjectTile";
import { ROUTES } from "@/utils";

export default function CatalogSubjectGridClient({
    initialSubjects,
}: {
    initialSubjects: SubjectCard[];
}) {
    const router = useRouter();
    const [subjects, setSubjects] = useState(initialSubjects);
    const [enrollingSlug, setEnrollingSlug] = useState<string | null>(null);

    async function enrollSubject(slug: string) {
        const res = await fetch(`/api/subjects/${encodeURIComponent(slug)}/enroll`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            cache: "no-store",
        });

        if (!res.ok) {
            throw new Error("Enroll failed");
        }
    }

    async function pickSubject(subject: SubjectCard) {
        if (!subject.subjectId) return;
        if (subject.status !== "active") return;
        if (!subject.defaultModuleSlug) return;
        if (enrollingSlug) return;

        if (!subject.enrolled) {
            setEnrollingSlug(subject.slug);

            try {
                await enrollSubject(subject.slug);
                setSubjects((prev) =>
                    prev.map((item) =>
                        item.slug === subject.slug ? { ...item, enrolled: true } : item,
                    ),
                );
            } catch {
                setEnrollingSlug(null);
                return;
            } finally {
                setEnrollingSlug(null);
            }
        }

        router.push(ROUTES.subjectModules(encodeURIComponent(subject.slug)));
    }

    return (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {subjects.map((subject) => (
                <SubjectTile
                    key={subject.slug}
                    s={subject}
                    onPick={pickSubject}
                    enrolling={enrollingSlug === subject.slug}
                />
            ))}
        </div>
    );
}
