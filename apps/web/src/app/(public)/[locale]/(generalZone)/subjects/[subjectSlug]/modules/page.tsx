import "server-only";

import { prisma } from "@/lib/prisma";
import { SUBJECT_ARTIFACTS } from "@/lib/subjects";
import SubjectModulesClient from "./SubjectModulesClient";
import { auth } from "@/lib/auth";
import type { Actor } from "@/lib/practice/actor";
import { getAccessSnapshot } from "@/lib/access/accessSnapshot";
import { resolveModuleAccess } from "@/lib/access/resolveModuleAccess";
import { resolvePrivilegedLearningAccess } from "@/lib/access/resolvePrivilegedLearningAccess";
import {
  getResolvedSectionPresentationMap,
  getResolvedSubjectModulesFromManifest,
} from "@/lib/subjects/server/resolveSubjectPresentation";
import { notFound } from "next/navigation";
import { normalizeTopicProgressKey } from "@/lib/review/progressTopicKeys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  locale: string;
  subjectSlug: string;
};

type ModuleAccessView = {
  ok: boolean;
  paid: boolean;
  reason: string;
};

export default async function SubjectModulesPage({
                                                   params,
                                                 }: {
  params: Promise<Params>;
}) {
  const { locale, subjectSlug } = await params;

  const session = await auth();
  const sessionUser: any = (session as any)?.user ?? null;
  const userId: string | null = sessionUser?.id ?? null;
  const email: string | null = sessionUser?.email ?? null;

  const { canUnlockAll } = await resolvePrivilegedLearningAccess({
    userId,
    email,
  });

  const actor: Actor = { userId, guestId: null };

  const subject = await prisma.practiceSubject.findUnique({
    where: { slug: subjectSlug },
    select: {
      id: true,
      slug: true,
      accessPolicy: true as any,
      entitlementKey: true,
      modules: {
        orderBy: [{ order: "asc" }, { slug: "asc" }],
        select: {
          id: true,
          slug: true,
          order: true,
          weekStart: true,
          weekEnd: true,
          accessOverride: true as any,
          entitlementKey: true,
        },
      },
      sections: {
        orderBy: [{ order: "asc" }, { slug: "asc" }],
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          order: true,
          moduleId: true,
        },
      },
    },
  });

  if (!subject) notFound();

  const manifestView = await getResolvedSubjectModulesFromManifest(subjectSlug);
  if (!manifestView) notFound();

  const resolvedSectionsBySlug = await getResolvedSectionPresentationMap(subjectSlug);

  const manifestModuleSlugs = new Set(manifestView.modules.map((m) => m.slug));
  const dbModulesBySlug = new Map(subject.modules.map((m) => [m.slug, m]));

  // The generated manifest is the source of truth for what learners can see.
  // DB rows are only used for stable ids/access/progress. This prevents old
  // published sections/topics from inflating counts after a course is republished
  // with fewer manifest sections.
  const modules = manifestView.modules.flatMap((mv) => {
    const db = dbModulesBySlug.get(mv.slug);
    if (!db) return [];

    return [
      {
        ...db,
        title: mv.title,
        description: mv.description || null,
        order: db.order ?? mv.order,
        weekStart: db.weekStart ?? mv.weekStart ?? null,
        weekEnd: db.weekEnd ?? mv.weekEnd ?? null,
      },
    ];
  });

  const manifestSections = SUBJECT_ARTIFACTS.sections
    .filter((s) => s.subjectSlug === subjectSlug && manifestModuleSlugs.has(s.moduleSlug))
    .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));

  const sections = manifestSections.flatMap((s) => {
    const dbModule = dbModulesBySlug.get(s.moduleSlug);
    if (!dbModule) return [];

    const resolved = resolvedSectionsBySlug[s.slug];

    return [
      {
        id: s.slug,
        slug: s.slug,
        title: resolved?.title ?? s.title,
        description: resolved?.description ?? s.description ?? null,
        order: resolved?.order ?? s.order,
        moduleId: dbModule.id,
      },
    ];
  });

  const requireAll = process.env.BILLING_REQUIRE_ALL_MODULES === "1";

  const snapshot = await getAccessSnapshot(prisma, actor, {
    subjectIds: [subject.id],
    moduleIds: modules.map((m) => m.id),
  });

  const accessByModuleSlug: Record<string, ModuleAccessView> = {};

  for (const m of modules) {
    if (canUnlockAll) {
      accessByModuleSlug[m.slug] = { ok: true, paid: false, reason: "bypass" };
      continue;
    }

    const d = resolveModuleAccess({
      subject: {
        id: subject.id,
        slug: subject.slug,
        accessPolicy: (subject as any).accessPolicy,
        entitlementKey: (subject as any).entitlementKey ?? null,
      },
      module: {
        id: m.id,
        slug: m.slug,
        accessOverride: (m as any).accessOverride,
        entitlementKey: (m as any).entitlementKey ?? null,
      },
      snapshot,
      requireAll,
    });

    accessByModuleSlug[m.slug] = {
      ok: Boolean((d as any).ok),
      paid: Boolean((d as any).paid),
      reason: String((d as any).reason ?? "unknown"),
    };
  }

  const topicIdsByModuleDbId: Record<string, string[]> = {};
  for (const m of modules) {
    const keys = SUBJECT_ARTIFACTS.topics
      .filter((t) => t.subjectSlug === subjectSlug && t.moduleSlug === m.slug)
      .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))
      .map((t) => normalizeTopicProgressKey(t.slug));

    topicIdsByModuleDbId[String(m.id)] = [...new Set(keys)];
  }

  const topicIdsBySectionId: Record<string, string[]> = {};
  for (const s of manifestSections) {
    topicIdsBySectionId[s.slug] = [...new Set(s.topicSlugs.map((slug) => normalizeTopicProgressKey(slug)))];
  }

  return (
      <SubjectModulesClient
          locale={locale}
          subjectSlug={subject.slug}
          subjectTitle={manifestView.subject.title}
          subjectDescription={manifestView.subject.description || null}
          modules={modules}
          sections={sections}
          topicIdsByModuleDbId={topicIdsByModuleDbId}
          topicIdsBySectionId={topicIdsBySectionId}
          canUnlockAll={canUnlockAll}
          accessByModuleSlug={accessByModuleSlug}
      />
  );
}
