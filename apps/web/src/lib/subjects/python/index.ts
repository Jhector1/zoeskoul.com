
import subjectManifest from "./subject.manifest.json";
import { TOPIC_MANIFESTS } from "./topics.generated";
import { defineCourseFromManifest } from "@/lib/subjects/_core/defineCourseFromManifest";

export const PYTHON = defineCourseFromManifest({
    manifest: subjectManifest,
    topicManifests: TOPIC_MANIFESTS,
});
