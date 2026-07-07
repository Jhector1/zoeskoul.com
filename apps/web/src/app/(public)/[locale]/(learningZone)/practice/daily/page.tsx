import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import DailyFivePracticeClient from "./daily-five-practice-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DailyFivePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ subject?: string; module?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const session = await auth();

  if (!session?.user?.id) {
    const dailyQuery = new URLSearchParams();
    if (query.subject) dailyQuery.set("subject", query.subject);
    if (query.module) dailyQuery.set("module", query.module);
    const suffix = dailyQuery.toString() ? `?${dailyQuery.toString()}` : "";
    const callbackUrl = `/${encodeURIComponent(locale)}/practice/daily${suffix}`;
    redirect(
      `/${encodeURIComponent(locale)}/authenticate?${new URLSearchParams({
        callbackUrl,
        from: "daily-five",
      }).toString()}`,
    );
  }

  return (
    <DailyFivePracticeClient
      locale={locale}
      subjectSlug={query.subject ?? null}
    />
  );
}
