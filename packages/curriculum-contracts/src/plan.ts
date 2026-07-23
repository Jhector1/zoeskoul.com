import type {
  BlueprintRuntimePolicy,
  CourseProfileId,
  CourseVersionStatus,
} from "./blueprint.js";
import type { PracticeConfig } from "./practice.js";
import type { CourseSpecProjectBrief, CourseSpecTopicProjectJourney } from "./course-spec.js";
import type { ToolPresentationPolicy } from "./tool-presentation.js";

export type PlannedTopic = {
  topicId: string;
  order: number;
  title: string;
  summary: string;
  minutes: number;
  technical?: boolean;
  learningGoals: string[];
  practice?: PracticeConfig;
  projectBrief?: CourseSpecProjectBrief | null;
  projectJourney?: CourseSpecTopicProjectJourney;
  tools?: ToolPresentationPolicy;
  lessonTools?: Record<string, ToolPresentationPolicy>;
  exerciseTools?: Record<string, ToolPresentationPolicy>;
};

export type PlannedSection = {
  sectionSlug: string;
  order: number;
  title: string;
  description?: string;
  role?: "lesson" | "module_project" | "capstone";

  weekStart?: number | null;
  weekEnd?: number | null;
  weeksLabel?: string | null;

  bullets?: string[];
  practiceDefaults?: PracticeConfig;
  tools?: ToolPresentationPolicy;

  topics: PlannedTopic[];
};

export type PlannedModuleRuntimePolicy = Omit<BlueprintRuntimePolicy, "moduleDatasetIds">;

export type PlannedModule = {
  moduleSlug: string;
  /**
   * Optional display/logical module number from course.spec.json.
   * Courses that continue a sequence may render modules 8-11 while still
   * sorting within this course by order 1-4. Policy lookup should prefer
   * this value when present.
   */
  moduleNumber?: number;
  prefix: string;
  order: number;
  role?: "standard" | "capstone";
  accessOverride?: "free" | "paid" | null;
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
  practiceDefaults?: PracticeConfig;
  tools?: ToolPresentationPolicy;
  sections: PlannedSection[];
};

export type CoursePlan = {
  subjectSlug: string;
  /** Effective subject + course Tools defaults. */
  tools?: ToolPresentationPolicy;
  profileId: CourseProfileId;
  modules: PlannedModule[];
};

export type NormalizedCoursePlan = CoursePlan;

export type SubjectPlan = {
  subjectSlug: string;
  catalogSlug?: string;
  profileId: string;
  accessPolicy?: "free" | "paid";
  visibility?: "public" | "private" | "organization";
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
