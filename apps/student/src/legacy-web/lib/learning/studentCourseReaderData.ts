import "server-only";

import type {
  LearningCourseOverviewResponse,
  LearningModuleOverviewResponse,
} from "@zoeskoul/learning-contracts";

import { getAccessSnapshot } from "@/lib/access/accessSnapshot";
import { resolveModuleAccess } from "@/lib/access/resolveModuleAccess";
import { prisma } from "@/lib/prisma";
import type { Actor } from "@/lib/practice/actor";
import { SUBJECT_ARTIFACTS } from "@/lib/subjects";
import {
  getResolvedModuleIntroFromManifest,
  getResolvedReviewModule,
  getResolvedSectionPresentationMap,
  getResolvedSubjectModulesFromManifest,
} from "@/lib/subjects/server/resolveSubjectPresentation";
import { getManifestSubjectPublicationStatus } from "@/lib/subjects/server/subjectPublication";
import { checkSubjectAudienceAccess } from "@/lib/access/subjectAudienceAccess";

type LoaderActor = {
  userId: string;
  canUnlockAll: boolean;
};

type CourseLoadResult =
  | {
      status: "ready";
      data: LearningCourseOverviewResponse;
    }
  | {
      status: "missing";
    };

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function cleanNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function humanizeSlug(slug: string): string {
  const readableSegment =
    slug.includes(".")
      ? slug.slice(slug.lastIndexOf(".") + 1)
      : slug;

  return readableSegment
    .split(/[._-]+/)
    .filter(Boolean)
    .map(
      (part) =>
        part.slice(0, 1).toUpperCase() +
        part.slice(1),
    )
    .join(" ");
}

function displayTopicTitle(
  value: unknown,
  topicSlug: string,
): string {
  const title = cleanString(value);

  if (
    !title ||
    title.startsWith("topic.") ||
    title.startsWith("topics.") ||
    title.includes(".topic.")
  ) {
    return humanizeSlug(topicSlug);
  }

  return title;
}

