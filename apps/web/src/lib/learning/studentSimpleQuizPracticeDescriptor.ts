import type {
  LearningRuntimeTarget,
} from "@zoeskoul/learning-contracts";

import type {
  ReviewCard,
  ReviewModule,
  ReviewTopic,
} from "@/lib/subjects/types";

const SIMPLE_QUIZ_KINDS = new Set([
  "single_choice",
  "multi_choice",
  "numeric",
]);

export type StudentSimpleQuizDescriptor = {
  card: Extract<ReviewCard, { type: "quiz" }>;
  exerciseKey: string;
  topicSlug: string;
  difficulty: "easy" | "medium" | "hard";
};

function aliases(value: string): string[] {
  const normalized = value.trim();
  if (!normalized) return [];

  const out = new Set([normalized]);
  const dot = normalized.lastIndexOf(".");

  if (
    dot >= 0 &&
    dot < normalized.length - 1
  ) {
    out.add(normalized.slice(dot + 1));
  }

  return Array.from(out);
}

function findTopic(
  module: ReviewModule,
  topicSlug: string,
): ReviewTopic | null {
  const wanted = new Set(aliases(topicSlug));

  for (const topic of module.topics) {
    if (
      aliases(topic.id).some(
        (value) => wanted.has(value),
      )
    ) {
      return topic;
    }
  }

  return null;
}

function exactExerciseKeys(
  card: Extract<ReviewCard, { type: "quiz" }>,
): string[] {
  return Array.from(
    new Set(
      (card.spec.exerciseKeys ?? [])
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function difficulty(
  value: unknown,
): "easy" | "medium" | "hard" {
  return value === "medium" || value === "hard"
    ? value
    : "easy";
}

export function isStudentSimpleQuizKind(
  value: unknown,
): value is
  | "single_choice"
  | "multi_choice"
  | "numeric" {
  return SIMPLE_QUIZ_KINDS.has(
    String(value ?? "").trim(),
  );
}

export function resolveStudentSimpleQuizDescriptor(
  args: {
    reviewModule: ReviewModule;
    target: LearningRuntimeTarget;
  },
): StudentSimpleQuizDescriptor | null {
  if (
    args.target.targetKind !== "card" ||
    args.target.runtimeKind !== "quiz" ||
    args.target.targetId !==
      args.target.ownerCardId
  ) {
    return null;
  }

  const topic = findTopic(
    args.reviewModule,
    args.target.topicSlug,
  );

  if (!topic) return null;

  const card = topic.cards.find(
    (
      candidate,
    ): candidate is Extract<
      ReviewCard,
      { type: "quiz" }
    > =>
      candidate.type === "quiz" &&
      candidate.id ===
        args.target.ownerCardId,
  );

  if (!card) return null;

  const keys = exactExerciseKeys(card);
  if (keys.length !== 1) return null;

  return {
    card,
    exerciseKey: keys[0],
    topicSlug:
      card.spec.topic?.trim() ||
      topic.id,
    difficulty: difficulty(
      card.spec.difficulty,
    ),
  };
}
