import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolvePracticeViewer } from "@/lib/practice/experience/viewer";
import { loadPracticeChooser } from "@/lib/practice/experience/practiceChooser.server";
import { DAILY_PRACTICE_TARGET_COUNT } from "@/lib/practice/experience/config";
import { loadActiveSubscriberPracticeSessions } from "@/lib/practice/experience/subscriberPracticeSessions.server";
import DailyFivePracticeClient from "./daily-five-practice-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DailyFivePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    catalog?: string;
    subject?: string;
    module?: string;
    section?: string;
    topic?: string;
  }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) {
    const dailyQuery = new URLSearchParams();
    if (query.catalog) dailyQuery.set("catalog", query.catalog);
    if (query.subject) dailyQuery.set("subject", query.subject);
    if (query.module) dailyQuery.set("module", query.module);
    if (query.section) dailyQuery.set("section", query.section);
    if (query.topic) dailyQuery.set("topic", query.topic);
    const suffix = dailyQuery.toString() ? `?${dailyQuery.toString()}` : "";
    const callbackUrl = `/${encodeURIComponent(locale)}/practice/daily${suffix}`;
    redirect(
      `/${encodeURIComponent(locale)}/authenticate?${new URLSearchParams({
        callbackUrl,
        from: "daily-five",
      }).toString()}`,
    );
  }

  const actor = { userId, guestId: null };
  const viewer = await resolvePracticeViewer(prisma, actor);
  const mode = viewer.subscribed ? "subscriber" : "free";
  const catalogs = await loadPracticeChooser({ actor, locale, mode });
  const activeSessions =
    mode === "subscriber"
      ? await loadActiveSubscriberPracticeSessions({
          userId,
          catalogs,
          limit: 5,
        })
      : [];
  const catalogFromSubject = query.subject
    ? catalogs.find((catalog) =>
        catalog.courses.some((course) => course.slug === query.subject),
      )
    : null;

  return (
    <DailyFivePracticeClient
      locale={locale}
      mode={mode}
      catalogs={catalogs}
      targetCount={DAILY_PRACTICE_TARGET_COUNT}
      initialSelection={{
        catalogSlug: query.catalog ?? catalogFromSubject?.slug ?? "",
        subjectSlug: query.subject ?? "",
        moduleSlug: query.module ?? "",
        sectionSlug: query.section ?? "",
        topicSlug: query.topic ?? "",
      }}
      activeSessions={activeSessions}
    />
  );
}
