export function orderDraftQaTopicsByManifest<T>(
  values: readonly T[],
  authoredTopicIds: readonly string[],
  topicIdOf: (value: T) => string,
): T[] {
  const rank = new Map<string, number>();

  for (const rawTopicId of authoredTopicIds) {
    const topicId = rawTopicId.trim();
    if (!topicId || rank.has(topicId)) continue;
    rank.set(topicId, rank.size);
  }

  return values
    .map((value, discoveryIndex) => ({
      value,
      discoveryIndex,
      rank: rank.get(topicIdOf(value).trim()),
    }))
    .sort((left, right) => {
      const leftAuthored = left.rank !== undefined;
      const rightAuthored = right.rank !== undefined;

      if (leftAuthored && rightAuthored) {
        return left.rank! - right.rank!;
      }

      if (leftAuthored) return -1;
      if (rightAuthored) return 1;

      // Do not invent placement for a draft-only/unlisted topic.
      // Preserve its deterministic discovery order after authored topics.
      return left.discoveryIndex - right.discoveryIndex;
    })
    .map(({ value }) => value);
}
