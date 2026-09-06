import {
  createApiClient,
} from "@zoeskoul/api-client";

export type TeacherAnnouncementScope =
  | "school"
  | "class";

export type TeacherAnnouncement = {
  id: string;
  scope: TeacherAnnouncementScope;
  title: string;
  body: string;
  publishedAt: string;
  authorName: string | null;
  recipientCount: number;
  readCount: number;
};

export function createTeacherAnnouncementsClient(
  args: {
    apiOrigin: string;
    fetchImpl?: typeof globalThis.fetch;
  },
) {
  const api = createApiClient({
    baseOrigin: args.apiOrigin,
    fetchImpl: args.fetchImpl,
  });

  function base(
    scope: TeacherAnnouncementScope,
    targetId: string,
  ) {
    return scope === "school"
      ? `/api/teacher/schools/${encodeURIComponent(
          targetId,
        )}/announcements`
      : `/api/teacher/learning-groups/${encodeURIComponent(
          targetId,
        )}/announcements`;
  }

  return {
    list(
      scope: TeacherAnnouncementScope,
      targetId: string,
    ) {
      return api.request<{
        announcements: TeacherAnnouncement[];
      }>(
        base(scope, targetId),
        {
          method: "GET",
          cache: "no-store",
        },
      );
    },

    publish(
      scope: TeacherAnnouncementScope,
      targetId: string,
      input: {
        title: string;
        body: string;
      },
    ) {
      return api.request<{
        announcement: {
          id: string;
          recipientCount: number;
          publishedAt: string;
        };
      }>(
        base(scope, targetId),
        {
          method: "POST",
          json: input,
        },
      );
    },
  };
}
