import {
  createApiClient,
} from "@zoeskoul/api-client";

export type TeacherClassMember = {
  id: string;
  userId?: string;
  role?: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  };
};

export type TeacherSchool = {
  id: string;
  slug: string;
  name: string;
};

export type TeacherClassInvite = {
  id: string;
  email: string;
  expiresAt: string;
  sentAt: string | null;
  acceptedAt: string | null;
  acceptedByUserId?: string | null;
  revokedAt: string | null;
};

export type TeacherClassInviteDelivery = {
  ok: true;
  inviteUrl: string;
  mailtoHref: string;
  expiresAt: string;
  delivery: "link" | "email";
  sentAt?: string;
  emailProvider?: string;
  emailMessageId?: string | null;
};

export type TeacherClass = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  ownerId?: string;
  organizationId?: string | null;
  organization?: TeacherSchool | null;
  members: TeacherClassMember[];
  invites?: TeacherClassInvite[];
  _count?: {
    assignments: number;
  };
};

export type TeacherClassProgressStatus =
  | "not_started"
  | "in_progress"
  | "completed";

export type TeacherClassDashboard = {
  class: {
    id: string;
    name: string;
  };
  summary: {
    students: number;
    assignments: number;
    averageProgressPct: number;
    averageAccuracyPct: number;
  };
  assignments: Array<{
    id: string;
    title: string;
    status: string;
    availableFrom: string | null;
    dueAt: string | null;
    subjectId: string;
    subjectSlug: string;
    subjectTitle: string;
    totalModules: number;
    averageProgressPct: number;
  }>;
  students: Array<{
    userId: string;
    name: string | null;
    email: string | null;
    totalXp: number;
    lastActivityAt: string | null;
    assignments: Array<{
      assignmentId: string;
      status: TeacherClassProgressStatus;
      progressPct: number;
      completedModules: number;
      totalModules: number;
      attempts: number;
      correct: number;
      accuracyPct: number;
      lastActivityAt: string | null;
    }>;
  }>;
};

export type TeacherClassInput = {
  slug: string;
  name: string;
  description: string | null;
  organizationId: string | null;
  memberEmails: string[];
};

export function createTeacherClassesClient(args: {
  apiOrigin: string;
  fetchImpl?: typeof globalThis.fetch;
}) {
  const api = createApiClient({
    baseOrigin: args.apiOrigin,
    fetchImpl: args.fetchImpl,
  });

  return {
    async listSchools() {
      return api.request<{
        schools: TeacherSchool[];
      }>(
        "/api/teacher/schools",
        {
          method: "GET",
          cache: "no-store",
        },
      );
    },

    async list() {
      return api.request<{
        groups: TeacherClass[];
      }>(
        "/api/teacher/learning-groups",
        {
          method: "GET",
          cache: "no-store",
        },
      );
    },

    async get(classId: string) {
      return api.request<{
        group: TeacherClass;
      }>(
        `/api/teacher/learning-groups/${encodeURIComponent(classId)}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );
    },

    async create(
      input: TeacherClassInput,
    ) {
      return api.request<{
        group: TeacherClass;
      }>(
        "/api/teacher/learning-groups",
        {
          method: "POST",
          json: input,
        },
      );
    },

    async update(
      classId: string,
      input: TeacherClassInput,
    ) {
      return api.request<{
        group: TeacherClass;
      }>(
        `/api/teacher/learning-groups/${encodeURIComponent(classId)}`,
        {
          method: "PATCH",
          json: input,
        },
      );
    },

async deliverInvite(
  classId: string,
  input: {
    email: string;
    action: "link" | "email";
    locale: "en" | "es" | "fr" | "ht";
  },
) {
  return api.request<TeacherClassInviteDelivery>(
    `/api/teacher/learning-groups/${encodeURIComponent(classId)}/invites`,
    { method: "POST", json: input },
  );
},

    async getDashboard(classId: string) {
      return api.request<{
        dashboard: TeacherClassDashboard;
      }>(
        `/api/teacher/learning-groups/${encodeURIComponent(classId)}/dashboard`,
        {
          method: "GET",
          cache: "no-store",
        },
      );
    },

    async remove(classId: string) {
      return api.request<{
        ok: true;
      }>(
        `/api/teacher/learning-groups/${encodeURIComponent(classId)}`,
        {
          method: "DELETE",
        },
      );
    },
  };
}
