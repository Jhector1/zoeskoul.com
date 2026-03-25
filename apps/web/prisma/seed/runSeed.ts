import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { SUBJECTS, MODULES, TOPICS, SECTIONS } from "./data";

function getPrisma() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  return new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString })),
  });
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function runSeed() {
  const prisma = getPrisma();
  const started = Date.now();

  try {
    return await prisma.$transaction(async (tx) => {
      // -------------------------
      // 1) Subjects
      // -------------------------
      const subjectIdBySlug = new Map<string, string>();

      for (const s of SUBJECTS) {
        const row = await tx.practiceSubject.upsert({
          where: { slug: s.slug },
          update: {
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
      // 2) Modules
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
      // 3) Topics
      // -------------------------
      const topicIdBySlug = new Map<string, string>();

      for (const t of TOPICS) {
        const subjectId = subjectIdBySlug.get(t.subjectSlug) ?? null;
        const moduleId = moduleIdBySlug.get(t.moduleSlug) ?? null;

        const meta =
            t.variant === undefined
                ? t.meta
                : { ...(t.meta ?? {}), variant: t.variant };

        const row = await tx.practiceTopic.upsert({
          where: { slug: t.slug },
          update: {
            titleKey: t.titleKey,
            description: t.description ?? null,
            order: t.order ?? 0,
            genKey: t.genKey ?? null,
            subjectId,
            moduleId,
            meta: toJson(meta),
          },
          create: {
            slug: t.slug,
            titleKey: t.titleKey,
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
      // 4) Sections + section-topic links
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
        subjects: SUBJECTS.length,
        modules: MODULES.length,
        topics: TOPICS.length,
        sections: SECTIONS.length,
        ms: Date.now() - started,
      };
    });
  } finally {
    await prisma.$disconnect();
  }
}