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

export type LearningRuntimeKind =
  | "sketch"
  | "quiz"
  | "project"
  | "try_it";

export type LearningRuntimeTarget = {
  version: 1;
  sectionSlug: string;
  topicSlug: string;
  ownerCardId: string;
  targetKind: "card" | "embedded_try_it";
  targetId: string;
  runtimeKind: LearningRuntimeKind;
};

/**
 * These fields are intentionally forbidden from the lesson-outline response.
 *
 * Runtime payloads are fetched through a separate protected boundary later.
 * The lesson response may expose stable target identity, but never authored
 * answers, solutions, validation recipes, hidden tests, or starter workspaces.
 */
export const LEARNING_LESSON_FORBIDDEN_FIELDS = [
  "answerKey",
  "checkSql",
  "correctAnswer",
  "expectedSolution",
  "hiddenTests",
  "recipe",
  "revealAnswer",
  "solutionCode",
  "solutionFiles",
  "sourceChecks",
  "spec",
  "starterCode",
  "starterFiles",
  "tests",
  "tryIt",
  "workspace",
] as const;

const learningLessonForbiddenFieldSet = new Set<string>(
  LEARNING_LESSON_FORBIDDEN_FIELDS,
);

export function hasForbiddenLearningLessonFields(
  value: unknown,
): boolean {
  if (Array.isArray(value)) {
    return value.some(hasForbiddenLearningLessonFields);
  }

  if (!isRecord(value)) return false;

  for (const [key, nested] of Object.entries(value)) {
    if (learningLessonForbiddenFieldSet.has(key)) {
      return true;
    }

    if (hasForbiddenLearningLessonFields(nested)) {
      return true;
    }
  }

  return false;
}

export type LearningLessonTextCard = {
  type: "text";
  id: string;
  title: string | null;
  markdown: string;
  runtimeRequired: boolean;
  runtime: LearningRuntimeTarget | null;
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
  runtime: LearningRuntimeTarget;
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

export function isLearningRuntimeTarget(
  value: unknown,
): value is LearningRuntimeTarget {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.sectionSlug === "string" &&
    typeof value.topicSlug === "string" &&
    typeof value.ownerCardId === "string" &&
    (
      value.targetKind === "card" ||
      value.targetKind === "embedded_try_it"
    ) &&
    typeof value.targetId === "string" &&
    (
      value.runtimeKind === "sketch" ||
      value.runtimeKind === "quiz" ||
      value.runtimeKind === "project" ||
      value.runtimeKind === "try_it"
    )
  );
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
    if (
      typeof value.markdown !== "string" ||
      typeof value.runtimeRequired !== "boolean"
    ) {
      return false;
    }

    if (!value.runtimeRequired) {
      return value.runtime === null;
    }

    return (
      isLearningRuntimeTarget(value.runtime) &&
      value.runtime.ownerCardId === value.id &&
      value.runtime.targetKind === "embedded_try_it" &&
      value.runtime.runtimeKind === "try_it"
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
    if (
      value.runtimeKind !== "sketch" &&
      value.runtimeKind !== "quiz" &&
      value.runtimeKind !== "project"
    ) {
      return false;
    }

    return (
      isLearningRuntimeTarget(value.runtime) &&
      value.runtime.ownerCardId === value.id &&
      value.runtime.targetKind === "card" &&
      value.runtime.targetId === value.id &&
      value.runtime.runtimeKind === value.runtimeKind
    );
  }

  return false;
}

export function isLearningLessonContentResponse(
  value: unknown,
): value is LearningLessonContentResponse {
  if (hasForbiddenLearningLessonFields(value)) {
    return false;
  }

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

export const LEARNING_PRACTICE_EXERCISE_KINDS = [
  "single_choice",
  "multi_choice",
  "numeric",
  "vector_drag_target",
  "vector_drag_dot",
  "matrix_input",
  "code_input",
  "text_input",
  "drag_reorder",
  "voice_input",
  "word_bank_arrange",
  "listen_build",
  "fill_blank_choice",
] as const;

export type LearningPracticeExerciseKind =
  (typeof LEARNING_PRACTICE_EXERCISE_KINDS)[number];

export const LEARNING_PRACTICE_FORBIDDEN_FIELDS = [
  "answer",
  "answerId",
  "answerKey",
  "checkSql",
  "correct",
  "correctAnswer",
  "correctValue",
  "expected",
  "expectedAnswerPayload",
  "expectedSolution",
  "hiddenTests",
  "recipe",
  "reveal",
  "revealAnswer",
  "secretPayload",
  "solutionCode",
  "solutionFiles",
  "sourceChecks",
  "tests",
] as const;

const learningPracticeForbiddenFieldSet = new Set<string>(
  LEARNING_PRACTICE_FORBIDDEN_FIELDS,
);

export type LearningPracticeExercise = {
  id: string;
  exerciseKey: string | null;
  kind: LearningPracticeExerciseKind;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  title: string;
  prompt: string;
  payload: Record<string, unknown>;
};

export function hasForbiddenLearningPracticeFields(
  value: unknown,
): boolean {
  if (Array.isArray(value)) {
    return value.some(hasForbiddenLearningPracticeFields);
  }

  if (!isRecord(value)) return false;

  for (const [key, nested] of Object.entries(value)) {
    if (learningPracticeForbiddenFieldSet.has(key)) {
      return true;
    }

    if (hasForbiddenLearningPracticeFields(nested)) {
      return true;
    }
  }

  return false;
}

export function isLearningPracticeExercise(
  value: unknown,
): value is LearningPracticeExercise {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !(
      value.exerciseKey === null ||
      typeof value.exerciseKey === "string"
    ) ||
    !LEARNING_PRACTICE_EXERCISE_KINDS.includes(
      value.kind as LearningPracticeExerciseKind,
    ) ||
    typeof value.topic !== "string" ||
    (
      value.difficulty !== "easy" &&
      value.difficulty !== "medium" &&
      value.difficulty !== "hard"
    ) ||
    typeof value.title !== "string" ||
    typeof value.prompt !== "string" ||
    !isRecord(value.payload)
  ) {
    return false;
  }

  return !hasForbiddenLearningPracticeFields(value);
}

