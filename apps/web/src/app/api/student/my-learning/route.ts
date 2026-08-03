import type {
  LearningAssignmentSummary,
  LearningCourseSummary,
  LearningTutoringSummary,
  MyLearningResponse,
} from "@zoeskoul/learning-contracts";

import { getCurrentUserAccess } from "@/lib/access/currentUserAccess";
import {
  appCorsJson,
  appCorsPreflight,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import {
  loadAssignedLearningForUser,
  loadTutoringLearningForUser,
} from "@/lib/learning/myLearningData";
import {
  getEnrolledVisibleSubjectCardsForActor,
} from "@/lib/subjects/server/catalogVisibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_LOCALES = new Set([
  "en",
  "es",
  "fr",
  "ht",
]);

function requestLocale(request: Request): string {
  const value = new URL(request.url).searchParams
    .get("locale")
    ?.trim()
    .toLowerCase();

  return value && SUPPORTED_LOCALES.has(value)
    ? value
    : "en";
}

function isoDate(
  value: string | Date | null | undefined,
): string | null {
  if (!value) return null;

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
}

type RawCourse = {
  subjectId?: string | null;
  slug: string;
  title: string;
  description: string;
  defaultModuleSlug: string | null;
  imagePublicId: string | null;
  imageAlt: string | null;
  status:
    | "active"
    | "coming_soon"
    | "disabled"
    | "draft"
    | "legacy";
};

function serializeCourses(
  rows: readonly RawCourse[],
): LearningCourseSummary[] {
  return rows.flatMap((course) => {
    if (!course.subjectId) return [];

    return [{
      subjectId: course.subjectId,
      slug: course.slug,
      title: course.title,
      description: course.description,
      defaultModuleSlug: course.defaultModuleSlug,
      imagePublicId: course.imagePublicId,
      imageAlt: course.imageAlt,
      status: course.status,
    }];
  });
}

type RawAssignment = {
  id: string;
  title: string;
  description: string | null;
  availability:
    | "draft"
    | "upcoming"
    | "open"
    | "past_due"
    | "closed";
  availableFrom: string | Date | null;
  dueAt: string | Date | null;
  defaultModuleSlug: string | null;
  enrolled: boolean;
  owner: {
    name: string | null;
    email: string | null;
  };
  subject: {
    slug: string;
    title: string;
    description?: string | null;
  };
};

function serializeAssignments(
  rows: readonly RawAssignment[],
): LearningAssignmentSummary[] {
  return rows.map((assignment) => ({
    id: assignment.id,
    title: assignment.title,
    description: assignment.description,
    availability: assignment.availability,
    availableFrom: isoDate(assignment.availableFrom),
    dueAt: isoDate(assignment.dueAt),
    enrolled: assignment.enrolled,
    owner: {
      name: assignment.owner.name,
      email: assignment.owner.email,
    },
    subject: {
      slug: assignment.subject.slug,
      title: assignment.subject.title,
      description: assignment.subject.description ?? null,
      defaultModuleSlug: assignment.defaultModuleSlug,
    },
  }));
}

type RawTutoring = {
  id: string;
  title: string;
  description: string | null;
  status: "draft" | "live" | "shared";
  sourceSubjectSlug: string;
  moduleKeys: string[];
  updatedAt: string | Date;
  owner: {
    name: string | null;
    email: string | null;
  };
  subject: {
    slug: string;
    title: string;
    description?: string | null;
  };
  invitation: {
    id: string;
    state:
      | "invited"
      | "viewed"
      | "declined"
      | "expired"
      | "cancelled";
    emailStatus:
      | "NOT_SENT"
      | "SENT"
      | "FAILED";
    expiresAt: string | Date;
  } | null;
};

function serializeTutoring(
  rows: readonly RawTutoring[],
): LearningTutoringSummary[] {
  return rows.map((session) => ({
    id: session.id,
    title: session.title,
    description: session.description,
    status: session.status,
    sourceSubjectSlug: session.sourceSubjectSlug,
    moduleKeys: session.moduleKeys,
    updatedAt:
      isoDate(session.updatedAt) ??
      new Date(0).toISOString(),
    owner: {
      name: session.owner.name,
      email: session.owner.email,
    },
    subject: {
      slug: session.subject.slug,
      title: session.subject.title,
      description: session.subject.description ?? null,
    },
    invitation: session.invitation
      ? {
          id: session.invitation.id,
          state: session.invitation.state,
          emailStatus: session.invitation.emailStatus,
          expiresAt:
            isoDate(session.invitation.expiresAt) ??
            new Date(0).toISOString(),
        }
      : null,
  }));
}

export async function GET(request: Request) {
  if (!isAppOriginAllowed(request)) {
    return appCorsJson(
      request,
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  const access = await getCurrentUserAccess();

  if (!access.authenticated || !access.user) {
    return appCorsJson(
      request,
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  if (!access.capabilities.accessStudentApp) {
    return appCorsJson(
      request,
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  const locale = requestLocale(request);
  const [rawCourses, rawAssignments, rawTutoring] =
    await Promise.all([
      getEnrolledVisibleSubjectCardsForActor(),
      loadAssignedLearningForUser({
        userId: access.user.id,
        locale,
      }),
      loadTutoringLearningForUser({
        userId: access.user.id,
        locale,
      }),
    ]);

  const response: MyLearningResponse = {
    generatedAt: new Date().toISOString(),
    courses: serializeCourses(
      rawCourses as unknown as RawCourse[],
    ),
    assignments: serializeAssignments(
      rawAssignments as unknown as RawAssignment[],
    ),
    tutoringSessions: serializeTutoring(
      rawTutoring as unknown as RawTutoring[],
    ),
  };

  return appCorsJson(request, response);
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
