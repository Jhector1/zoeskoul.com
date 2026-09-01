export type StudentCampaignAudience = "all" | "free" | "plus";
export type StudentCampaignDisplayFrequency = "once" | "daily" | "always";

export type StudentCampaignProjection = {
  id: string;
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaHref: string | null;
  startsAt: string;
  endsAt: string;
  displayFrequency: StudentCampaignDisplayFrequency;
  tutoringGrantMinutes: number | null;
};

export function studentCampaignAudienceMatches(
  audience: StudentCampaignAudience,
  subscriber: boolean,
): boolean {
  if (audience === "all") return true;
  return audience === "plus" ? subscriber : !subscriber;
}

export function studentCampaignShouldDisplay(
  frequency: StudentCampaignDisplayFrequency,
  lastShownAt: Date | null,
  dontShowAgainAt: Date | null,
  now: Date,
): boolean {
  if (dontShowAgainAt) return false;
  if (frequency === "always") return true;
  if (!lastShownAt) return true;
  if (frequency === "once") return false;

  return (
    lastShownAt.getUTCFullYear() !== now.getUTCFullYear() ||
    lastShownAt.getUTCMonth() !== now.getUTCMonth() ||
    lastShownAt.getUTCDate() !== now.getUTCDate()
  );
}

export function isStudentCampaignAudience(
  value: unknown,
): value is StudentCampaignAudience {
  return value === "all" || value === "free" || value === "plus";
}

export function isStudentCampaignDisplayFrequency(
  value: unknown,
): value is StudentCampaignDisplayFrequency {
  return value === "once" || value === "daily" || value === "always";
}
