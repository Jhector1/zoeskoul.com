// src/lib/subjects/python/index.ts
import type { SubjectManifest } from "@/lib/subjects/_core/subjectManifestTypes";
import rawSubjectManifest from "./subject.manifest.json";
import { TOPIC_MANIFESTS } from "./topics.generated";
import { defineCourseFromManifest } from "@/lib/subjects/_core/defineCourseFromManifest";

const subjectManifest = rawSubjectManifest as SubjectManifest;

export const PYTHON = defineCourseFromManifest({
    manifest: subjectManifest,
    topicManifests: TOPIC_MANIFESTS,
});