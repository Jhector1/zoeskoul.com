import type {
  ReviewProgressState,
  ReviewTopicProgress,
} from "./index";
import {
  getTopicProgressState,
  normalizeTopicProgressKey,
} from "./progressNormalization";

export type LessonNavigationCard =
  | {
      type: "text";
      id: string;
      runtimeRequired?: boolean;
    }
  | {
      type: "video";
      id: string;
    }
  | {
      type: "runtime";
      id: string;
      runtimeKind: "sketch" | "quiz" | "project";
    };

export type LessonNavigationTopic = {
  slug: string;
  cards: readonly LessonNavigationCard[];
};

export type LessonPosition = {
  topicIndex: number;
  cardIndex: number;
};

function readingComplete(
  topic: ReviewTopicProgress | null | undefined,
  cardId: string,
): boolean {
  return Boolean(
    topic?.readingDone?.[cardId] ||
      topic?.cardsDone?.[cardId],
  );
}

export function isLessonCardComplete(
  card: LessonNavigationCard,
  topic: ReviewTopicProgress | null | undefined,
): boolean {
  if (topic?.completed === true) {
    return true;
  }

  if (card.type === "runtime") {
    if (card.runtimeKind === "sketch") {
      return readingComplete(topic, card.id);
    }

    return Boolean(
      topic?.quizzesDone?.[card.id],
    );
  }

  if (
    card.type === "text" &&
    card.runtimeRequired === true
  ) {
    /**
     * The solution-safe lesson DTO intentionally omits the embedded Try It
     * identifier. Vite must not mark this card complete from readingDone
     * alone because the interactive runtime owns that assessment.
     */
    return false;
  }

  return readingComplete(topic, card.id);
}

export function canAutoCompleteLessonCard(
  card: LessonNavigationCard,
): boolean {
  return (
    card.type === "video" ||
    (
      card.type === "text" &&
      card.runtimeRequired !== true
    )
  );
}

export function isLessonTopicComplete(
  cards: readonly LessonNavigationCard[],
  topic: ReviewTopicProgress | null | undefined,
): boolean {
  if (topic?.completed === true) {
    return true;
  }

  return (
    cards.length > 0 &&
    cards.every((card) =>
      isLessonCardComplete(card, topic),
    )
  );
}

export function withActiveLessonTopic(
  progress: ReviewProgressState,
  topicSlug: string,
): ReviewProgressState {
  return {
    ...progress,
    activeTopicId:
      normalizeTopicProgressKey(topicSlug),
  };
}

function finalizeLessonTopicProgress(args: {
  progress: ReviewProgressState;
  topicSlug: string;
  nextTopic: ReviewTopicProgress;
  topics: readonly LessonNavigationTopic[];
  now?: string;
}): ReviewProgressState {
  const now =
    args.now ?? new Date().toISOString();
  const canonicalTopicKey =
    normalizeTopicProgressKey(args.topicSlug);
  const topicDefinition =
    args.topics.find(
      (topic) =>
        normalizeTopicProgressKey(
          topic.slug,
        ) === canonicalTopicKey,
    ) ?? null;
  const currentTopic =
    getTopicProgressState(
      args.progress.topics,
      args.topicSlug,
    ).topic ?? {};
  const complete = topicDefinition
    ? isLessonTopicComplete(
        topicDefinition.cards,
        args.nextTopic,
      )
    : false;

  const nextTopic: ReviewTopicProgress = {
    ...args.nextTopic,
    completed: complete,
    completedAt: complete
      ? currentTopic.completedAt ?? now
      : undefined,
  };

  const nextProgress: ReviewProgressState = {
    ...args.progress,
    topics: {
      ...(args.progress.topics ?? {}),
      [canonicalTopicKey]: nextTopic,
    },
  };

  const moduleComplete =
    args.topics.length > 0 &&
    args.topics.every((topic) => {
      const state =
        getTopicProgressState(
          nextProgress.topics,
          topic.slug,
        ).topic;

      return isLessonTopicComplete(
        topic.cards,
        state,
      );
    });

  return {
    ...nextProgress,
    moduleCompleted: moduleComplete,
    moduleCompletedAt: moduleComplete
      ? args.progress.moduleCompletedAt ?? now
      : undefined,
  };
}

