import { redirect } from "next/navigation";
import { loadTutoringSessionPage } from "@/lib/tutoring/loadTutoringSessionPage";
import { buildTutoringSignInHref } from "@/lib/tutoring/tutoringSignInHref";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; sessionId: string }>;
  searchParams: Promise<{ workspace?: string; learnerId?: string }>;
}) {
  const { locale, sessionId } = await params;
  const query = await searchParams;
  const data = await loadTutoringSessionPage({ sessionId });
  if (data.status === "signed_out") {
    redirect(buildTutoringSignInHref({ locale, segments: [sessionId] }));
  }
  if (data.status !== "ready") redirect(`/${locale}/tutoring-sessions`);
  const suffix = new URLSearchParams();
  if (query.workspace) suffix.set("workspace", query.workspace);
  if (query.learnerId) suffix.set("learnerId", query.learnerId);
  const queryString = suffix.toString();
  redirect(
    `/${locale}/tutoring-sessions/${sessionId}/subjects/${data.snapshot.subjectSlug}/modules/${data.selected.sessionModuleSlug}/learn${queryString ? `?${queryString}` : ""}`,
  );
}
