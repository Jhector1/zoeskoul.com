// src/app/(public)/[locale]/subjects/[subjectSlug]/modules/[moduleSlug]/practice/page.tsx
import { auth } from "@/lib/auth";
import PracticeClient from "./practice-client";
import { enforceModuleAccessOrRedirect } from "@/lib/billing/enforceModuleAccessOrRedirect";
import { prisma } from "@/lib/prisma";
import { resolvePrivilegedLearningAccess } from "@/lib/access/resolvePrivilegedLearningAccess";
import { resolvePracticeViewer } from "@/lib/practice/experience/viewer";
import { notFound, redirect } from "next/navigation";
import { getSubjectPublicationState } from "@/lib/subjects/server/subjectPublication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { locale: string; subjectSlug: string; moduleSlug: string };
type SP = Record<string, string | string[] | undefined>;

function toQueryString(sp: SP) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export default async function ModulePracticePage({
                                                   params,
                                                   searchParams,
                                                 }: {
  params: Promise<Params>;
  searchParams: Promise<SP>;
}) {
  const { locale, subjectSlug, moduleSlug } = await params;
  const sp = await searchParams;

  const session = await auth();
  const sessionUser: any = (session as any)?.user ?? null;
  const userId: string | null = sessionUser?.id ?? null;
  const email: string | null = sessionUser?.email ?? null;
  const [{ bypass }, publication] = await Promise.all([
    resolvePrivilegedLearningAccess({
      userId,
      email,
    }),
    getSubjectPublicationState(subjectSlug),
  ]);

  if (!bypass && !publication.isAvailable) {
    notFound();
  }

  const viewer = await resolvePracticeViewer(prisma, { userId, guestId: null });
  if (!bypass && !viewer.subscribed) {
    const daily = new URLSearchParams({
      subject: subjectSlug,
      module: moduleSlug,
    });
    redirect(`/${encodeURIComponent(locale)}/practice/daily?${daily.toString()}`);
  }

  const nextPath =
      `/${encodeURIComponent(locale)}/subjects/${encodeURIComponent(subjectSlug)}` +
      `/modules/${encodeURIComponent(moduleSlug)}/practice${toQueryString(sp)}`;

  await enforceModuleAccessOrRedirect({
    prisma,
    actor: { userId, guestId: null },
    bypass,
    locale,
    subjectSlug,
    moduleSlug,
    nextPath,
  });

  return <PracticeClient subjectSlug={subjectSlug} moduleSlug={moduleSlug} />;
}
