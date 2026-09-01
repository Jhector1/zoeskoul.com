import { createApiClient } from "@zoeskoul/api-client";

export type StudentCampaign = {
  id: string;
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaHref: string | null;
  startsAt: string;
  endsAt: string;
  displayFrequency:
    | "once"
    | "daily"
    | "always";
  tutoringGrantMinutes: number | null;
};

export async function loadActiveStudentCampaigns(
  apiOrigin: string,
) {
  const client = createApiClient({
    baseOrigin: apiOrigin,
  });

  return client.request<{
    campaigns: StudentCampaign[];
  }>(
    "/api/student-campaigns/active",
    {
      method: "GET",
      cache: "no-store",
    },
  );
}

export async function recordStudentCampaignEvent(
  apiOrigin: string,
  campaignId: string,
  event:
    | "impression"
    | "dismiss"
    | "dont_show_again",
) {
  const client = createApiClient({
    baseOrigin: apiOrigin,
  });

  await client.request<{ ok: true }>(
    `/api/student-campaigns/${encodeURIComponent(
      campaignId,
    )}/events`,
    {
      method: "POST",
      json: { event },
    },
  );
}
