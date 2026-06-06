/* eslint-disable */
// AUTO-GENERATED FILE. DO NOT EDIT.
// Run: pnpm gen:subject-manifests

import type {
  SubjectManifest,
  TopicManifestRefMap,
} from "@/lib/subjects/_core/subjectManifestTypes";

import appliedPythonProjects from "./applied-python-projects/subject.manifest.json";
import { TOPIC_MANIFESTS as appliedPythonProjectsTopicManifests } from "./applied-python-projects/topics.generated";
import python from "./python/subject.manifest.json";
import { TOPIC_MANIFESTS as pythonTopicManifests } from "./python/topics.generated";
import pythonDataFunctions from "./python-data-functions/subject.manifest.json";
import { TOPIC_MANIFESTS as pythonDataFunctionsTopicManifests } from "./python-data-functions/topics.generated";
import pythonV2 from "./python-v2/subject.manifest.json";
import { TOPIC_MANIFESTS as pythonV2TopicManifests } from "./python-v2/topics.generated";
import sql from "./sql/subject.manifest.json";
import { TOPIC_MANIFESTS as sqlTopicManifests } from "./sql/topics.generated";
import sqlV2 from "./sql-v2/subject.manifest.json";
import { TOPIC_MANIFESTS as sqlV2TopicManifests } from "./sql-v2/topics.generated";


export type GeneratedSubjectGenKey = "python_part1" | "sql_for_beginners";

export const SUBJECT_MANIFESTS: Record<string, SubjectManifest> = {
  "applied-python-projects": appliedPythonProjects as SubjectManifest,
  "python": python as SubjectManifest,
  "python-data-functions": pythonDataFunctions as SubjectManifest,
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
  "applied-python-projects": {
    subjectSlug: "applied-python-projects",
    genKey: "python_part1",
    manifest: appliedPythonProjects as SubjectManifest,
    topicManifests: appliedPythonProjectsTopicManifests as TopicManifestRefMap,
  },
  "python": {
    subjectSlug: "python",
    genKey: "python_part1",
    manifest: python as SubjectManifest,
    topicManifests: pythonTopicManifests as TopicManifestRefMap,
  },
  "python-data-functions": {
    subjectSlug: "python-data-functions",
    genKey: "python_part1",
    manifest: pythonDataFunctions as SubjectManifest,
    topicManifests: pythonDataFunctionsTopicManifests as TopicManifestRefMap,
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
  "python_part1": [SUBJECT_GENERATOR_SOURCES["applied-python-projects"], SUBJECT_GENERATOR_SOURCES["python"], SUBJECT_GENERATOR_SOURCES["python-data-functions"], SUBJECT_GENERATOR_SOURCES["python-v2"]],
  "sql_for_beginners": [SUBJECT_GENERATOR_SOURCES["sql"], SUBJECT_GENERATOR_SOURCES["sql-v2"]],
};
