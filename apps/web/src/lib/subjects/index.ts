import { buildArtifacts } from "./_core/buildArtifacts";
import { PYTHON } from "./python";

export const COURSE_BUNDLES = [
    PYTHON,
] as const;

export const SUBJECT_ARTIFACTS = buildArtifacts(COURSE_BUNDLES);
export const SUBJECTS = SUBJECT_ARTIFACTS.subjects;
export const MODULES = SUBJECT_ARTIFACTS.modules;
export const TOPICS = SUBJECT_ARTIFACTS.topics;
export const SECTIONS = SUBJECT_ARTIFACTS.sections;

export const GENERATED_CATALOG = SUBJECT_ARTIFACTS.catalog;
export const REVIEW_TOPICS_BY_SLUG = SUBJECT_ARTIFACTS.reviewTopicsBySlug;
export const SUBJECT_SKETCHES = SUBJECT_ARTIFACTS.sketches;
export const TOPIC_GENERATORS_BY_SLUG = SUBJECT_ARTIFACTS.generatorsByTopicSlug;