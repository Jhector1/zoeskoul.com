import type {
  LearningRuntimeTarget,
} from "@zoeskoul/learning-contracts";

import type {
  ReviewCard,
  ReviewModule,
} from "@zoeskoul/curriculum-contracts/subjects/types";

import {
  findStudentRuntimeTopic,
  studentRuntimeDifficulty,
} from "./studentRuntimePracticeDescriptorShared";

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

function selectedExerciseKey(
  card: Extract<ReviewCard, { type: "quiz" }>,
): string | null {
  const migrated =
    card.studentRuntimeExerciseKey
      ?.trim();

  if (migrated) return migrated;

  const exact = Array.from(
    new Set(
      (card.spec.exerciseKeys ?? [])
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );

  return exact.length === 1
    ? exact[0]
    : null;
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

  const topic = findStudentRuntimeTopic(
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

  const exerciseKey =
    selectedExerciseKey(card);
  if (!exerciseKey) return null;

  return {
    card,
    exerciseKey,
    topicSlug:
      card.spec.topic?.trim() ||
      topic.id,
    difficulty: studentRuntimeDifficulty(
      card.spec.difficulty,
    ),
  };
}
