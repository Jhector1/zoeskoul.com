import {
  createApiClient,
} from "@zoeskoul/api-client";

export type TeacherSchoolCourse = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  visibility: string;
  enabled: boolean;
};

export function createTeacherSchoolCoursesClient(
  args: {
    apiOrigin: string;
    fetchImpl?:
      typeof globalThis.fetch;
  },
) {
  const api = createApiClient({
    baseOrigin: args.apiOrigin,
    fetchImpl: args.fetchImpl,
  });

  function base(
    schoolId: string,
  ) {
    return `/api/teacher/schools/${encodeURIComponent(
      schoolId,
    )}/courses`;
  }

  return {
    list(
      schoolId: string,
      locale: string,
    ) {
      return api.request<{
        courses:
          TeacherSchoolCourse[];
        canManage: boolean;
      }>(
        `${base(
          schoolId,
        )}?locale=${encodeURIComponent(
          locale,
        )}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );
    },

    enable(
      schoolId: string,
      subjectId: string,
    ) {
      return api.request<{
        ok: true;
      }>(
        base(schoolId),
        {
          method: "POST",
          json: { subjectId },
        },
      );
    },

    disable(
      schoolId: string,
      subjectId: string,
    ) {
      return api.request<{
        ok: true;
      }>(
        base(schoolId),
        {
          method: "DELETE",
          json: { subjectId },
        },
      );
    },
  };
}
