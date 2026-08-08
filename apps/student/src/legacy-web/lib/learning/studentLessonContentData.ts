import type {
  LearningLessonCard,
  LearningLessonContentResponse,
  LearningModuleOverviewResponse,
} from "@zoeskoul/learning-contracts";

import type {
  ReviewCard,
  ReviewModule,
  ReviewTopic,
} from "@zoeskoul/curriculum-contracts/subjects/types";

function nullableString(
  value: unknown,
): string | null {
  return typeof value === "string" && value.trim()
    ? value
    : null;
}

function embeddedTryItId(
  card: ReviewCard,
): string | null {
  if (
    card.type !== "text" &&
    card.type !== "sketch"
  ) {
    return null;
  }

  const value = card.tryIt;

  return typeof value?.id === "string" &&
    value.id.trim()
    ? value.id.trim()
    : null;
}

function runtimeTarget(args: {
  sectionSlug: string;
  topicSlug: string;
  ownerCardId: string;
  targetKind: "card" | "embedded_try_it";
  targetId: string;
  runtimeKind:
    | "sketch"
    | "quiz"
    | "project"
    | "try_it";
}) {
  return {
    version: 1 as const,
    sectionSlug: args.sectionSlug,
    topicSlug: args.topicSlug,
    ownerCardId: args.ownerCardId,
    targetKind: args.targetKind,
    targetId: args.targetId,
    runtimeKind: args.runtimeKind,
  };
}

function projectCard(args: {
  card: ReviewCard;
  sectionSlug: string;
  topicSlug: string;
}): LearningLessonCard {
  const {
    card,
    sectionSlug,
    topicSlug,
  } = args;
  if (card.type === "text") {
    const tryItId = embeddedTryItId(card);

    return {
      type: "text",
      id: card.id,
      title: nullableString(card.title),
      markdown: card.markdown,
      runtimeRequired: Boolean(tryItId),
      runtime: tryItId
        ? runtimeTarget({
            sectionSlug,
            topicSlug,
            ownerCardId: card.id,
            targetKind: "embedded_try_it",
            targetId: tryItId,
            runtimeKind: "try_it",
          })
        : null,
    };
  }

  if (card.type === "video") {
    return {
      type: "video",
      id: card.id,
      title: nullableString(card.title),
      url: card.url,
      provider: card.provider ?? "auto",
      startSeconds:
        typeof card.startSeconds === "number"
          ? card.startSeconds
          : null,
      posterUrl:
        nullableString(card.posterUrl),
      captionMarkdown:
        nullableString(card.captionMarkdown),
    };
  }

  const tryItId =
    card.type === "sketch"
      ? embeddedTryItId(card)
      : null;

  const runtimeCard: Extract<
    LearningLessonCard,
    { type: "runtime" }
  > = {
    type: "runtime",
    id: card.id,
    title: nullableString(card.title),
    runtimeKind: card.type,
    runtime: runtimeTarget({
      sectionSlug,
      topicSlug,
      ownerCardId: card.id,
      targetKind: "card",
      targetId: card.id,
      runtimeKind: card.type,
    }),
  };

  return tryItId
    ? {
        ...runtimeCard,
        embeddedRuntime: runtimeTarget({
          sectionSlug,
          topicSlug,
          ownerCardId: card.id,
          targetKind: "embedded_try_it",
          targetId: tryItId,
          runtimeKind: "try_it",
        }),
      }
    : runtimeCard;
}

function reviewTopicAliases(
  topicId: string,
): string[] {
  const value = topicId.trim();
  if (!value) return [];

  const aliases = new Set<string>([value]);
  const dotIndex = value.lastIndexOf(".");

  if (dotIndex >= 0 && dotIndex < value.length - 1) {
    aliases.add(value.slice(dotIndex + 1));
  }

  return Array.from(aliases);
}

function reviewTopicMap(
  module: ReviewModule,
): Map<string, ReviewTopic> {
  const topics = new Map<string, ReviewTopic>();

  for (const topic of module.topics) {
    for (const alias of reviewTopicAliases(topic.id)) {
      topics.set(alias, topic);
    }
  }

  return topics;
}

function findReviewTopic(
  topics: Map<string, ReviewTopic>,
  topicSlug: string,
): ReviewTopic | undefined {
  for (const alias of reviewTopicAliases(topicSlug)) {
    const topic = topics.get(alias);
    if (topic) return topic;
  }

  return undefined;
}

export function buildStudentLessonContent(args: {
  overview: LearningModuleOverviewResponse;
  reviewModule: ReviewModule;
}): LearningLessonContentResponse {
  const topicBySlug = reviewTopicMap(
    args.reviewModule,
  );

  return {
    subject: args.overview.subject,
    module: args.overview.module,
    access: args.overview.access,
    sections: args.overview.sections.map(
      (section) => ({
        slug: section.slug,
        title: section.title,
        description: section.description,
        order: section.order,
        topics: section.topics.map((topic) => {
          const reviewTopic =
            findReviewTopic(
              topicBySlug,
              topic.slug,
            );

          return {
            slug: topic.slug,
            title: topic.title,
            summary:
              nullableString(
                reviewTopic?.summary,
              ),
            order: topic.order,
            cards:
              reviewTopic?.cards.map((card) =>
                projectCard({
                  card,
                  sectionSlug: section.slug,
                  topicSlug: topic.slug,
                }),
              ) ?? [],
          };
        }),
      }),
    ),
  };
}
