import "server-only";

import { prisma } from "@/lib/prisma";
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

  const manifestModulesBySlug = new Map(
      manifestView.modules.map((m) => [m.slug, m]),
  );

  const modules = subject.modules.map((m) => {
    const mv = manifestModulesBySlug.get(m.slug);

    return {
      ...m,
      title: mv?.title ?? m.slug,
      description: mv?.description ?? null,
    };
  });

  const sections = subject.sections.map((s) => {
    const sv = resolvedSectionsBySlug[s.slug];

    return {
      ...s,
      title: sv?.title ?? s.title,
      description: sv?.description ?? s.description ?? null,
    };
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

  const moduleDbIds = modules.map((m) => m.id);
  const sectionIds = sections.map((s) => s.id);

  const moduleTopics = await prisma.practiceTopic.findMany({
    where: { moduleId: { in: moduleDbIds } },
    select: { moduleId: true, genKey: true, slug: true },
  });

  const topicIdsByModuleDbId: Record<string, string[]> = {};
  for (const t of moduleTopics) {
    const mid = t.moduleId ? String(t.moduleId) : "";
    if (!mid) continue;
    const key = String(t.genKey ?? t.slug);
    (topicIdsByModuleDbId[mid] ??= []).push(key);
  }

  const sectionLinks = await prisma.practiceSectionTopic.findMany({
    where: { sectionId: { in: sectionIds } },
    select: {
      sectionId: true,
      topic: { select: { genKey: true, slug: true } },
    },
    orderBy: { order: "asc" },
  });

  const topicIdsBySectionId: Record<string, string[]> = {};
  for (const link of sectionLinks) {
    const sid = String(link.sectionId);
    const key = String(link.topic.genKey ?? link.topic.slug);
    (topicIdsBySectionId[sid] ??= []).push(key);
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
