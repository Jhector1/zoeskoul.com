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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
