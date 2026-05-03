/* eslint-disable */
// AUTO-GENERATED FILE. DO NOT EDIT.
// Run: pnpm gen:subject-manifests



import python from "./python/subject.manifest.json";
import { TOPIC_MANIFESTS as pythonTopicManifests } from "./python/topics.generated";
import pythonForBeginners from "./python-for-beginners/subject.manifest.json";
import { TOPIC_MANIFESTS as pythonForBeginnersTopicManifests } from "./python-for-beginners/topics.generated";
import sql from "./sql/subject.manifest.json";
import { TOPIC_MANIFESTS as sqlTopicManifests } from "./sql/topics.generated";


export type GeneratedSubjectGenKey = "python_part1" | "sql_for_beginners";

export const SUBJECT_MANIFESTS: Record<string, SubjectManifest> = {
  "python": python as SubjectManifest,
  "python-for-beginners": pythonForBeginners as SubjectManifest,
  "sql": sql as SubjectManifest,
};

export const SUBJECT_GENERATOR_SOURCES: Record<
  string,
  {
    subjectSlug: string;
    genKey: GeneratedSubjectGenKey;
    manifest: SubjectManifest;
    topicManifests: TopicManifestRefMap;
  }
> = {
  "python": {
    subjectSlug: "python",
    genKey: "python_part1",
    manifest: python as SubjectManifest,
    topicManifests: pythonTopicManifests as TopicManifestRefMap,
  },
  "python-for-beginners": {
    subjectSlug: "python-for-beginners",
    genKey: "python_part1",
    manifest: pythonForBeginners as SubjectManifest,
    topicManifests: pythonForBeginnersTopicManifests as TopicManifestRefMap,
  },
  "sql": {
    subjectSlug: "sql",
    genKey: "sql_for_beginners",
    manifest: sql as SubjectManifest,
    topicManifests: sqlTopicManifests as TopicManifestRefMap,
  },
};

export const SUBJECT_GENERATOR_SOURCES_BY_GENKEY: Record<
  GeneratedSubjectGenKey,
  Array<(typeof SUBJECT_GENERATOR_SOURCES)[keyof typeof SUBJECT_GENERATOR_SOURCES]>
> = {
  "python_part1": [SUBJECT_GENERATOR_SOURCES["python"], SUBJECT_GENERATOR_SOURCES["python-for-beginners"]],
  "sql_for_beginners": [SUBJECT_GENERATOR_SOURCES["sql"]],
};
