import { redirect } from "next/navigation";
import TutoringSessionPlayer from "@/components/tutoring/TutoringSessionPlayer";
import { loadTutoringSessionPage } from "@/lib/tutoring/loadTutoringSessionPage";
import { buildTutoringSignInHref } from "@/lib/tutoring/tutoringSignInHref";

export const dynamic = "force-dynamic";

export default async function TutoringPlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{
    locale: string;
    sessionId: string;
    subjectSlug: string;
    moduleSlug: string;
  }>;
  searchParams: Promise<{ workspace?: string; learnerId?: string }>;
}) {
  const { locale, sessionId, subjectSlug, moduleSlug } = await params;
  const query = await searchParams;
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
        ],
      }),
    );
  }
  if (data.status !== "ready" || subjectSlug !== data.snapshot.subjectSlug) {
    redirect(`/${locale}/tutoring-sessions`);
  }

  const prefix = `/${locale}/tutoring-sessions/${sessionId}`;

  return (
    <TutoringSessionPlayer
      mod={data.selected.module}
      routePrefix={prefix}
      moduleKey={data.selected.sessionModuleSlug}
      session={{
        id: sessionId,
        title: data.session.title,
        status: data.session.status,
        canManage: data.canManage,
        canEditOwnProgress: data.canEdit,
        canEditMasterWorkspace: data.canEditMasterWorkspace,
        publishedVersion: data.publishedVersion,
        publishedAt: data.publishedAt,
        participants: data.participants,
      }}
      initialWorkspaceView={
        query.workspace === "master" ||
        query.workspace === "reference" ||
        query.workspace === "mine" ||
        query.workspace === "learner"
          ? query.workspace
          : null
      }
      initialLearnerId={query.learnerId ?? null}
    />
  );
}
