import "dotenv/config";
import { Prisma, prisma } from "../../src/client.js";

import { buildSeedData, type SeedDataSelection } from "./data";

export type RunSeedOptions = SeedDataSelection;

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function runSeed(options: RunSeedOptions = {}) {
  const started = Date.now();
  const {
    catalogs: CATALOGS,
    subjects: SUBJECTS,
    modules: MODULES,
    topics: TOPICS,
    sections: SECTIONS,
  } = buildSeedData(options);

  try {
    return await prisma.$transaction(async (tx) => {
      // -------------------------
      // 1) Catalogs
      // -------------------------
      const catalogIdBySlug = new Map<string, string>();

      for (const c of CATALOGS) {
        const row = await tx.practiceCatalog.upsert({
          where: { slug: c.slug },
          update: {
            order: c.order,
            title: c.title,
            description: c.description ?? null,
            meta: toJson(c.meta),
            imagePublicId: c.imagePublicId ?? null,
            imageAlt: c.imageAlt ?? null,
            defaultSubjectSlug: c.defaultSubjectSlug ?? null,
            status: c.status ?? "active",
          },
          create: {
            slug: c.slug,
            order: c.order,
            title: c.title,
            description: c.description ?? null,
            meta: toJson(c.meta),
            imagePublicId: c.imagePublicId ?? null,
            imageAlt: c.imageAlt ?? null,
            defaultSubjectSlug: c.defaultSubjectSlug ?? null,
            status: c.status ?? "active",
          },
        });

        catalogIdBySlug.set(c.slug, row.id);
      }

      // -------------------------
      // 2) Subjects
      // -------------------------
      const subjectIdBySlug = new Map<string, string>();

      for (const s of SUBJECTS) {
        const catalogId = catalogIdBySlug.get(s.catalogSlug) ?? null;

        if (!catalogId) {
          throw new Error(`Missing catalogId for subject ${s.slug} (${s.catalogSlug})`);
        }

        const row = await tx.practiceSubject.upsert({
          where: { slug: s.slug },
          update: {
            catalogId,
            order: s.order,
            title: s.title,
            description: s.description ?? null,
            meta: toJson(s.meta),
            imagePublicId: s.imagePublicId ?? null,
            imageAlt: s.imageAlt ?? null,
            accessPolicy: s.accessPolicy ?? "free",
            entitlementKey: s.entitlementKey ?? null,
            status: s.status ?? "active",
          },
          create: {
            slug: s.slug,
            catalogId,
            order: s.order,
            title: s.title,
            description: s.description ?? null,
            meta: toJson(s.meta),
            imagePublicId: s.imagePublicId ?? null,
            imageAlt: s.imageAlt ?? null,
            accessPolicy: s.accessPolicy ?? "free",
            entitlementKey: s.entitlementKey ?? null,
            status: s.status ?? "active",
          },
        });

        subjectIdBySlug.set(s.slug, row.id);
      }

      // -------------------------
      // 3) Modules
      // -------------------------
      const moduleIdBySlug = new Map<string, string>();

      for (const m of MODULES) {
        const subjectId = subjectIdBySlug.get(m.subjectSlug) ?? null;

        const row = await tx.practiceModule.upsert({
          where: { slug: m.slug },
          update: {
            order: m.order,
            title: m.title,
            description: m.description ?? null,
            weekStart: m.weekStart ?? null,
            weekEnd: m.weekEnd ?? null,
            subjectId,
            meta: toJson(m.meta),
            accessOverride: m.accessOverride ?? "inherit",
            entitlementKey: m.entitlementKey ?? null,
          },
          create: {
            slug: m.slug,
            order: m.order,
            title: m.title,
            description: m.description ?? null,
            weekStart: m.weekStart ?? null,
            weekEnd: m.weekEnd ?? null,
            subjectId,
            meta: toJson(m.meta),
            accessOverride: m.accessOverride ?? "inherit",
            entitlementKey: m.entitlementKey ?? null,
          },
        });

        moduleIdBySlug.set(m.slug, row.id);
      }


      // -------------------------
      // 4) Topics
      // -------------------------
      const topicIdBySlug = new Map<string, string>();

      for (const t of TOPICS) {
        const subjectId = subjectIdBySlug.get(t.subjectSlug) ?? null;
        const moduleId = moduleIdBySlug.get(t.moduleSlug) ?? null;

        const meta =
            t.variant === undefined
                ? t.meta
                : { ...(t.meta ?? {}), variant: t.variant };

        const topicTitleKey = t.titleKey ?? `topic.${t.slug}`;

        const row = await tx.practiceTopic.upsert({
          where: { slug: t.slug },
          update: {
            titleKey: topicTitleKey,
            description: t.description ?? null,
            order: t.order ?? 0,
            genKey: t.genKey ?? null,
            subjectId,
            moduleId,
            meta: toJson(meta),
          },
          create: {
            slug: t.slug,
            titleKey: topicTitleKey,
            description: t.description ?? null,
            order: t.order ?? 0,
            genKey: t.genKey ?? null,
            subjectId,
            moduleId,
            meta: toJson(meta),
          },
        });

        topicIdBySlug.set(t.slug, row.id);
      }
      // -------------------------
      // 5) Sections + section-topic links
      // -------------------------
      for (const s of SECTIONS) {
        const subjectId = subjectIdBySlug.get(s.subjectSlug) ?? null;
        const moduleId = moduleIdBySlug.get(s.moduleSlug) ?? null;

        const section = await tx.practiceSection.upsert({
          where: { slug: s.slug },
          update: {
            order: s.order,
            title: s.title,
            description: s.description ?? null,
            meta: toJson(s.meta),
            subjectId,
            moduleId,
          },
          create: {
            slug: s.slug,
            order: s.order,
            title: s.title,
            description: s.description ?? null,
            meta: toJson(s.meta),
            subjectId,
            moduleId,
          },
        });

        await tx.practiceSectionTopic.deleteMany({
          where: { sectionId: section.id },
        });

        if (s.topicSlugs.length > 0) {
          await tx.practiceSectionTopic.createMany({
            data: s.topicSlugs.map((topicSlug, idx) => {
              const topicId = topicIdBySlug.get(topicSlug);
              if (!topicId) throw new Error(`Missing topicId for ${topicSlug}`);

              return {
                sectionId: section.id,
                topicId,
                order: idx,
              };
            }),
          });
        }
      }

      return {
        ok: true as const,
        catalogs: CATALOGS.length,
        subjects: SUBJECTS.length,
        modules: MODULES.length,
        topics: TOPICS.length,
        sections: SECTIONS.length,
        ms: Date.now() - started,
      };
    }, {
      timeout: 120_000,
      maxWait: 30_000,
    });
  } finally {
    await prisma.$disconnect();
  }
}
