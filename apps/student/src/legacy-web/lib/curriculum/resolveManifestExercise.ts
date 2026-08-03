export function resolveManifestExercise(args: {
  topicBundle: any;
  exerciseKey: string;
}) {
  const exercise = args.topicBundle?.exercises?.find(
    (item: any) => item.id === args.exerciseKey,
  );

  if (!exercise) {
    throw new Error(
      `Project step points to missing exerciseKey "${args.exerciseKey}" in topic "${args.topicBundle?.topicId ?? "unknown"}".`,
    );
  }

  return exercise;
}
