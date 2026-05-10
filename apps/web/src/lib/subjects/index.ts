import { buildArtifacts } from "./_core/buildArtifacts";
import { defineCourseFromManifest } from "@/lib/subjects/_core/defineCourseFromManifest";
import { SUBJECT_GENERATOR_SOURCES } from "@/lib/subjects/subjects.generated";

export const COURSE_BUNDLES = Object.values(SUBJECT_GENERATOR_SOURCES).map((source) =>
    defineCourseFromManifest({
        manifest: source.manifest,
        topicManifests: source.topicManifests,
    }),
);

export const SUBJECT_ARTIFACTS = buildArtifacts(COURSE_BUNDLES);
export const SUBJECTS = SUBJECT_ARTIFACTS.subjects;
export const MODULES = SUBJECT_ARTIFACTS.modules;
export const TOPICS = SUBJECT_ARTIFACTS.topics;
export const SECTIONS = SUBJECT_ARTIFACTS.sections;

export const GENERATED_CATALOG = SUBJECT_ARTIFACTS.catalog;
export const REVIEW_TOPICS_BY_SLUG = SUBJECT_ARTIFACTS.reviewTopicsBySlug;
export const SUBJECT_SKETCHES = SUBJECT_ARTIFACTS.sketches;

export const TOPIC_GENERATORS_BY_SLUG = SUBJECT_ARTIFACTS.generatorsByTopicSlug;