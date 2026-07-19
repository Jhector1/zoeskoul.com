"use client";

import { cn } from "@/lib/cn";
import SubjectTile from "./SubjectTile";
import type { SubjectCard } from "./subjectCardTypes";

export default function SubjectCardGrid({
    subjects,
    onPick,
    enrollingSlug,
    className,
}: {
    subjects: SubjectCard[];
    onPick: (subject: SubjectCard) => void;
    enrollingSlug: string | null;
    className?: string;
}) {
    return (
        <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3", className)}>
            {subjects.map((subject) => (
                <SubjectTile
                    key={subject.slug}
                    s={subject}
                    onPick={onPick}
                    enrolling={enrollingSlug === subject.slug}
                />
            ))}
        </div>
    );
}
