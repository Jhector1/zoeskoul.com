import type {
  NormalizedCoursePlan,
  TopicAuthoringDraft,
} from "@zoeskoul/curriculum-contracts";

export type GenerateJsonArgs = {
  system: string;
  user: string;
  schemaName:
      | "CoursePlan"
      | "NormalizedPlanRepair"
      | "TopicAuthoringDraft"
      | "TranslatedEntries"
      | "ExerciseRepair";
};

export type PlanRepairDraft = {
  repairedPlan: NormalizedCoursePlan;
  warnings: string[];
};

export type TranslatedEntries = {
  entries: Array<{
    key: string;
    value: string;
  }>;
};

export type AiProvider = {
  generateJson<T>(args: GenerateJsonArgs): Promise<T>;
};

export type TopicRetryContext = {
  attempt: number;
  maxRetries: number;
  previousErrorCode: string;
  previousErrorMessage: string;
};