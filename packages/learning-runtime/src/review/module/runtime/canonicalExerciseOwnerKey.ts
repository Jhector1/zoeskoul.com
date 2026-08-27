type UnknownRecord = Record<string, unknown>;

type RegistryEntryLike = UnknownRecord & {
  ownerKind?: unknown;
  exerciseStateKey?: unknown;
  exerciseId?: unknown;
  cardId?: unknown;
  toolManifest?: unknown;
  item?: unknown;
};

type RegistryLike = {
  byKey?: Record<string, RegistryEntryLike | null | undefined>;
} | null | undefined;

type ExerciseRuntimeLike = UnknownRecord & {
  exerciseId?: unknown;
  cardId?: unknown;
  manifest?: unknown;
};

export type ResolveCanonicalExerciseOwnerKeyArgs = {
  registry: RegistryLike;
  exercises?: Record<string, ExerciseRuntimeLike | null | undefined> | null;
  boundExerciseKey?: string | null;
  activeExerciseKey?: string | null;
  authoredExerciseId?: string | null;
  ownerCardId?: string | null;
  fallbackExerciseKey?: string | null;
};

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function unique(values: unknown[]) {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

function entryForKey(registry: RegistryLike, key: string) {
  return registry?.byKey?.[`exercise:${key}`] ?? null;
}

function candidateIds(args: {
  entry: RegistryEntryLike | null;
  runtime: ExerciseRuntimeLike | null;
}) {
  const toolManifest = record(args.entry?.toolManifest);
  const item = record(args.entry?.item);
  const manifest = record(args.runtime?.manifest);

  return unique([
    args.entry?.exerciseId,
    toolManifest?.exerciseKey,
    toolManifest?.id,
    item?.exerciseKey,
    item?.id,
    args.runtime?.exerciseId,
    manifest?.exerciseKey,
    manifest?.id,
  ]);
}

function candidateCards(args: {
  entry: RegistryEntryLike | null;
  runtime: ExerciseRuntimeLike | null;
}) {
  return unique([args.entry?.cardId, args.runtime?.cardId]);
}

function matches(args: {
  key: string;
  registry: RegistryLike;
  exercises: Record<string, ExerciseRuntimeLike | null | undefined>;
  authoredExerciseId: string;
  ownerCardId: string;
}) {
  if (!args.key) return false;

  const entry = entryForKey(args.registry, args.key);
  const runtime = args.exercises[args.key] ?? null;
  if (!entry && !runtime) return false;

  if (args.ownerCardId) {
    if (!candidateCards({ entry, runtime }).includes(args.ownerCardId)) {
      return false;
    }
  }

  if (args.authoredExerciseId) {
    if (!candidateIds({ entry, runtime }).includes(args.authoredExerciseId)) {
      return false;
    }
  }

  return true;
}

/**
 * Resolve the canonical ExerciseRuntime owner for the mounted authored exercise.
 * Route/runtime registry ownership wins. q.fetch reconstruction is fallback only.
 */
export function resolveCanonicalExerciseOwnerKey(
  args: ResolveCanonicalExerciseOwnerKeyArgs,
): string {
  const registry = args.registry;
  const exercises = args.exercises ?? {};
  const authoredExerciseId = clean(args.authoredExerciseId);
  const ownerCardId = clean(args.ownerCardId);
  const fallbackExerciseKey = clean(args.fallbackExerciseKey);

  for (const key of unique([args.boundExerciseKey, args.activeExerciseKey])) {
    if (matches({
      key,
      registry,
      exercises,
      authoredExerciseId,
      ownerCardId,
    })) {
      return key;
    }
  }

  const registryMatches: string[] = [];
  for (const entry of Object.values(registry?.byKey ?? {})) {
    if (!entry || entry.ownerKind !== "exercise") continue;
    const key = clean(entry.exerciseStateKey);
    if (!key) continue;

    if (matches({
      key,
      registry,
      exercises,
      authoredExerciseId,
      ownerCardId,
    })) {
      registryMatches.push(key);
    }
  }

  const canonicalMatches = unique(registryMatches);
  if (canonicalMatches.length === 1) {
    return canonicalMatches[0];
  }

  if (
    fallbackExerciseKey &&
    matches({
      key: fallbackExerciseKey,
      registry,
      exercises,
      authoredExerciseId,
      ownerCardId,
    })
  ) {
    return fallbackExerciseKey;
  }

  // Never guess between multiple exercises on one project card.
  return fallbackExerciseKey;
}