export type LearningRuntimeLaunchActivity = {
  kind: "legacy_handoff";
  href: string;
  reason: "runtime_not_migrated";
};

export type LearningRuntimeLaunchResponse = {
  target: LearningRuntimeTarget;
  title: string | null;
  activity: LearningRuntimeLaunchActivity;
};

export function isLearningRuntimeLaunchResponse(
  value: unknown,
): value is LearningRuntimeLaunchResponse {
  return (
    isRecord(value) &&
    isLearningRuntimeTarget(value.target) &&
    isNullableString(value.title) &&
    isRecord(value.activity) &&
    value.activity.kind === "legacy_handoff" &&
    typeof value.activity.href === "string" &&
    value.activity.href.startsWith("/") &&
    value.activity.reason === "runtime_not_migrated" &&
    !hasForbiddenLearningLessonFields(value) &&
    !hasForbiddenLearningPracticeFields(value)
  );
}

// ---------------------------------------------------------------------------
// Protected Vite practice gateway contracts.
// ---------------------------------------------------------------------------

export type LearningSimplePracticeAnswer =
  | {
      kind: "single_choice";
      optionId: string;
    }
  | {
      kind: "multi_choice";
      optionIds: string[];
    }
  | {
      kind: "numeric";
      value: number;
    };

export type LearningPracticeLaunchResponse = {
  target: LearningRuntimeTarget;
  title: string | null;
  exercise: LearningPracticeExercise;
  key: string;
  sessionId: string | null;
  run: Record<string, unknown> | null;
  validationPath:
    "/api/student/runtime/practice/validate";
};

export type LearningPracticeValidationAttempts = {
  used: number;
  max: number | null;
  left: number | null;
};

export type LearningPracticeValidationResponse = {
  ok: boolean | null;
  message: string | null;
  code: string | null;
  explanation: string | null;
  feedback: unknown;
  finalized: boolean;
  duplicate: boolean;
  attempts: LearningPracticeValidationAttempts | null;
  sessionComplete: boolean;
  requestId: string | null;
};

function isLearningNullableString(
  value: unknown,
): value is string | null {
  return value === null || typeof value === "string";
}

function isLearningNullableFiniteNumber(
  value: unknown,
): value is number | null {
  return (
    value === null ||
    (
      typeof value === "number" &&
      Number.isFinite(value)
    )
  );
}

export function isLearningSimplePracticeAnswer(
  value: unknown,
): value is LearningSimplePracticeAnswer {
  if (!isRecord(value)) return false;

  if (value.kind === "single_choice") {
    return typeof value.optionId === "string";
  }

  if (value.kind === "multi_choice") {
    return (
      Array.isArray(value.optionIds) &&
      value.optionIds.every(
        (optionId) => typeof optionId === "string",
      )
    );
  }

  return (
    value.kind === "numeric" &&
    typeof value.value === "number" &&
    Number.isFinite(value.value)
  );
}

export function isLearningPracticeLaunchResponse(
  value: unknown,
): value is LearningPracticeLaunchResponse {
  if (!isRecord(value)) return false;

  return (
    isLearningRuntimeTarget(value.target) &&
    isLearningNullableString(value.title) &&
    isLearningPracticeExercise(value.exercise) &&
    !hasForbiddenLearningPracticeFields(
      value.exercise,
    ) &&
    typeof value.key === "string" &&
    value.key.length >= 16 &&
    isLearningNullableString(value.sessionId) &&
    (
      value.run === null ||
      (
        isRecord(value.run) &&
        !Array.isArray(value.run)
      )
    ) &&
    value.validationPath ===
      "/api/student/runtime/practice/validate"
  );
}

export function isLearningPracticeValidationResponse(
  value: unknown,
): value is LearningPracticeValidationResponse {
  if (!isRecord(value)) return false;

  const attempts = value.attempts;
  const attemptsValid =
    attempts === null ||
    (
      isRecord(attempts) &&
      typeof attempts.used === "number" &&
      Number.isFinite(attempts.used) &&
      isLearningNullableFiniteNumber(attempts.max) &&
      isLearningNullableFiniteNumber(attempts.left)
    );

  return (
    (
      value.ok === null ||
      typeof value.ok === "boolean"
    ) &&
    isLearningNullableString(value.message) &&
    isLearningNullableString(value.code) &&
    isLearningNullableString(value.explanation) &&
    typeof value.finalized === "boolean" &&
    typeof value.duplicate === "boolean" &&
    attemptsValid &&
    typeof value.sessionComplete === "boolean" &&
    isLearningNullableString(value.requestId)
  );
}
