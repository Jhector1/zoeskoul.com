type UnknownRecord = Record<string, unknown>;

export type ReviewExerciseSourceCoordinates = {
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug: string;
  topicSlug: string;
};

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function text(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function exerciseKeyOf(value: unknown) {
  const row = record(value);
  return text(row?.exerciseKey, row?.id);
}

/**
 * Resolve the source coordinates for one authored learner exercise.
 *
 * Lesson/Review normally already carries these coordinates in q.fetch.
 * Standalone Practice/Daily/Challenge can arrive from a session item instead.
 * They must resolve back to the same authored subject/module/section/topic
 * identity before entering the shared QuizPracticeCard -> Review Tools path.
 */
export function resolveReviewExerciseSourceCoordinates(args: {
  exerciseKey: string;
  subjectSlug?: unknown;
  moduleSlug?: unknown;
  sectionSlug?: unknown;
  topicSlug?: unknown;
  exercise?: unknown;
  item?: unknown;
  selectedTargets?: readonly unknown[] | null;
}): ReviewExerciseSourceCoordinates {
  const exercise = record(args.exercise);
  const item = record(args.item);
  const itemExercise = record(item?.exercise);

  const requestedExerciseKey = text(
    args.exerciseKey,
    exerciseKeyOf(exercise),
    exerciseKeyOf(itemExercise),
  );

  const candidates = Array.isArray(args.selectedTargets)
    ? (args.selectedTargets.map(record).filter(Boolean) as UnknownRecord[])
    : [];

  const exactTargets = requestedExerciseKey
    ? candidates.filter((target) => exerciseKeyOf(target) === requestedExerciseKey)
    : [];

  const hintedTopic = text(
    exercise?.topicSlug,
    exercise?.topic,
    itemExercise?.topicSlug,
    itemExercise?.topic,
    item?.topicSlug,
    item?.topic,
    args.topicSlug,
  );

  const target =
    exactTargets.find((candidate) => {
      const candidateTopic = text(candidate.topicSlug, candidate.topic);
      return Boolean(
        hintedTopic &&
          candidateTopic &&
          candidateTopic === hintedTopic
      );
    }) ??
    (exactTargets.length === 1 ? exactTargets[0] : null);

  return {
    subjectSlug: text(
      target?.subjectSlug,
      exercise?.subjectSlug,
      itemExercise?.subjectSlug,
      item?.subjectSlug,
      args.subjectSlug,
      "practice",
    ),
    moduleSlug: text(
      target?.moduleSlug,
      exercise?.moduleSlug,
      itemExercise?.moduleSlug,
      item?.moduleSlug,
      args.moduleSlug,
      "practice",
    ),
    sectionSlug: text(
      target?.sectionSlug,
      target?.section,
      exercise?.sectionSlug,
      exercise?.section,
      itemExercise?.sectionSlug,
      itemExercise?.section,
      item?.sectionSlug,
      item?.section,
      args.sectionSlug,
    ),
    topicSlug: text(
      target?.topicSlug,
      target?.topic,
      exercise?.topicSlug,
      exercise?.topic,
      itemExercise?.topicSlug,
      itemExercise?.topic,
      item?.topicSlug,
      item?.topic,
      args.topicSlug,
      "all",
    ),
  };
}
