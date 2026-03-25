// // prisma/seed/data/index.ts
// import type { SubjectSeed, ModuleSeed, TopicSeed, SectionSeed } from "./subjects/_types";
//
// import { PYTHON } from "./subjects/python/subject";
// import { LINEAR_ALGEBRA } from "./subjects/linear-algebra/subject";
// import { HAITIAN_CREOLE } from "./subjects/haitian-creole";
// import { AI_SUBJECT } from "./subjects/ai";
// const SUBJECT_PACKS = [AI_SUBJECT, PYTHON, LINEAR_ALGEBRA, HAITIAN_CREOLE];
//
// export const SUBJECTS: SubjectSeed[] = SUBJECT_PACKS.map((p) => p.subject);
// export const MODULES: ModuleSeed[] = SUBJECT_PACKS.flatMap((p) => p.modules);
// export const TOPICS: TopicSeed[] = SUBJECT_PACKS.flatMap((p) => p.topics);
// export const SECTIONS: SectionSeed[] = SUBJECT_PACKS.flatMap((p) => p.sections);
// prisma/seed/data/index.ts
export { SUBJECTS, MODULES, TOPICS, SECTIONS } from "@/lib/subjects";