export function buildLessonCardDoneProgress(args: {
  progress: ReviewProgressState;
  topicSlug: string;
  card: LessonNavigationCard;
  topics: readonly LessonNavigationTopic[];
  now?: string;
}): ReviewProgressState {
  if (!canAutoCompleteLessonCard(args.card)) {
    return args.progress;
  }

  const currentTopic =
    getTopicProgressState(
      args.progress.topics,
      args.topicSlug,
    ).topic ?? {};

  return finalizeLessonTopicProgress({
    progress: args.progress,
    topicSlug: args.topicSlug,
    topics: args.topics,
    now: args.now,
    nextTopic: {
      ...currentTopic,
      readingDone: {
        ...(currentTopic.readingDone ?? {}),
        [args.card.id]: true,
      },
      /**
       * Keep the old map populated while existing clients still read it.
       * readingDone remains the durable semantic source of truth.
       */
      cardsDone: {
        ...(currentTopic.cardsDone ?? {}),
        [args.card.id]: true,
      },
    },
  });
}

export function buildLessonAssessmentDoneProgress(args: {
  progress: ReviewProgressState;
  topicSlug: string;
  card: Extract<
    LessonNavigationCard,
    { type: "runtime" }
  >;
  topics: readonly LessonNavigationTopic[];
  now?: string;
}): ReviewProgressState {
  if (
    args.card.runtimeKind !== "quiz" &&
    args.card.runtimeKind !== "project"
  ) {
    return args.progress;
  }

  const currentTopic =
    getTopicProgressState(
      args.progress.topics,
      args.topicSlug,
    ).topic ?? {};

  return finalizeLessonTopicProgress({
    progress: args.progress,
    topicSlug: args.topicSlug,
    topics: args.topics,
    now: args.now,
    nextTopic: {
      ...currentTopic,
      quizzesDone: {
        ...(currentTopic.quizzesDone ?? {}),
        [args.card.id]: true,
      },
    },
  });
}

export function resolveInitialLessonTopicSlug(
  topics: readonly LessonNavigationTopic[],
  activeTopicId: string | null | undefined,
): string | null {
  if (!topics.length) return null;

  const canonical =
    normalizeTopicProgressKey(activeTopicId);

  const restored = topics.find(
    (topic) =>
      normalizeTopicProgressKey(
        topic.slug,
      ) === canonical,
  );

  return restored?.slug ?? topics[0]?.slug ?? null;
}

export function isLessonTopicUnlocked(args: {
  topics: readonly LessonNavigationTopic[];
  topicIndex: number;
  progress: ReviewProgressState | null | undefined;
  unlockAll?: boolean;
}): boolean {
  if (args.unlockAll) return true;
  if (args.topicIndex < 0) return false;
  if (args.topicIndex === 0) return true;

  const previous =
    args.topics[args.topicIndex - 1];

  if (!previous) return false;

  const previousState =
    getTopicProgressState(
      args.progress?.topics,
      previous.slug,
    ).topic;

  return isLessonTopicComplete(
    previous.cards,
    previousState,
  );
}

export function previousLessonPosition(
  topics: readonly LessonNavigationTopic[],
  current: LessonPosition,
): LessonPosition | null {
  if (current.cardIndex > 0) {
    return {
      topicIndex: current.topicIndex,
      cardIndex: current.cardIndex - 1,
    };
  }

  const previousTopicIndex =
    current.topicIndex - 1;

  if (previousTopicIndex < 0) {
    return null;
  }

  const previousTopic =
    topics[previousTopicIndex];

  if (!previousTopic) return null;

  return {
    topicIndex: previousTopicIndex,
    cardIndex: Math.max(
      0,
      previousTopic.cards.length - 1,
    ),
  };
}

export function nextLessonPosition(args: {
  topics: readonly LessonNavigationTopic[];
  current: LessonPosition;
  allowNextTopic: boolean;
}): LessonPosition | null {
  const topic =
    args.topics[args.current.topicIndex];

  if (!topic) return null;

  if (
    args.current.cardIndex <
    topic.cards.length - 1
  ) {
    return {
      topicIndex: args.current.topicIndex,
      cardIndex: args.current.cardIndex + 1,
    };
  }

  if (!args.allowNextTopic) {
    return null;
  }

  const nextTopicIndex =
    args.current.topicIndex + 1;

  if (!args.topics[nextTopicIndex]) {
    return null;
  }

  return {
    topicIndex: nextTopicIndex,
    cardIndex: 0,
  };
}
