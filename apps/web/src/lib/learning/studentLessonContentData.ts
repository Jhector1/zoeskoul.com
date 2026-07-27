import type {
  LearningLessonCard,
  LearningLessonContentResponse,
  LearningModuleOverviewResponse,
} from "@zoeskoul/learning-contracts";

import type {
  ReviewCard,
  ReviewModule,
  ReviewTopic,
} from "@/lib/subjects/types";

function nullableString(
  value: unknown,
): string | null {
  return typeof value === "string" && value.trim()
    ? value
    : null;
}

function projectCard(
  card: ReviewCard,
): LearningLessonCard {
  if (card.type === "text") {
    return {
      type: "text",
      id: card.id,
      title: nullableString(card.title),
      markdown: card.markdown,
      runtimeRequired: Boolean(card.tryIt),
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

  return {
    type: "runtime",
    id: card.id,
    title: nullableString(card.title),
    runtimeKind: card.type,
  };
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
              reviewTopic?.cards.map(projectCard) ??
              [],
          };
        }),
      }),
    ),
  };
}
