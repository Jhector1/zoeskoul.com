import {
  createApiClient,
} from "@zoeskoul/api-client";

export type StudentAnnouncement = {
  id: string;
  scope: "school" | "class";
  title: string;
  body: string;
  publishedAt: string;
  sourceName: string;
  authorName: string | null;
};

export async function loadUnreadStudentAnnouncements(
  apiOrigin: string,
) {
  const client = createApiClient({
    baseOrigin: apiOrigin,
  });

  return client.request<{
    announcements: StudentAnnouncement[];
  }>(
    "/api/student/announcements",
    {
      method: "GET",
      cache: "no-store",
    },
  );
}

export async function markStudentAnnouncementRead(
  apiOrigin: string,
  announcementId: string,
) {
  const client = createApiClient({
    baseOrigin: apiOrigin,
  });

  return client.request<{
    ok: true;
  }>(
    `/api/student/announcements/${encodeURIComponent(
      announcementId,
    )}/read`,
    {
      method: "POST",
    },
  );
}
