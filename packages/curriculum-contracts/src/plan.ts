import type {
  BlueprintRuntimePolicy,
  CourseProfileId,
  CourseVersionStatus,
} from "./blueprint.js";

export type PlannedTopic = {
  topicId: string;
  order: number;
  title: string;
  summary: string;
  minutes: number;
  learningGoals: string[];
};

export type PlannedSection = {
  sectionSlug: string;
  order: number;
  title: string;
  description?: string;

  weekStart?: number | null;
  weekEnd?: number | null;
  weeksLabel?: string | null;

  bullets?: string[];

  topics: PlannedTopic[];
};

export type PlannedModuleRuntimePolicy = Omit<BlueprintRuntimePolicy, "moduleDatasetIds">;

export type PlannedModule = {
  moduleSlug: string;
  prefix: string;
  order: number;
  title: string;
  description?: string;
  purpose?: string;
  learningObjectives?: string[];
  guidedExercises?: string[];
  quizFocus?: string[];
  moduleProject?: string;
  weekStart?: number | null;
  weekEnd?: number | null;
  runtimePolicy?: PlannedModuleRuntimePolicy;
  sections: PlannedSection[];
};

export type CoursePlan = {
  subjectSlug: string;
  profileId: CourseProfileId;
  modules: PlannedModule[];
};

export type NormalizedCoursePlan = CoursePlan;

export type SubjectPlan = {
  subjectSlug: string;
  catalogSlug?: string;
  profileId: string;
  courseOrder: string[];
  courses?: Array<{
    courseSlug: string;
    title?: string;
    order?: number;
    path?: string;
  }>;
  publishTarget: {
    liveSubjectSlug: string;
    courseSlug: string;
    channel: "current" | "draft" | "preview";
  };
  versioning?: {
    family: string;
    version: number;
    status: CourseVersionStatus;
    defaultForNewEnrollments?: boolean;
    supersedes?: string | null;
    supersededBy?: string | null;
  };
};
