import type { CourseProfileId } from "./blueprint.js";
import type { SqlDatasetArtifact } from "./sql-dataset.js";

export type TopicSeedRuntimeDefaults =
    | {
  kind: "sql";
  datasetId?: string;
  fixedSqlDialect?: string;
  resultShape?: string;
}
    | {
  kind: "code";
  language?: string;
}
    | {
  kind: string;
  datasetId?: string;
  fixedSqlDialect?: string;
  resultShape?: string;
  language?: string;
};

export type TopicSeed = {
  subjectSlug: string;
  profileId: CourseProfileId;
  moduleSlug: string;
  sectionSlug: string;
  topicId: string;
  order: number;
  title: string;
  summary: string;
  minutes: number;

  moduleTitle?: string;
  modulePurpose?: string;
  moduleObjectives?: string[];
  guidedExercises?: string[];
  quizFocus?: string[];
  moduleProject?: string;
  sectionTitle?: string;

  sourceLocale?: string;
  targetLocales?: string[];

  messageBase?: string;
  learningGoals?: string[];




  moduleRuntimeDefaults?: TopicSeedRuntimeDefaults | null;




   moduleDataset?: SqlDatasetArtifact | null;


};