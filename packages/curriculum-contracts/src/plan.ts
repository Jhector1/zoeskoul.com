import type { CourseProfileId } from "./blueprint.js";

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
  topics: PlannedTopic[];
};

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
  sections: PlannedSection[];
};

export type CoursePlan = {
  subjectSlug: string;
  profileId: CourseProfileId;
  modules: PlannedModule[];
};

export type NormalizedCoursePlan = CoursePlan;
