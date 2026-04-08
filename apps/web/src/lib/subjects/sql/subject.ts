// import type { SubjectInput } from "@/lib/subjects/_core/defineCourse";
//
// export const SQL_SUBJECT_SLUG = "sql" as const;
// export const SQL_GEN_KEY = "sql_for_beginners" as const;
//
// export const SQL_SUBJECT = {
//     slug: SQL_SUBJECT_SLUG,
//     order: 20,
//     title: "SQL",
//     description: "SQL for beginners.",
//     imagePublicId: "sql_subject_cover",
//     imageAlt: "SQL subject cover",
//     accessPolicy: "free",
//     status: "active",
// } as const satisfies SubjectInput;
// src/lib/subjects/sql/index.ts
// import subjectManifest from "./subject.manifest.json";
// import { TOPIC_MANIFESTS } from "./topics.generated";
// import { defineCourseFromManifest } from "@/lib/subjects/_core/defineCourseFromManifest";
//
// export const SQL = defineCourseFromManifest({
//     manifest: subjectManifest,
//     topicManifests: TOPIC_MANIFESTS,
// });