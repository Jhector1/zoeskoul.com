import TutoringSessionEditor from "@/components/admin/tutoring-sessions/TutoringSessionEditor";
import { requireTeachingPageUser } from "@/lib/teaching/requireTeachingPageUser";
import { loadTutoringSessionEditorData } from "@/lib/tutoring/sessionEditorData";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const teachingUser = await requireTeachingPageUser({
    locale,
    callbackPath: "/admin/tutoring-sessions/new",
  });
  const { courses, groups } = await loadTutoringSessionEditorData({
    locale,
    teachingUser,
  });

  return (
    <main className="mx-auto max-w-6xl p-6">
      <TutoringSessionEditor
        initialSession={null}
        courses={courses}
        groups={groups}
      />
    </main>
  );
}
