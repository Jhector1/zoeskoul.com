// src/lib/subjects/python/subject.ts
import type { SubjectInput } from "@/lib/subjects/_core/defineCourse";

export const PY_SUBJECT_SLUG = "python" as const;





export const PY_SUBJECT = {
    slug: PY_SUBJECT_SLUG,
    order: 10,
    title: "Python",
    description: "Python programming practice.",
    imagePublicId: "Screenshot_2026-02-03_at_1.19.20_AM_kdnlpk",
    imageAlt: "Python subject cover",
    accessPolicy: "free",
    status: "active",
} as const satisfies SubjectInput;