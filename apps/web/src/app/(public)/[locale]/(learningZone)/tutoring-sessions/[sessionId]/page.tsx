import { redirect } from "next/navigation";
import { loadTutoringSessionPage } from "@/lib/tutoring/loadTutoringSessionPage";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ locale: string; sessionId: string }> }) {
  const { locale, sessionId } = await params;
  const data = await loadTutoringSessionPage({ sessionId });
  if (data.status === "signed_out") redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(`/${locale}/tutoring-sessions/${sessionId}`)}`);
  if (data.status !== "ready") redirect(`/${locale}/tutoring-sessions`);
  redirect(`/${locale}/tutoring-sessions/${sessionId}/subjects/${data.snapshot.subjectSlug}/modules/${data.selected.sessionModuleSlug}/learn`);
}
