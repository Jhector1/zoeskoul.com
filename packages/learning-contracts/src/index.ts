export type LearningCourseStatus =
  | "active"
  | "coming_soon"
  | "disabled"
  | "draft"
  | "legacy";

export type LearningCourseSummary = {
  subjectId: string;
  slug: string;
  title: string;
  description: string;
  defaultModuleSlug: string | null;
  imagePublicId: string | null;
  imageAlt: string | null;
  status: LearningCourseStatus;
};

export type LearningAssignmentAvailability =
  | "draft"
  | "upcoming"
  | "open"
  | "past_due"
  | "closed";

export type LearningAssignmentSummary = {
  id: string;
  title: string;
  description: string | null;
  availability: LearningAssignmentAvailability;
  availableFrom: string | null;
  dueAt: string | null;
  enrolled: boolean;
  owner: {
    name: string | null;
    email: string | null;
  };
  subject: {
    slug: string;
    title: string;
    description: string | null;
    defaultModuleSlug: string | null;
  };
};

export type TutoringInvitationState =
  | "invited"
  | "viewed"
  | "declined"
  | "expired"
  | "cancelled";

export type LearningTutoringSummary = {
  id: string;
  title: string;
  description: string | null;
  status: "draft" | "live" | "shared";
  sourceSubjectSlug: string;
  moduleKeys: string[];
  updatedAt: string;
  owner: {
    name: string | null;
    email: string | null;
  };
  subject: {
    slug: string;
    title: string;
    description: string | null;
  };
  invitation: {
    id: string;
    state: TutoringInvitationState;
    emailStatus: "NOT_SENT" | "SENT" | "FAILED";
    expiresAt: string;
  } | null;
};

export type MyLearningResponse = {
  generatedAt: string;
  courses: LearningCourseSummary[];
  assignments: LearningAssignmentSummary[];
  tutoringSessions: LearningTutoringSummary[];
};

export type LearningModuleAccess = {
  ok: boolean;
  paid: boolean;
  reason: string;
};

export type LearningCourseModuleSummary = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  order: number;
  weekStart: number | null;
  weekEnd: number | null;
  sectionsCount: number;
  topicsCount: number;
  access: LearningModuleAccess;
};

export type LearningCourseOverviewResponse = {
  subject: {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    imagePublicId: string | null;
    imageAlt: string | null;
  };
  modules: LearningCourseModuleSummary[];
};

export type LearningModuleTopicSummary = {
  slug: string;
  title: string;
  order: number;
};

export type LearningModuleSectionSummary = {
  slug: string;
  title: string;
  description: string | null;
  order: number;
  topics: LearningModuleTopicSummary[];
};

export type LearningModuleOverviewResponse = {
  subject: LearningCourseOverviewResponse["subject"];
  module: {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    order: number;
    weekStart: number | null;
    weekEnd: number | null;
    meta: {
      estimatedMinutes: number | null;
      prereqs: string[];
      outcomes: string[];
      why: string[];
      videoUrl: string | null;
    };
  };
  stats: {
    sectionsCount: number;
    topicsCount: number;
  };
  access: LearningModuleAccess;
  sections: LearningModuleSectionSummary[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLearningModuleAccess(
  value: unknown,
): value is LearningModuleAccess {
  return (
    isRecord(value) &&
    typeof value.ok === "boolean" &&
    typeof value.paid === "boolean" &&
    typeof value.reason === "string"
  );
}

export function isMyLearningResponse(
  value: unknown,
): value is MyLearningResponse {
  if (!isRecord(value)) return false;

  return (
    typeof value.generatedAt === "string" &&
    Array.isArray(value.courses) &&
    Array.isArray(value.assignments) &&
    Array.isArray(value.tutoringSessions) &&
    value.courses.every(
      (course) =>
        isRecord(course) &&
        typeof course.subjectId === "string" &&
        typeof course.slug === "string" &&
        typeof course.title === "string",
    ) &&
    value.assignments.every(
      (assignment) =>
        isRecord(assignment) &&
        typeof assignment.id === "string" &&
        typeof assignment.title === "string",
    ) &&
    value.tutoringSessions.every(
      (session) =>
        isRecord(session) &&
        typeof session.id === "string" &&
        typeof session.title === "string",
    )
  );
}

export function isLearningCourseOverviewResponse(
  value: unknown,
): value is LearningCourseOverviewResponse {
  if (!isRecord(value) || !isRecord(value.subject)) return false;
  if (!Array.isArray(value.modules)) return false;

  return (
    typeof value.subject.id === "string" &&
    typeof value.subject.slug === "string" &&
    typeof value.subject.title === "string" &&
    value.modules.every(
      (module) =>
        isRecord(module) &&
        typeof module.id === "string" &&
        typeof module.slug === "string" &&
        typeof module.title === "string" &&
        typeof module.sectionsCount === "number" &&
        typeof module.topicsCount === "number" &&
        isLearningModuleAccess(module.access),
    )
  );
}

export function isLearningModuleOverviewResponse(
  value: unknown,
): value is LearningModuleOverviewResponse {
  if (
    !isRecord(value) ||
    !isRecord(value.subject) ||
    !isRecord(value.module) ||
    !isRecord(value.stats) ||
    !Array.isArray(value.sections)
  ) {
    return false;
  }

  return (
    typeof value.subject.id === "string" &&
    typeof value.subject.slug === "string" &&
    typeof value.module.id === "string" &&
    typeof value.module.slug === "string" &&
    typeof value.module.title === "string" &&
    typeof value.stats.sectionsCount === "number" &&
    typeof value.stats.topicsCount === "number" &&
    isLearningModuleAccess(value.access) &&
    value.sections.every(
      (section) =>
        isRecord(section) &&
        typeof section.slug === "string" &&
        typeof section.title === "string" &&
        Array.isArray(section.topics) &&
        section.topics.every(
          (topic) =>
            isRecord(topic) &&
            typeof topic.slug === "string" &&
            typeof topic.title === "string",
        ),
    )
  );
}
