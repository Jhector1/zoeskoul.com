export function keepEditorSelection(
  currentId: string | null,
  availableIds: readonly string[],
  fallbackId: string | null = null,
) {
  const available = new Set(availableIds.filter(Boolean));

  if (currentId && available.has(currentId)) return currentId;
  if (fallbackId && available.has(fallbackId)) return fallbackId;

  return availableIds.find((id) => available.has(id)) ?? null;
}

export function draftFilePairKey(pair: { exerciseId: string; path: string }) {
  return `${pair.exerciseId}:${pair.path}`;
}
