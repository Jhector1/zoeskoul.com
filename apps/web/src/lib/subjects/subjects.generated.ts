/* eslint-disable */
// AUTO-GENERATED FILE. DO NOT EDIT.
// Run: pnpm gen:subject-manifests

import type {
  SubjectManifest,
  TopicManifestRefMap,
} from "@/lib/subjects/_core/subjectManifestTypes";

import python from "./python/subject.manifest.json";
import { TOPIC_MANIFESTS as pythonTopicManifests } from "./python/topics.generated";
import sql from "./sql/subject.manifest.json";
import { TOPIC_MANIFESTS as sqlTopicManifests } from "./sql/topics.generated";


export type GeneratedSubjectGenKey = "python_part1" | "sql_for_beginners";

export const SUBJECT_MANIFESTS: Record<string, SubjectManifest> = {
  "python": python as SubjectManifest,
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
  "python_part1": [SUBJECT_GENERATOR_SOURCES["python"]],
  "sql_for_beginners": [SUBJECT_GENERATOR_SOURCES["sql"]],
};
