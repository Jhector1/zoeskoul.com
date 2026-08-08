import type {
  LearningRuntimeTarget,
} from "@zoeskoul/learning-contracts";

import type {
  ReviewCard,
  ReviewModule,
} from "@zoeskoul/curriculum-contracts/subjects/types";

import {
  asJsonRecord,
  findStudentRuntimeTopic,
  runtimeString,
  studentRuntimeDifficulty,
} from "./studentRuntimePracticeDescriptorShared";

export type StudentEmbeddedTryItDescriptor = {
  ownerCard: ReviewCard;
  exerciseKey: string;
  topicSlug: string;
  difficulty: "easy" | "medium" | "hard";
  title: string | null;
};

export function resolveStudentEmbeddedTryItDescriptor(
  args: {
    reviewModule: ReviewModule;
    target: LearningRuntimeTarget;
  },
): StudentEmbeddedTryItDescriptor | null {
  if (
    args.target.targetKind !== "embedded_try_it" ||
    args.target.runtimeKind !== "try_it" ||
    args.target.targetId === args.target.ownerCardId
  ) {
    return null;
  }

  const topic = findStudentRuntimeTopic(
    args.reviewModule,
    args.target.topicSlug,
  );

  if (!topic) return null;

  const ownerCard = topic.cards.find(
    (candidate) =>
      candidate.id === args.target.ownerCardId,
  );

  if (!ownerCard) return null;

  const ownerRecord = asJsonRecord(ownerCard);
  const tryIt = asJsonRecord(ownerRecord?.tryIt);

  if (
    runtimeString(tryIt?.id) !==
      args.target.targetId
  ) {
    return null;
  }

  const exerciseKey = runtimeString(
    tryIt?.exerciseKey,
  );

  if (!exerciseKey) return null;

  return {
    ownerCard,
    exerciseKey,
    topicSlug: topic.id,
    difficulty: studentRuntimeDifficulty(
      tryIt?.difficulty,
    ),
    title:
      runtimeString(tryIt?.title) ||
      runtimeString(ownerRecord?.title) ||
      null,
  };
}
