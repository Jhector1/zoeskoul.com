"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { ROUTES } from "@/utils";
import type { SubjectCard } from "./subjectCardTypes";

export function useSubjectCardController({
    initialSubjects,
    allowEnrollment = true,
}: {
    initialSubjects: SubjectCard[];
    allowEnrollment?: boolean;
}) {
    const router = useRouter();
    const [subjects, setSubjects] = useState(initialSubjects);
    const [enrollingSlug, setEnrollingSlug] = useState<string | null>(null);

    async function enrollSubject(slug: string) {
        const response = await fetch(
            `/api/subjects/${encodeURIComponent(slug)}/enroll`,
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                cache: "no-store",
            },
        );

        if (!response.ok) {
            throw new Error("Enroll failed");
        }
    }

    async function pickSubject(subject: SubjectCard) {
        if (!subject.subjectId) return;
        if (subject.status !== "active") return;
        if (!subject.defaultModuleSlug) return;
        if (enrollingSlug) return;

        if (allowEnrollment && !subject.enrolled) {
            setEnrollingSlug(subject.slug);

            try {
                await enrollSubject(subject.slug);
                setSubjects((current) =>
                    current.map((item) =>
                        item.slug === subject.slug
                            ? { ...item, enrolled: true }
                            : item,
                    ),
                );
            } catch {
                return;
            } finally {
                setEnrollingSlug(null);
            }
        }

        router.push(ROUTES.subjectModules(encodeURIComponent(subject.slug)));
    }

    return {
        subjects,
        enrollingSlug,
        pickSubject,
    };
}
