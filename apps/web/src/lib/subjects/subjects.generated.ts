/* eslint-disable */
// AUTO-GENERATED FILE. DO NOT EDIT.
// Run: pnpm gen:subject-manifests

import type {
  SubjectManifest,
  TopicManifestRefMap,
} from "@/lib/subjects/_core/subjectManifestTypes";

import python from "./python/subject.manifest.json";
import { TOPIC_MANIFESTS as pythonTopicManifests } from "./python/topics.generated";
import pythonV2 from "./python-v2/subject.manifest.json";
import { TOPIC_MANIFESTS as pythonV2TopicManifests } from "./python-v2/topics.generated";
import sql from "./sql/subject.manifest.json";
import { TOPIC_MANIFESTS as sqlTopicManifests } from "./sql/topics.generated";
import sqlV2 from "./sql-v2/subject.manifest.json";
import { TOPIC_MANIFESTS as sqlV2TopicManifests } from "./sql-v2/topics.generated";


export type GeneratedSubjectGenKey = "python_part1" | "sql_for_beginners";

export const SUBJECT_MANIFESTS: Record<string, SubjectManifest> = {
  "python": python as SubjectManifest,
  "python-v2": pythonV2 as SubjectManifest,
  "sql": sql as SubjectManifest,
  "sql-v2": sqlV2 as SubjectManifest,
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
  "python-v2": {
    subjectSlug: "python-v2",
    genKey: "python_part1",
    manifest: pythonV2 as SubjectManifest,
    topicManifests: pythonV2TopicManifests as TopicManifestRefMap,
  },
  "sql": {
    subjectSlug: "sql",
    genKey: "sql_for_beginners",
    manifest: sql as SubjectManifest,
    topicManifests: sqlTopicManifests as TopicManifestRefMap,
  },
  "sql-v2": {
    subjectSlug: "sql-v2",
    genKey: "sql_for_beginners",
    manifest: sqlV2 as SubjectManifest,
    topicManifests: sqlV2TopicManifests as TopicManifestRefMap,
  },
};

export const SUBJECT_GENERATOR_SOURCES_BY_GENKEY: Record<
  GeneratedSubjectGenKey,
  Array<(typeof SUBJECT_GENERATOR_SOURCES)[keyof typeof SUBJECT_GENERATOR_SOURCES]>
> = {
  "python_part1": [SUBJECT_GENERATOR_SOURCES["python"], SUBJECT_GENERATOR_SOURCES["python-v2"]],
  "sql_for_beginners": [SUBJECT_GENERATOR_SOURCES["sql"], SUBJECT_GENERATOR_SOURCES["sql-v2"]],
};
