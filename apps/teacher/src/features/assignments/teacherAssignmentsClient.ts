import {
  createApiClient,
} from "@zoeskoul/api-client";

export type TeacherAssignmentStatus =
  | "draft"
  | "assigned"
  | "closed";

export type TeacherSolutionVisibility =
  | "instructor_only"
  | "after_completion"
  | "after_due_date"
  | "always";

export type TeacherAssignmentCourse = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  visibility: string;
};

export type TeacherAssignmentInvite = {
  id: string;
  email: string;
  expiresAt: string;
  sentAt: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
};

export type TeacherAssignment = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  subjectId: string;
  status: TeacherAssignmentStatus;
  availableFrom: string | null;
  dueAt: string | null;
  solutionVisibility:
    TeacherSolutionVisibility;
  subject: TeacherAssignmentCourse;
  users: Array<{
    user: {
      id: string;
      name: string | null;
      email: string | null;
    };
  }>;
  groups: Array<{
    groupId: string;
    group: {
      id: string;
      name: string;
      slug: string;
      organizationId?: string | null;
      organization?: {
        id: string;
        name: string;
        slug: string;
      } | null;
    };
  }>;
  invites: TeacherAssignmentInvite[];
};

export type TeacherAssignmentInput = {
  slug: string;
  title: string;
  description: string | null;
  subjectId: string;
  status: TeacherAssignmentStatus;
  availableFrom: string | null;
  dueAt: string | null;
  solutionVisibility:
    TeacherSolutionVisibility;
  userEmails: string[];
  groupIds: string[];
};

export type TeacherAssignmentInviteDelivery =
  | {
      ok: true;
      inviteUrl: string;
      mailtoHref: string;
      expiresAt: string;
      delivery: "link";
    }
  | {
      ok: true;
      inviteUrl: string;
      mailtoHref: string;
      expiresAt: string;
      delivery: "email";
      sentAt: string;
      emailProvider?: string;
      emailMessageId?: string;
    };

export function createTeacherAssignmentsClient(args: {
  apiOrigin: string;
  fetchImpl?: typeof globalThis.fetch;
}) {
  const api = createApiClient({
    baseOrigin: args.apiOrigin,
    fetchImpl: args.fetchImpl,
  });

  return {
    async list(locale: string) {
      return api.request<{
        assignments:
          TeacherAssignment[];
      }>(
        `/api/teacher/course-assignments?locale=${encodeURIComponent(locale)}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );
    },

    async editorBootstrap(
      locale: string,
    ) {
      return api.request<{
        assignments:
          TeacherAssignment[];
        courses:
          TeacherAssignmentCourse[];
      }>(
        `/api/teacher/course-assignments?editor=1&locale=${encodeURIComponent(locale)}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );
    },

    async get(
      assignmentId: string,
      locale: string,
    ) {
      return api.request<{
        assignment:
          TeacherAssignment;
      }>(
        `/api/teacher/course-assignments/${encodeURIComponent(assignmentId)}?locale=${encodeURIComponent(locale)}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );
    },

    async create(
      input: TeacherAssignmentInput,
    ) {
      return api.request<{
        assignment:
          TeacherAssignment;
        pendingInvites: string[];
      }>(
        "/api/teacher/course-assignments",
        {
          method: "POST",
          json: input,
        },
      );
    },

    async update(
      assignmentId: string,
      input: TeacherAssignmentInput,
    ) {
      return api.request<{
        assignment:
          TeacherAssignment;
        pendingInvites: string[];
      }>(
        `/api/teacher/course-assignments/${encodeURIComponent(assignmentId)}`,
        {
          method: "PATCH",
          json: input,
        },
      );
    },

    async remove(
      assignmentId: string,
    ) {
      return api.request<{
        ok: true;
      }>(
        `/api/teacher/course-assignments/${encodeURIComponent(assignmentId)}`,
        {
          method: "DELETE",
        },
      );
    },

    async deliverInvite(
      assignmentId: string,
      input: {
        email: string;
        action: "link" | "email";
        locale:
          | "en"
          | "es"
          | "fr"
          | "ht";
      },
    ) {
      return api.request<
        TeacherAssignmentInviteDelivery
      >(
        `/api/teacher/course-assignments/${encodeURIComponent(assignmentId)}/invites`,
        {
          method: "POST",
          json: input,
        },
      );
    },
  };
}
