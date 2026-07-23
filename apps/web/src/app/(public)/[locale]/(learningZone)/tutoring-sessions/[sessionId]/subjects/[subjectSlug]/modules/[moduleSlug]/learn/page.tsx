import { redirect } from "next/navigation";
import ReviewModulePageClient from "@/app/(public)/[locale]/(learningZone)/subjects/[subjectSlug]/modules/[moduleSlug]/learn/ReviewModulePageClient";
import { loadTutoringSessionPage } from "@/lib/tutoring/loadTutoringSessionPage";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

export default async function TutoringPlayerPage({
  params,
}: {
  params: Promise<{
    locale: string;
    sessionId: string;
    subjectSlug: string;
    moduleSlug: string;
  }>;
}) {
  const { locale, sessionId, subjectSlug, moduleSlug } = await params;
  const data = await loadTutoringSessionPage({ sessionId, moduleSlug });
  if (data.status === "signed_out") {
    redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(`/${locale}/tutoring-sessions/${sessionId}`)}`);
  }
  if (data.status !== "ready" || subjectSlug !== data.snapshot.subjectSlug) {
    redirect(`/${locale}/tutoring-sessions`);
  }

  const currentIndex = data.snapshot.modules.findIndex(
    (item) => item.sessionModuleSlug === data.selected.sessionModuleSlug,
  );
  const prev = data.snapshot.modules[currentIndex - 1];
  const next = data.snapshot.modules[currentIndex + 1];
  const prefix = `/${locale}/tutoring-sessions/${sessionId}`;

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div className="absolute left-1/2 top-2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-xl border border-white/15 bg-black/80 px-3 py-2 text-xs text-white shadow-lg backdrop-blur">
        <span className="font-semibold">{data.session.title}</span>
        <span className="text-white/60">{data.isTutor ? "Tutor view" : "Shared session"}</span>
        {prev ? (
          <Link href={`/tutoring-sessions/${sessionId}/subjects/${subjectSlug}/modules/${prev.sessionModuleSlug}/learn`} className="rounded border border-white/20 px-2 py-1">Previous module</Link>
        ) : null}
        {next ? (
          <Link href={`/tutoring-sessions/${sessionId}/subjects/${subjectSlug}/modules/${next.sessionModuleSlug}/learn`} className="rounded border border-white/20 px-2 py-1">Next module</Link>
        ) : null}
      </div>
      <ReviewModulePageClient
        mod={data.selected.module}
        canUnlockAll
        routePrefix={prefix}
        tutoringSession={{ id: sessionId, canEdit: data.canEdit }}
      />
    </div>
  );
}
