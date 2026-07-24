import { redirect } from "next/navigation";
import ReviewModulePageClient from "@/app/(public)/[locale]/(learningZone)/subjects/[subjectSlug]/modules/[moduleSlug]/learn/ReviewModulePageClient";
import { loadTutoringSessionPage } from "@/lib/tutoring/loadTutoringSessionPage";
import { buildTutoringSignInHref } from "@/lib/tutoring/tutoringSignInHref";

export const dynamic = "force-dynamic";

export default async function TutoringPlayerPage({
  params,
}: {
  params: Promise<{
    locale: string;
    sessionId: string;
    subjectSlug: string;
    moduleSlug: string;
    sectionSlug: string;
    topicId: string;
    targetKind: string;
    targetSlug: string;
  }>;
}) {
  const {
    locale,
    sessionId,
    subjectSlug,
    moduleSlug,
    sectionSlug,
    topicId,
    targetKind,
    targetSlug,
  } = await params;
  const data = await loadTutoringSessionPage({ sessionId, moduleSlug });
  if (data.status === "signed_out") {
    redirect(
      buildTutoringSignInHref({
        locale,
        segments: [
          sessionId,
          "subjects",
          subjectSlug,
          "modules",
          moduleSlug,
          "learn",
          sectionSlug,
          topicId,
          targetKind,
          targetSlug,
        ],
      }),
    );
  }
  if (data.status !== "ready" || subjectSlug !== data.snapshot.subjectSlug) {
    redirect(`/${locale}/tutoring-sessions`);
  }

  const prefix = `/${locale}/tutoring-sessions/${sessionId}`;

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <ReviewModulePageClient
        mod={data.selected.module}
        canUnlockAll
        routePrefix={prefix}
        tutoringSession={{
          id: sessionId,
          canEdit: data.canEdit,
          canEditBoard: data.canEditBoard,
          title: data.session.title,
          viewLabel: data.isTutor ? "Tutor view" : "Shared session",
        }}
      />
    </div>
  );
}
