import type { SubjectManifest } from "@/lib/subjects/_core/subjectManifestTypes";
import { defineCourseFromManifest } from "@/lib/subjects/_core/defineCourseFromManifest";
import rawSubjectManifest from "./subject.manifest.json";
import { TOPIC_MANIFESTS } from "./topics.generated";

const subjectManifest = rawSubjectManifest as SubjectManifest;

export const PYTHON_FOR_BEGINNERS = defineCourseFromManifest({
    manifest: subjectManifest,
    topicManifests: TOPIC_MANIFESTS,
});
