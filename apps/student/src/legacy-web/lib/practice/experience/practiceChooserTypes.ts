export type PracticeChooserAvailability = "available" | "locked" | "unavailable";

export type PracticeChooserTopic = {
  slug: string;
  title: string;
  titleKey: string | null;
  description: string | null;
  exerciseCount: number;
  dailyExerciseCount: number;
};

export type PracticeChooserSection = {
  slug: string;
  title: string;
  titleKey: string | null;
  exerciseCount: number;
  dailyExerciseCount: number;
  topics: PracticeChooserTopic[];
};

export type PracticeChooserModule = {
  slug: string;
  title: string;
  titleKey: string | null;
  availability: PracticeChooserAvailability;
  billingHref: string | null;
  exerciseCount: number;
  dailyExerciseCount: number;
  sections: PracticeChooserSection[];
};

export type PracticeChooserCourse = {
  slug: string;
  title: string;
  titleKey: string | null;
  catalogSlug: string;
  catalogTitle: string;
  exerciseCount: number;
  dailyExerciseCount: number;
  modules: PracticeChooserModule[];
};

export type PracticeChooserCatalog = {
  slug: string;
  title: string;
  titleKey: string | null;
  exerciseCount: number;
  dailyExerciseCount: number;
  courses: PracticeChooserCourse[];
};

export type PracticeChooserSelection = {
  catalogSlug: string;
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug: string;
  topicSlug: string;
};

export type PracticeChooserMode = "subscriber" | "free";

export type SubscriberPracticeSessionSummary = {
  sessionId: string;
  selection: PracticeChooserSelection;
  catalogTitle: string;
  catalogTitleKey: string | null;
  courseTitle: string;
  courseTitleKey: string | null;
  moduleTitle: string;
  moduleTitleKey: string | null;
  sectionTitle: string;
  sectionTitleKey: string | null;
  topicTitle: string;
  topicTitleKey: string | null;
  completedCount: number;
  totalCount: number;
  lastOpenedAt: string;
};
