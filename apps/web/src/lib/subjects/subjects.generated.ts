/* eslint-disable */
// AUTO-GENERATED FILE. DO NOT EDIT.
// Run: pnpm gen:subject-manifests

import type {
  SubjectManifest,
  TopicManifestRefMap,
} from "@/lib/subjects/_core/subjectManifestTypes";

import cDataStructures from "./c/c-data-structures/subject.manifest.json";
import { TOPIC_MANIFESTS as cDataStructuresTopicManifests } from "./c/c-data-structures/topics.generated";
import gitFoundations from "./git/git-foundations/subject.manifest.json";
import { TOPIC_MANIFESTS as gitFoundationsTopicManifests } from "./git/git-foundations/topics.generated";
import linuxTerminalFundamentals from "./linux/linux-terminal-fundamentals/subject.manifest.json";
import { TOPIC_MANIFESTS as linuxTerminalFundamentalsTopicManifests } from "./linux/linux-terminal-fundamentals/topics.generated";
import appliedPythonProjects from "./python/applied-python-projects/subject.manifest.json";
import { TOPIC_MANIFESTS as appliedPythonProjectsTopicManifests } from "./python/applied-python-projects/topics.generated";
import pythonDataFunctions from "./python/python-data-functions/subject.manifest.json";
import { TOPIC_MANIFESTS as pythonDataFunctionsTopicManifests } from "./python/python-data-functions/topics.generated";
import pythonV2 from "./python/python-v2/subject.manifest.json";
import { TOPIC_MANIFESTS as pythonV2TopicManifests } from "./python/python-v2/topics.generated";
import python from "./python/python/subject.manifest.json";
import { TOPIC_MANIFESTS as pythonTopicManifests } from "./python/python/topics.generated";
import multiTableSql from "./sql/multi-table-sql/subject.manifest.json";
import { TOPIC_MANIFESTS as multiTableSqlTopicManifests } from "./sql/multi-table-sql/topics.generated";
import sqlAnalysisReporting from "./sql/sql-analysis-reporting/subject.manifest.json";
import { TOPIC_MANIFESTS as sqlAnalysisReportingTopicManifests } from "./sql/sql-analysis-reporting/topics.generated";
import sqlDataManagement from "./sql/sql-data-management/subject.manifest.json";
import { TOPIC_MANIFESTS as sqlDataManagementTopicManifests } from "./sql/sql-data-management/topics.generated";
import sqlV2 from "./sql/sql-v2/subject.manifest.json";
import { TOPIC_MANIFESTS as sqlV2TopicManifests } from "./sql/sql-v2/topics.generated";
import sql from "./sql/sql/subject.manifest.json";
import { TOPIC_MANIFESTS as sqlTopicManifests } from "./sql/sql/topics.generated";


export type GeneratedSubjectGenKey = "c_course" | "git_course" | "bash_course" | "python_part1" | "sql_for_beginners";

export const SUBJECT_MANIFESTS: Record<string, SubjectManifest> = {
  "c-data-structures": cDataStructures as SubjectManifest,
  "git-foundations": gitFoundations as SubjectManifest,
  "linux-terminal-fundamentals": linuxTerminalFundamentals as SubjectManifest,
  "applied-python-projects": appliedPythonProjects as SubjectManifest,
  "python-data-functions": pythonDataFunctions as SubjectManifest,
  "python-v2": pythonV2 as SubjectManifest,
  "python": python as SubjectManifest,
  "multi-table-sql": multiTableSql as SubjectManifest,
  "sql-analysis-reporting": sqlAnalysisReporting as SubjectManifest,
  "sql-data-management": sqlDataManagement as SubjectManifest,
  "sql-v2": sqlV2 as SubjectManifest,
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
  "c-data-structures": {
    subjectSlug: "c-data-structures",
    genKey: "c_course",
    manifest: cDataStructures as SubjectManifest,
    topicManifests: cDataStructuresTopicManifests as TopicManifestRefMap,
  },
  "git-foundations": {
    subjectSlug: "git-foundations",
    genKey: "git_course",
    manifest: gitFoundations as SubjectManifest,
    topicManifests: gitFoundationsTopicManifests as TopicManifestRefMap,
  },
  "linux-terminal-fundamentals": {
    subjectSlug: "linux-terminal-fundamentals",
    genKey: "bash_course",
    manifest: linuxTerminalFundamentals as SubjectManifest,
    topicManifests: linuxTerminalFundamentalsTopicManifests as TopicManifestRefMap,
  },
  "applied-python-projects": {
    subjectSlug: "applied-python-projects",
    genKey: "python_part1",
    manifest: appliedPythonProjects as SubjectManifest,
    topicManifests: appliedPythonProjectsTopicManifests as TopicManifestRefMap,
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
  "python": {
    subjectSlug: "python",
    genKey: "python_part1",
    manifest: python as SubjectManifest,
    topicManifests: pythonTopicManifests as TopicManifestRefMap,
  },
  "multi-table-sql": {
    subjectSlug: "multi-table-sql",
    genKey: "sql_for_beginners",
    manifest: multiTableSql as SubjectManifest,
    topicManifests: multiTableSqlTopicManifests as TopicManifestRefMap,
  },
  "sql-analysis-reporting": {
    subjectSlug: "sql-analysis-reporting",
    genKey: "sql_for_beginners",
    manifest: sqlAnalysisReporting as SubjectManifest,
    topicManifests: sqlAnalysisReportingTopicManifests as TopicManifestRefMap,
  },
  "sql-data-management": {
    subjectSlug: "sql-data-management",
    genKey: "sql_for_beginners",
    manifest: sqlDataManagement as SubjectManifest,
    topicManifests: sqlDataManagementTopicManifests as TopicManifestRefMap,
  },
  "sql-v2": {
    subjectSlug: "sql-v2",
    genKey: "sql_for_beginners",
    manifest: sqlV2 as SubjectManifest,
    topicManifests: sqlV2TopicManifests as TopicManifestRefMap,
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
  "c_course": [SUBJECT_GENERATOR_SOURCES["c-data-structures"]],
  "git_course": [SUBJECT_GENERATOR_SOURCES["git-foundations"]],
  "bash_course": [SUBJECT_GENERATOR_SOURCES["linux-terminal-fundamentals"]],
  "python_part1": [SUBJECT_GENERATOR_SOURCES["applied-python-projects"], SUBJECT_GENERATOR_SOURCES["python-data-functions"], SUBJECT_GENERATOR_SOURCES["python-v2"], SUBJECT_GENERATOR_SOURCES["python"]],
  "sql_for_beginners": [SUBJECT_GENERATOR_SOURCES["multi-table-sql"], SUBJECT_GENERATOR_SOURCES["sql-analysis-reporting"], SUBJECT_GENERATOR_SOURCES["sql-data-management"], SUBJECT_GENERATOR_SOURCES["sql-v2"], SUBJECT_GENERATOR_SOURCES["sql"]],
};
