import { normalizeToolPresentationPolicy } from "@zoeskoul/curriculum-contracts";
import type {
  ReviewCard,
  ReviewModule,
  ReviewTopicShape,
} from "@/lib/subjects/types";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Copy only the current presentation policy. Lesson content remains frozen in
 * the tutoring snapshot, while UI policy fixes and author overrides can be
 * applied to sessions created before those policies were materialized.
 */
function withCurrentTools<T extends UnknownRecord>(
  frozen: T,
  current: UnknownRecord | null,
): T {
  if (!current) return frozen;

  const next = { ...frozen } as UnknownRecord;
  const tools = normalizeToolPresentationPolicy(current.tools);
  if (tools) {
    next.tools = tools;
  } else {
    delete next.tools;
  }
  return next as T;
}

function manifestIdentity(value: UnknownRecord, index: number) {
  return (
    asString(value.id) ||
    asString(value.exerciseKey) ||
    asString(value.exerciseId) ||
    asString(value.stableExerciseId) ||
    `index:${index}`
  );
}

function rebaseManifestCollection(
  frozenValue: unknown,
  currentValue: unknown,
): unknown {
  if (!Array.isArray(frozenValue) || !Array.isArray(currentValue)) {
    return frozenValue;
  }

  const currentByIdentity = new Map<string, UnknownRecord>();
  currentValue.forEach((item, index) => {
    const record = asRecord(item);
    if (!record) return;
    currentByIdentity.set(manifestIdentity(record, index), record);
  });

  return frozenValue.map((item, index) => {
    const frozenRecord = asRecord(item);
    if (!frozenRecord) return item;

    const currentRecord =
      currentByIdentity.get(manifestIdentity(frozenRecord, index)) ??
      asRecord(currentValue[index]);
    return currentRecord
      ? withCurrentTools(frozenRecord, currentRecord)
      : item;
  });
}

function rebaseRawManifestTools(
  frozenValue: unknown,
  currentValue: unknown,
): unknown {
  const frozen = asRecord(frozenValue);
  const current = asRecord(currentValue);
  if (!frozen || !current) return frozenValue;

  const next = withCurrentTools(frozen, current);
  next.cards = rebaseManifestCollection(frozen.cards, current.cards);
  next.exercises = rebaseManifestCollection(
    frozen.exercises,
    current.exercises,
  );
  return next;
}

function rebaseCardTools(
  frozenCard: ReviewCard,
  currentCard: ReviewCard | null,
): ReviewCard {
  if (!currentCard) return frozenCard;
  return withCurrentTools(
    frozenCard as unknown as UnknownRecord,
    currentCard as unknown as UnknownRecord,
  ) as unknown as ReviewCard;
}

function rebaseTopicTools(
  frozenTopic: ReviewTopicShape,
  currentTopic: ReviewTopicShape | null,
): ReviewTopicShape {
  if (!currentTopic) return frozenTopic;

  const frozenMeta = asRecord(frozenTopic.meta) ?? {};
  const currentMeta = asRecord(currentTopic.meta) ?? {};
  const nextMeta = withCurrentTools(frozenMeta, currentMeta);

  if (Object.prototype.hasOwnProperty.call(frozenMeta, "rawManifest")) {
    nextMeta.rawManifest = rebaseRawManifestTools(
      frozenMeta.rawManifest,
      currentMeta.rawManifest,
    );
  }

  const currentCards = new Map(
    currentTopic.cards.map((card) => [card.id, card] as const),
  );

  return {
    ...frozenTopic,
    meta: nextMeta,
    cards: frozenTopic.cards.map((card) =>
      rebaseCardTools(card, currentCards.get(card.id) ?? null),
    ),
  };
}

/**
 * Rebase only Tools presentation policies from the current published module
 * onto a frozen tutoring module. This is deliberately narrower than replacing
 * the snapshot: prose, exercises, starter files, and learner/tutor work remain
 * frozen exactly as they were when the session was created.
 */
export function rebaseTutoringModuleToolPresentation(args: {
  frozenModule: ReviewModule;
  currentModule: ReviewModule | null | undefined;
}): ReviewModule {
  const { frozenModule, currentModule } = args;
  if (!currentModule) return frozenModule;

  const currentTopics = new Map(
    currentModule.topics.map((topic) => [topic.id, topic] as const),
  );
  const topics = frozenModule.topics.map((topic) =>
    rebaseTopicTools(topic, currentTopics.get(topic.id) ?? null),
  );
  const rebasedById = new Map(topics.map((topic) => [topic.id, topic] as const));

  return {
    ...frozenModule,
    topics,
    sections: frozenModule.sections?.map((section) => ({
      ...section,
      topics: section.topics.map(
        (topic) => rebasedById.get(topic.id) ?? topic,
      ),
    })),
  };
}
