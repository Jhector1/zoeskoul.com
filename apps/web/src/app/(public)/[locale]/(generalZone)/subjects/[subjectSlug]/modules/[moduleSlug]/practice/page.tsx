// src/app/(public)/[locale]/subjects/[subjectSlug]/modules/[moduleSlug]/practice/page.tsx
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import PracticeClient from "./practice-client";
import { enforceModuleAccessOrRedirect } from "@/lib/billing/enforceModuleAccessOrRedirect";

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
  const userId: string | null = (session as any)?.user?.id ?? null;

  // teacher/admin bypass
  let bypass = false;
  if (userId) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { roles: true } });
    const roles: string[] = (u as any)?.roles ?? [];
    bypass = roles.includes("teacher") || roles.includes("admin");
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