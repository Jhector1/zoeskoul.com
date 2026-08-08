import type { SubjectManifest } from "@/lib/subjects/_core/subjectManifestTypes";
import rawSubjectManifest from "./subject.manifest.json";
import { TOPIC_MANIFESTS } from "./topics.generated";
import { defineCourseFromManifest } from "@zoeskoul/curriculum-runtime/compat/defineCourseFromManifest";

const subjectManifest = rawSubjectManifest as SubjectManifest;

export const SQL = defineCourseFromManifest({
    manifest: subjectManifest,
    topicManifests: TOPIC_MANIFESTS,
});