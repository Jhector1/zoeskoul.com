"use client";

import SubjectCardGrid from "@/features/practice/ui/subject-picker/SubjectCardGrid";
import type { SubjectCard } from "@/features/practice/ui/subject-picker/subjectCardTypes";
import { useSubjectCardController } from "@/features/practice/ui/subject-picker/useSubjectCardController";

export default function CatalogSubjectGridClient({
    initialSubjects,
}: {
    initialSubjects: SubjectCard[];
}) {
    const { subjects, enrollingSlug, pickSubject } = useSubjectCardController({
        initialSubjects,
        allowEnrollment: true,
    });

    return (
        <SubjectCardGrid
            subjects={subjects}
            onPick={pickSubject}
            enrollingSlug={enrollingSlug}
        />
    );
}
