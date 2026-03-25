// /subjects/[subjectSlug]/modules/page.tsx
import "server-only";

import { prisma } from "@/lib/prisma";
import SubjectModulesClient from "./SubjectModulesClient";
import { auth } from "@/lib/auth";
import type { Actor } from "@/lib/practice/actor";

import { getAccessSnapshot } from "@/lib/access/accessSnapshot";
import { resolveModuleAccess } from "@/lib/access/resolveModuleAccess";

import { getTranslations } from "next-intl/server";

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

export default async function SubjectModulesPage({ params }: { params: Promise<Params> }) {
  const { locale, subjectSlug } = await params;

  const tr = await getTranslations();
  const has = ((tr as any).has?.bind(tr) as ((k: string) => boolean) | undefined) ?? (() => false);

  const tMaybe = (key: string, fallback: string, values?: Record<string, any>) => {
    try {
      if (!has(key)) return fallback;
      const out = tr(key as any, values as any);
      return out || fallback;
    } catch {
      return fallback;
    }
  };

  if (!subjectSlug) {
    return (
        <div className="min-h-screen p-6">
          <div className="mx-auto max-w-3xl ui-card p-6">
            <div className="text-lg font-black">
              {tMaybe("subjectModulesUi.errors.missingSubjectTitle", "Missing subject")}
            </div>
            <div className="mt-2 text-sm text-neutral-600 dark:text-white/70">
              {tMaybe("subjectModulesUi.errors.missingSubjectDesc", "subjectSlug param is missing.")}
            </div>
          </div>
        </div>
    );
  }

  const session = await auth();
  const sessionUser: any = (session as any)?.user ?? null;
  const userId: string | null = sessionUser?.id ?? null;
  const email: string | null = sessionUser?.email ?? null;

  const user = userId
      ? await prisma.user.findUnique({ where: { id: userId }, select: { roles: true } })
      : email
          ? await prisma.user.findUnique({ where: { email }, select: { roles: true } })
          : null;

  const roles: string[] = (user as any)?.roles ?? [];
  const canUnlockAll = roles.includes("teacher") || roles.includes("admin");

  // actor (guestId optional—if you have it in cookies you can fill it in)
  const actor: Actor = { userId, guestId: null };

  const subject = await prisma.practiceSubject.findUnique({
    where: { slug: subjectSlug },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,

      // for access resolution
      accessPolicy: true as any,
      entitlementKey: true,

      modules: {
        orderBy: [{ order: "asc" }, { slug: "asc" }],
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          order: true,
          weekStart: true,
          weekEnd: true,

          // for access resolution
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

  if (!subject) {
    return (
        <div className="min-h-screen p-6">
          <div className="mx-auto max-w-3xl ui-card p-6">
            <div className="text-lg font-black">
              {tMaybe("subjectModulesUi.errors.notFoundTitle", "Subject not found")}
            </div>
            <div className="mt-2 text-sm text-neutral-600 dark:text-white/70">
              {tMaybe(
                  "subjectModulesUi.errors.notFoundDesc",
                  `No subject with slug “${subjectSlug}”.`,
                  { slug: subjectSlug },
              )}
            </div>
          </div>
        </div>
    );
  }

  // ✅ Translate subject (fallback to DB)
  const subjectTitle = tMaybe(`subjects.${subject.slug}.title`, subject.title);
  const subjectDescription = tMaybe(`subjects.${subject.slug}.description`, subject.description ?? "");

  // ✅ Translate modules (fallback to DB) using your JSON keys:
  // modules.python.python-0.title
  const modules = subject.modules.map((m) => {
    const title = tMaybe(`modules.${subject.slug}.${m.slug}.title`, m.title);
    const desc = tMaybe(`modules.${subject.slug}.${m.slug}.description`, m.description ?? "");
    return { ...m, title, description: desc || null };
  });

  // Batch compute module access
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

  // Topics map
  const moduleDbIds = modules.map((m) => m.id);
  const sectionIds = subject.sections.map((s) => s.id);

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
          subjectTitle={subjectTitle}
          subjectDescription={subjectDescription || null}
          modules={modules}
          sections={subject.sections}
          topicIdsByModuleDbId={topicIdsByModuleDbId}
          topicIdsBySectionId={topicIdsBySectionId}
          canUnlockAll={canUnlockAll}
          accessByModuleSlug={accessByModuleSlug}
      />
  );
}