export async function loadStudentCourseOverview(args: {
  actor: LoaderActor;
  subjectSlug: string;
}): Promise<CourseLoadResult> {
  const actor: Actor = {
    userId: args.actor.userId,
    guestId: null,
  };

  const subject = await prisma.practiceSubject.findUnique({
    where: {
      slug: args.subjectSlug,
    },
    select: {
      id: true,
      slug: true,
      accessPolicy: true as any,
      entitlementKey: true,
      status: true,
      visibility: true,
      modules: {
        orderBy: [
          { order: "asc" },
          { slug: "asc" },
        ],
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
    },
  });

  if (!subject) {
    return { status: "missing" };
  }

  const manifestStatus =
    getManifestSubjectPublicationStatus(args.subjectSlug);

  if (
    !args.actor.canUnlockAll &&
    (subject.status !== "active" || manifestStatus !== "active")
  ) {
    return { status: "missing" };
  }

  if (!args.actor.canUnlockAll) {
    const audienceAccess = await checkSubjectAudienceAccess(prisma, {
      actor,
      subjectId: subject.id,
      visibility: subject.visibility,
    });

    if (!audienceAccess.ok) {
      return { status: "missing" };
    }
  }

  const manifestView =
    await getResolvedSubjectModulesFromManifest(args.subjectSlug);

  if (!manifestView) {
    return { status: "missing" };
  }

  const dbModulesBySlug = new Map(
    subject.modules.map((module) => [
      module.slug,
      module,
    ]),
  );

  const modules = manifestView.modules.flatMap((moduleView) => {
    const databaseModule =
      dbModulesBySlug.get(moduleView.slug);

    if (!databaseModule) return [];

    const moduleSections = SUBJECT_ARTIFACTS.sections.filter(
      (section) =>
        section.subjectSlug === args.subjectSlug &&
        section.moduleSlug === moduleView.slug,
    );

    const topicSlugs = new Set(
      moduleSections.flatMap((section) => section.topicSlugs),
    );

    return [{
      id: databaseModule.id,
      slug: databaseModule.slug,
      title: moduleView.title,
      description: moduleView.description || null,
      order: databaseModule.order ?? moduleView.order ?? 0,
      weekStart:
        databaseModule.weekStart ??
        moduleView.weekStart ??
        null,
      weekEnd:
        databaseModule.weekEnd ??
        moduleView.weekEnd ??
        null,
      sectionsCount: moduleSections.length,
      topicsCount: topicSlugs.size,
      databaseModule,
    }];
  });

  const snapshot = await getAccessSnapshot(prisma, actor, {
    subjectIds: [subject.id],
    moduleIds: modules.map((module) => module.id),
  });

  const requireAll =
    process.env.BILLING_REQUIRE_ALL_MODULES === "1";

  const serializedModules = modules.map((module) => {
    if (args.actor.canUnlockAll) {
      return {
        id: module.id,
        slug: module.slug,
        title: module.title,
        description: module.description,
        order: module.order,
        weekStart: module.weekStart,
        weekEnd: module.weekEnd,
        sectionsCount: module.sectionsCount,
        topicsCount: module.topicsCount,
        access: {
          ok: true,
          paid: false,
          reason: "bypass",
        },
      };
    }

    const decision = resolveModuleAccess({
      subject: {
        id: subject.id,
        slug: subject.slug,
        accessPolicy: (subject as any).accessPolicy,
        visibility: subject.visibility,
        entitlementKey:
          (subject as any).entitlementKey ?? null,
      },
      module: {
        id: module.databaseModule.id,
        slug: module.databaseModule.slug,
        accessOverride:
          (module.databaseModule as any).accessOverride,
        entitlementKey:
          (module.databaseModule as any).entitlementKey ??
          null,
      },
      snapshot,
      requireAll,
    });

    return {
      id: module.id,
      slug: module.slug,
      title: module.title,
      description: module.description,
      order: module.order,
      weekStart: module.weekStart,
      weekEnd: module.weekEnd,
      sectionsCount: module.sectionsCount,
      topicsCount: module.topicsCount,
      access: {
        ok: Boolean((decision as any).ok),
        paid: Boolean((decision as any).paid),
        reason: String(
          (decision as any).reason ?? "unknown",
        ),
      },
    };
  });

  return {
    status: "ready",
    data: {
      subject: {
        id: subject.id,
        slug: subject.slug,
        title: manifestView.subject.title,
        description:
          manifestView.subject.description || null,
        imagePublicId:
          manifestView.subject.imagePublicId ?? null,
        imageAlt:
          manifestView.subject.imageAlt ?? null,
      },
      modules: serializedModules,
    },
  };
}

export async function loadStudentModuleOverview(args: {
  actor: LoaderActor;
  subjectSlug: string;
  moduleSlug: string;
}): Promise<
  | {
      status: "ready";
      data: LearningModuleOverviewResponse;
    }
  | {
      status: "missing";
    }
> {
  const courseResult = await loadStudentCourseOverview({
    actor: args.actor,
    subjectSlug: args.subjectSlug,
  });

  if (courseResult.status !== "ready") {
    return courseResult;
  }

  const courseModule = courseResult.data.modules.find(
    (module) => module.slug === args.moduleSlug,
  );

  if (!courseModule) {
    return { status: "missing" };
  }

  const [
    intro,
    sectionPresentation,
    resolvedReviewModule,
  ] = await Promise.all([
    getResolvedModuleIntroFromManifest(
      args.subjectSlug,
      args.moduleSlug,
    ),
    getResolvedSectionPresentationMap(args.subjectSlug),
    getResolvedReviewModule(
      args.subjectSlug,
      args.moduleSlug,
    ),
  ]);

  if (!intro) {
    return { status: "missing" };
  }

  const rawReviewTopics = Array.isArray(
    (resolvedReviewModule as any)?.topics,
  )
    ? ((resolvedReviewModule as any).topics as Array<
        Record<string, unknown>
      >)
    : [];

  const reviewTopicBySlug = new Map<string, Record<string, unknown>>();

  for (const topic of rawReviewTopics) {
    const slug =
      cleanString(topic.slug) ??
      cleanString(topic.id);

    if (slug) {
      reviewTopicBySlug.set(slug, topic);
    }
  }

  const artifactTopicBySlug = new Map(
    SUBJECT_ARTIFACTS.topics
      .filter(
        (topic) =>
          topic.subjectSlug === args.subjectSlug &&
          topic.moduleSlug === args.moduleSlug,
      )
      .map((topic) => [
        topic.slug,
        topic as unknown as Record<string, unknown>,
      ]),
  );

  const sections = SUBJECT_ARTIFACTS.sections
    .filter(
      (section) =>
        section.subjectSlug === args.subjectSlug &&
        section.moduleSlug === args.moduleSlug,
    )
    .sort(
      (left, right) =>
        left.order - right.order ||
        left.slug.localeCompare(right.slug),
    )
    .map((section) => {
      const resolvedSection =
        sectionPresentation[section.slug];

      const topics = section.topicSlugs.map(
        (topicSlug, index) => {
          const reviewTopic =
            reviewTopicBySlug.get(topicSlug);
          const artifactTopic =
            artifactTopicBySlug.get(topicSlug);

          return {
            slug: topicSlug,
            title: displayTopicTitle(
              reviewTopic?.title ??
                artifactTopic?.title,
              topicSlug,
            ),
            order:
              cleanNumber(reviewTopic?.order) ??
              cleanNumber(artifactTopic?.order) ??
              index,
          };
        },
      );

      return {
        slug: section.slug,
        title:
          resolvedSection?.title ??
          section.title ??
          humanizeSlug(section.slug),
        description:
          resolvedSection?.description ??
          section.description ??
          null,
        order:
          resolvedSection?.order ??
          section.order,
        topics,
      };
    });

  return {
    status: "ready",
    data: {
      subject: courseResult.data.subject,
      module: {
        id: courseModule.id,
        slug: courseModule.slug,
        title: intro.module.title,
        description:
          intro.module.description || null,
        order:
          courseModule.order ??
          intro.module.order ??
          0,
        weekStart:
          courseModule.weekStart ??
          intro.module.weekStart ??
          null,
        weekEnd:
          courseModule.weekEnd ??
          intro.module.weekEnd ??
          null,
        meta: {
          estimatedMinutes:
            intro.module.meta.estimatedMinutes ?? null,
          prereqs:
            intro.module.meta.prereqs ?? [],
          outcomes:
            intro.module.meta.outcomes ?? [],
          why:
            intro.module.meta.why ?? [],
          videoUrl:
            intro.module.meta.videoUrl ?? null,
        },
      },
      stats: {
        sectionsCount: sections.length,
        topicsCount: sections.reduce(
          (count, section) =>
            count + section.topics.length,
          0,
        ),
      },
      access: courseModule.access,
      sections,
    },
  };
}
