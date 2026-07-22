"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { ROUTES } from "@/utils";
import type { SubjectCard } from "./subjectCardTypes";
import { recordSubjectVisit } from "@/lib/subjects/client/recordSubjectVisit";

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

    async function pickSubject(subject: SubjectCard) {
        if (!subject.subjectId) return;
        if (subject.status !== "active") return;
        if (!subject.defaultModuleSlug) return;
        if (enrollingSlug) return;

        if (allowEnrollment && !subject.enrolled) {
            setEnrollingSlug(subject.slug);

            try {
                const recorded = await recordSubjectVisit(subject.slug);
                if (!recorded) return;

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
        } else if (allowEnrollment) {
            // Keep lastSeenAt fresh without blocking navigation for an already
            // enrolled learner. The request uses keepalive so the route change
            // does not discard it.
            void recordSubjectVisit(subject.slug);
        }

        router.push(ROUTES.subjectModules(encodeURIComponent(subject.slug)));
    }

    return {
        subjects,
        enrollingSlug,
        pickSubject,
    };
}
