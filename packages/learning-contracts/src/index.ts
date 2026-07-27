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

export type LearningLessonTextCard = {
  type: "text";
  id: string;
  title: string | null;
  markdown: string;
  runtimeRequired: boolean;
};

export type LearningLessonVideoCard = {
  type: "video";
  id: string;
  title: string | null;
  url: string;
  provider: string;
  startSeconds: number | null;
  posterUrl: string | null;
  captionMarkdown: string | null;
};

export type LearningLessonRuntimeCard = {
  type: "runtime";
  id: string;
  title: string | null;
  runtimeKind: "sketch" | "quiz" | "project";
};

export type LearningLessonCard =
  | LearningLessonTextCard
  | LearningLessonVideoCard
  | LearningLessonRuntimeCard;

export type LearningLessonTopic = {
  slug: string;
  title: string;
  summary: string | null;
  order: number;
  cards: LearningLessonCard[];
};

export type LearningLessonSection = {
  slug: string;
  title: string;
  description: string | null;
  order: number;
  topics: LearningLessonTopic[];
};

export type LearningLessonContentResponse = {
  subject: LearningCourseOverviewResponse["subject"];
  module: LearningModuleOverviewResponse["module"];
  access: LearningModuleAccess;
  sections: LearningLessonSection[];
};

function isNullableString(
  value: unknown,
): value is string | null {
  return value === null || typeof value === "string";
}

function isLearningLessonCard(
  value: unknown,
): value is LearningLessonCard {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !isNullableString(value.title) ||
    typeof value.type !== "string"
  ) {
    return false;
  }

  if (value.type === "text") {
    return (
      typeof value.markdown === "string" &&
      typeof value.runtimeRequired === "boolean"
    );
  }

  if (value.type === "video") {
    return (
      typeof value.url === "string" &&
      typeof value.provider === "string" &&
      (
        value.startSeconds === null ||
        typeof value.startSeconds === "number"
      ) &&
      isNullableString(value.posterUrl) &&
      isNullableString(value.captionMarkdown)
    );
  }

  if (value.type === "runtime") {
    return (
      value.runtimeKind === "sketch" ||
      value.runtimeKind === "quiz" ||
      value.runtimeKind === "project"
    );
  }

  return false;
}

export function isLearningLessonContentResponse(
  value: unknown,
): value is LearningLessonContentResponse {
  if (
    !isRecord(value) ||
    !isRecord(value.subject) ||
    !isRecord(value.module) ||
    !isLearningModuleAccess(value.access) ||
    !Array.isArray(value.sections)
  ) {
    return false;
  }

  return (
    typeof value.subject.id === "string" &&
    typeof value.subject.slug === "string" &&
    typeof value.subject.title === "string" &&
    typeof value.module.id === "string" &&
    typeof value.module.slug === "string" &&
    typeof value.module.title === "string" &&
    value.sections.every(
      (section) =>
        isRecord(section) &&
        typeof section.slug === "string" &&
        typeof section.title === "string" &&
        isNullableString(section.description) &&
        typeof section.order === "number" &&
        Array.isArray(section.topics) &&
        section.topics.every(
          (topic) =>
            isRecord(topic) &&
            typeof topic.slug === "string" &&
            typeof topic.title === "string" &&
            isNullableString(topic.summary) &&
            typeof topic.order === "number" &&
            Array.isArray(topic.cards) &&
            topic.cards.every(isLearningLessonCard),
        ),
    )
  );
}
