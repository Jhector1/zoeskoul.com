// src/lib/practice/api/practiceGet/topicResolver.service.ts
import type { PrismaClient } from "@/lib/prisma";
import type { TopicSlug } from "@/lib/practice/types";
import { rngFromActor } from "@/lib/practice/catalog";
import { toDbTopicSlug } from "@/lib/practice/topicSlugs";
import { resolveTopicBundleManifest } from "@/lib/curriculum/resolveTopicBundleManifest";

type RngSeedParts = {
  userId?: string | null;
  guestId?: string | null;
  sessionId?: string | null;
};

function readVariantFromMeta(topicRow: { meta?: any }) {
  const v = topicRow?.meta?.variant;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

async function topicInAssignment(prisma: PrismaClient, assignmentId: string, topicId: string) {
  const link = await prisma.assignmentTopic.findFirst({
    where: { assignmentId, topicId },
    select: { assignmentId: true },
  });
  return Boolean(link);
}

async function topicInSection(prisma: PrismaClient, sectionSlug: string, topicId: string) {
  const link = await prisma.practiceSectionTopic.findFirst({
    where: { section: { slug: sectionSlug }, topicId },
    select: { sectionId: true },
  });
  return Boolean(link);
}

async function topicInModule(prisma: PrismaClient, moduleId: string, topic: { id: string; moduleId: string | null }) {
  if (topic.moduleId) return topic.moduleId === moduleId;

  const link = await prisma.practiceSectionTopic.findFirst({
    where: {
      topicId: topic.id,
      section: { moduleId },
    },
    select: { sectionId: true },
  });
  return Boolean(link);
}

async function findModuleIdBySlug(prisma: PrismaClient, moduleSlug: string) {
  const row = await prisma.practiceModule.findUnique({
    where: { slug: moduleSlug },
    select: { id: true },
  });
  return row?.id ?? null;
}


function lastTopicSegment(value: string) {
  const parts = String(value ?? "").split(".").map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : String(value ?? "").trim();
}

function manifestConfirmsTopicScope(args: {
  subjectSlug?: string;
  moduleSlug?: string;
  sectionSlug?: string;
  rawTopic?: string | null;
  rowSlug?: string | null;
}) {
  const subjectSlug = String(args.subjectSlug ?? "").trim();
  if (!subjectSlug) return false;

  const topicRef = String(args.rawTopic ?? args.rowSlug ?? "").trim();
  if (!topicRef || topicRef === "all") return false;

  const topicBundle = resolveTopicBundleManifest({
    subjectSlug,
    topicSlugOrId: topicRef,
  });

  if (!topicBundle) return false;

  const bundleTopicId = String((topicBundle as any).topicId ?? "").trim();
  const requestedBase = lastTopicSegment(topicRef);
  const rowBase = lastTopicSegment(String(args.rowSlug ?? ""));

  if (bundleTopicId && requestedBase && bundleTopicId !== requestedBase) return false;
  if (bundleTopicId && rowBase && bundleTopicId !== rowBase) return false;

  const bundleModuleSlug = String((topicBundle as any).moduleSlug ?? "").trim();
  if (args.moduleSlug && bundleModuleSlug && bundleModuleSlug !== args.moduleSlug) {
    return false;
  }

  const bundleSectionSlug = String((topicBundle as any).sectionSlug ?? "").trim();
  if (args.sectionSlug && bundleSectionSlug && bundleSectionSlug !== args.sectionSlug) {
    return false;
  }

  return true;
}

function okResolvedTopicFromManifestScope(args: {
  row: {
    id: string;
    slug: string;
    genKey: string | null;
    meta: unknown;
  };
  requestedTopic: string | null;
  reason: string;
}) {
  return {
    kind: "ok" as const,
    topicId: args.row.id,
    topicSlug: args.row.slug as TopicSlug,
    genKey: args.row.genKey ? String(args.row.genKey) : null,
    variant: readVariantFromMeta(args.row),
    meta: args.row.meta ?? null,
    requestedTopic: args.requestedTopic,
    topicFallbackUsed: true,
    topicFallbackReason: args.reason,
  };
}

function topicLookupSlugs(rawTopic: string) {
  const primary = toDbTopicSlug(rawTopic);
  const suffix = primary.includes(".")
      ? primary.split(".").filter(Boolean).at(-1) ?? ""
      : "";

  return Array.from(new Set([primary, suffix].filter(Boolean)));
}

export async function resolveTopicFromScope
(args: {
  prisma: PrismaClient;

  subjectSlug?: string;
  moduleSlug?: string;
  sectionSlug?: string;

  rawTopic?: string | null;

  subjectIdFromSession?: string | null;
  moduleIdFromSession?: string | null;
  assignmentIdFromSession?: string | null;

  rngSeedParts: RngSeedParts;
  topicPickSalt?: string | null;

  // ✅ new
  fallbackOnMissing?: boolean;
  excludeTopicSlugs?: string[];
}): Promise<
    | {
  kind: "ok";
  topicId: string;
  topicSlug: TopicSlug;
  genKey: string | null;
  variant: string | null;
  meta: any;

  // ✅ debug/self-heal
  requestedTopic: string | null;
  topicFallbackUsed: boolean;
  topicFallbackReason: string | null;
}
    | { kind: "missing"; message: string }
> {
  const {
    prisma,
    subjectSlug,
    moduleSlug,
    sectionSlug,
    rawTopic,
    subjectIdFromSession,
    moduleIdFromSession,
    assignmentIdFromSession,
    rngSeedParts,
    topicPickSalt,
    fallbackOnMissing = false,
    excludeTopicSlugs = [],
  } = args;

  const requestedRaw = String(rawTopic ?? "").trim();
  const wantsAll = !requestedRaw || requestedRaw === "all";

  const requestedTopic = wantsAll ? null : requestedRaw;

  const rng = rngFromActor({
    ...rngSeedParts,
    salt: String(topicPickSalt ?? "topic-pick"),
  });

  const excluded = new Set(excludeTopicSlugs.map((s) => String(toDbTopicSlug(String(s)))));

  // ----------------------------
  // If specific topic requested
  // ----------------------------
  if (!wantsAll) {
    const dbSlug = toDbTopicSlug(requestedRaw);
    const candidateDbSlugs = topicLookupSlugs(requestedRaw);

    let row: {
      id: string;
      slug: string;
      genKey: string | null;
      meta: unknown;
      subjectId: string | null;
      moduleId: string | null;
    } | null = null;

    for (const candidateDbSlug of candidateDbSlugs) {
      row = await prisma.practiceTopic.findUnique({
        where: { slug: candidateDbSlug },
        select: {
          id: true,
          slug: true,
          genKey: true,
          meta: true,
          subjectId: true,
          moduleId: true,
        },
      });

      if (row) break;
    }

    if (!row) {
      const tried = candidateDbSlugs.join(" or ") || dbSlug;
      if (!fallbackOnMissing) return { kind: "missing", message: `Topic "${tried}" not found.` };
      // fallback -> pick any valid
      return resolveTopicFromScope({
        ...args,
        rawTopic: null,
        fallbackOnMissing: false,
        excludeTopicSlugs,
      }).then((r: any) =>
          r.kind === "ok"
              ? {
                ...r,
                requestedTopic,
                topicFallbackUsed: true,
                topicFallbackReason: "requested_topic_not_found",
              }
              : r,
      );
    }

    if (excluded.has(String(row.slug))) {
      if (!fallbackOnMissing) return { kind: "missing", message: `Topic "${dbSlug}" excluded.` };
      return resolveTopicFromScope({
        ...args,
        rawTopic: null,
        fallbackOnMissing: false,
        excludeTopicSlugs,
      }).then((r: any) =>
          r.kind === "ok"
              ? {
                ...r,
                requestedTopic,
                topicFallbackUsed: true,
                topicFallbackReason: "requested_topic_excluded",
              }
              : r,
      );
    }

    if (assignmentIdFromSession) {
      const ok = await topicInAssignment(prisma, assignmentIdFromSession, row.id);
      if (!ok) {
        if (!fallbackOnMissing)
          return { kind: "missing", message: `Topic "${dbSlug}" is not in this assignment.` };

        return resolveTopicFromScope({
          ...args,
          rawTopic: null,
          fallbackOnMissing: false,
          excludeTopicSlugs,
        }).then((r: any) =>
            r.kind === "ok"
                ? {
                  ...r,
                  requestedTopic,
                  topicFallbackUsed: true,
                  topicFallbackReason: "requested_topic_not_in_assignment",
                }
                : r,
        );
      }
    }

    if (moduleIdFromSession) {
      const ok = await topicInModule(prisma, moduleIdFromSession, row);
      if (!ok) {
        if (!fallbackOnMissing)
          return { kind: "missing", message: `Topic "${dbSlug}" is not in this module.` };

        return resolveTopicFromScope({
          ...args,
          rawTopic: null,
          fallbackOnMissing: false,
          excludeTopicSlugs,
        }).then((r: any) =>
            r.kind === "ok"
                ? {
                  ...r,
                  requestedTopic,
                  topicFallbackUsed: true,
                  topicFallbackReason: "requested_topic_not_in_module",
                }
                : r,
        );
      }
    }

    if (!moduleIdFromSession && sectionSlug) {
      const ok = await topicInSection(prisma, sectionSlug, row.id);
      if (!ok) {
        /**
         * Review/Try-it routes are generated from the compiled subject manifest.
         * In dev, or after course-generation changes, the DB section-topic join can
         * lag behind the manifest even though the exact authored exercise is valid.
         * Trust the compiled manifest for an exact requested topic when it confirms
         * the subject/module/section scope; keep DB topic row usage for the saved
         * PracticeQuestionInstance topicId.
         */
        if (
          manifestConfirmsTopicScope({
            subjectSlug,
            moduleSlug,
            sectionSlug,
            rawTopic: requestedRaw,
            rowSlug: row.slug,
          })
        ) {
          return okResolvedTopicFromManifestScope({
            row,
            requestedTopic,
            reason: "requested_topic_section_mismatch_manifest_confirmed",
          });
        }

        const requestedModuleId = moduleSlug
            ? await findModuleIdBySlug(prisma, moduleSlug)
            : null;

        if (requestedModuleId) {
          const okInRequestedModule = await topicInModule(prisma, requestedModuleId, row);
          if (okInRequestedModule) {
            return {
              kind: "ok",
              topicId: row.id,
              topicSlug: row.slug as TopicSlug,
              genKey: row.genKey ? String(row.genKey) : null,
              variant: readVariantFromMeta(row),
              meta: row.meta ?? null,

              requestedTopic,
              topicFallbackUsed: true,
              topicFallbackReason: "requested_topic_section_mismatch_fell_back_to_module",
            };
          }
        }

        if (!fallbackOnMissing)
          return { kind: "missing", message: `Topic "${dbSlug}" is not in section "${sectionSlug}".` };

        return resolveTopicFromScope({
          ...args,
          rawTopic: null,
          fallbackOnMissing: false,
          excludeTopicSlugs,
        }).then((r: any) =>
            r.kind === "ok"
                ? {
                  ...r,
                  requestedTopic,
                  topicFallbackUsed: true,
                  topicFallbackReason: "requested_topic_not_in_section",
                }
                : r,
        );
      }
    }

    if (!moduleIdFromSession && subjectIdFromSession && row.subjectId && row.subjectId !== subjectIdFromSession) {
      if (!fallbackOnMissing) return { kind: "missing", message: `Topic "${dbSlug}" not in this session’s subject.` };

      return resolveTopicFromScope({
        ...args,
        rawTopic: null,
        fallbackOnMissing: false,
        excludeTopicSlugs,
      }).then((r: any) =>
          r.kind === "ok"
              ? {
                ...r,
                requestedTopic,
                topicFallbackUsed: true,
                topicFallbackReason: "requested_topic_not_in_subject",
              }
              : r,
      );
    }

    return {
      kind: "ok",
      topicId: row.id,
      topicSlug: row.slug as TopicSlug,
      genKey: row.genKey ? String(row.genKey) : null,
      variant: readVariantFromMeta(row),
      meta: row.meta ?? null,

      requestedTopic,
      topicFallbackUsed: false,
      topicFallbackReason: null,
    };
  }

  // ----------------------------
  // wantsAll: choose a pool
  // priority: assignment -> module(session) -> section -> moduleSlug -> subjectSlug
  // ----------------------------

  // 1) Assignment pool
  if (assignmentIdFromSession) {
    const links = await prisma.assignmentTopic.findMany({
      where: { assignmentId: assignmentIdFromSession },
      orderBy: { order: "asc" },
      select: {
        topic: { select: { id: true, slug: true, genKey: true, meta: true, moduleId: true } },
      },
    });

    const pool = links
        .map((x) => x.topic)
        .filter((t) => t?.genKey && !excluded.has(String(t.slug))) as any[];

    if (!pool.length) return { kind: "missing", message: "Assignment has no eligible topics (after exclusions)." };

    const picked = rng.pick(pool);
    return {
      kind: "ok",
      topicId: picked.id,
      topicSlug: picked.slug as TopicSlug,
      genKey: String(picked.genKey),
      variant: readVariantFromMeta(picked),
      meta: picked.meta ?? null,

      requestedTopic: null,
      topicFallbackUsed: false,
      topicFallbackReason: null,
    };
  }

  // 2) Module pool (SESSION LOCK)
  if (moduleIdFromSession) {
    const rows = await prisma.practiceTopic.findMany({
      where: { moduleId: moduleIdFromSession, genKey: { not: null } },
      orderBy: [{ order: "asc" }, { slug: "asc" }],
      select: { id: true, slug: true, genKey: true, meta: true, moduleId: true },
      take: 2000,
    });

    let pool = rows.filter((t) => !excluded.has(String(t.slug)));

    if (!pool.length) {
      const links = await prisma.practiceSectionTopic.findMany({
        where: { section: { moduleId: moduleIdFromSession } },
        orderBy: [{ order: "asc" }],
        select: { topic: { select: { id: true, slug: true, genKey: true, meta: true, moduleId: true } } },
        take: 4000,
      });

      pool = links.map((x) => x.topic).filter((t) => t?.genKey && !excluded.has(String(t.slug))) as any[];
    }

    if (!pool.length) return { kind: "missing", message: "Module has no eligible topics (after exclusions)." };

    const picked = rng.pick(pool);
    return {
      kind: "ok",
      topicId: picked.id,
      topicSlug: picked.slug as TopicSlug,
      genKey: String(picked.genKey),
      variant: readVariantFromMeta(picked),
      meta: picked.meta ?? null,

      requestedTopic: null,
      topicFallbackUsed: false,
      topicFallbackReason: null,
    };
  }

  // 3) Section pool
  if (sectionSlug) {
    const sectionRow = await prisma.practiceSection.findUnique({
      where: { slug: sectionSlug },
      select: {
        topics: {
          orderBy: { order: "asc" },
          select: { topic: { select: { id: true, slug: true, genKey: true, meta: true, moduleId: true } } },
        },
      },
    });

    if (!sectionRow) {
      if (moduleSlug) {
        return resolveTopicFromScope({
          ...args,
          sectionSlug: undefined,
        });
      }
      return { kind: "missing", message: `Section "${sectionSlug}" not found.` };
    }

    const pool = (sectionRow.topics ?? [])
        .map((x) => x.topic)
        .filter((t) => t?.genKey && !excluded.has(String(t.slug))) as any[];

    if (!pool.length) {
      if (moduleSlug) {
        return resolveTopicFromScope({
          ...args,
          sectionSlug: undefined,
        });
      }
      return { kind: "missing", message: `Section "${sectionSlug}" has no eligible topics.` };
    }

    const picked = rng.pick(pool);
    return {
      kind: "ok",
      topicId: picked.id,
      topicSlug: picked.slug as TopicSlug,
      genKey: String(picked.genKey),
      variant: readVariantFromMeta(picked),
      meta: picked.meta ?? null,

      requestedTopic: null,
      topicFallbackUsed: false,
      topicFallbackReason: null,
    };
  }

  // 4) Module slug pool
  if (moduleSlug) {
    const mod = await prisma.practiceModule.findUnique({ where: { slug: moduleSlug }, select: { id: true } });
    if (!mod) return { kind: "missing", message: `Module "${moduleSlug}" not found.` };

    const rows = await prisma.practiceTopic.findMany({
      where: { moduleId: mod.id, genKey: { not: null } },
      orderBy: [{ order: "asc" }, { slug: "asc" }],
      select: { id: true, slug: true, genKey: true, meta: true, moduleId: true },
      take: 2000,
    });

    const pool = rows.filter((t) => !excluded.has(String(t.slug)));

    if (!pool.length) return { kind: "missing", message: `Module "${moduleSlug}" has no eligible topics.` };

    const picked = rng.pick(pool);
    return {
      kind: "ok",
      topicId: picked.id,
      topicSlug: picked.slug as TopicSlug,
      genKey: String(picked.genKey),
      variant: readVariantFromMeta(picked),
      meta: picked.meta ?? null,

      requestedTopic: null,
      topicFallbackUsed: false,
      topicFallbackReason: null,
    };
  }

  // 5) Subject pool
  const rows = await prisma.practiceTopic.findMany({
    where: {
      subject: subjectSlug ? { slug: subjectSlug } : undefined,
      genKey: { not: null },
    },
    orderBy: [{ order: "asc" }, { slug: "asc" }],
    select: { id: true, slug: true, genKey: true, meta: true, moduleId: true },
    take: 2000,
  });

  const pool = rows.filter((t) => !excluded.has(String(t.slug)));

  if (!pool.length) return { kind: "missing", message: `No eligible topics found (after exclusions).` };

  const picked = rng.pick(pool);
  return {
    kind: "ok",
    topicId: picked.id,
    topicSlug: picked.slug as TopicSlug,
    genKey: String(picked.genKey),
    variant: readVariantFromMeta(picked),
    meta: picked.meta ?? null,

    requestedTopic: null,
    topicFallbackUsed: false,
    topicFallbackReason: null,
  };
}
