function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stable(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function itemIdentity(value: unknown) {
  if (!isRecord(value)) return "";
  for (const key of ["id", "path", "name", "exerciseKey", "cardId", "topicId"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return `${key}:${candidate.trim()}`;
    }
  }
  return "";
}

function mergeArrays(base: unknown[], incoming: unknown[], current: unknown[]) {
  const identities = [...base, ...incoming, ...current].map(itemIdentity);
  const canMergeByIdentity = identities.some(Boolean) && identities.every(Boolean);
  if (!canMergeByIdentity) {
    if (stable(current) === stable(base)) return incoming;
    if (stable(incoming) === stable(base)) return current;
    return current;
  }

  const baseMap = new Map(base.map((value) => [itemIdentity(value), value]));
  const incomingMap = new Map(incoming.map((value) => [itemIdentity(value), value]));
  const currentMap = new Map(current.map((value) => [itemIdentity(value), value]));
  const orderedKeys = [
    ...current.map(itemIdentity),
    ...incoming.map(itemIdentity),
    ...base.map(itemIdentity),
  ].filter((key, index, values) => key && values.indexOf(key) === index);

  return orderedKeys.flatMap((key) => {
    const baseValue = baseMap.get(key);
    const incomingValue = incomingMap.get(key);
    const currentValue = currentMap.get(key);

    if (incomingValue === undefined && currentValue === undefined) return [];
    if (incomingValue === undefined) {
      if (stable(currentValue) === stable(baseValue)) return [];
      return [currentValue];
    }
    if (currentValue === undefined) return [incomingValue];

    return [mergeTutoringSnapshotValue(baseValue, incomingValue, currentValue)];
  });
}

/**
 * Three-way merge used when a learner explicitly applies a newer tutor snapshot.
 * Tutor changes flow into untouched values while learner-authored conflicts win.
 */
export function mergeTutoringSnapshotValue(
  base: unknown,
  incoming: unknown,
  current: unknown,
): unknown {
  if (stable(current) === stable(base)) return incoming;
  if (stable(incoming) === stable(base)) return current;
  if (stable(incoming) === stable(current)) return current;

  if (Array.isArray(incoming) && Array.isArray(current)) {
    return mergeArrays(Array.isArray(base) ? base : [], incoming, current);
  }

  if (isRecord(incoming) && isRecord(current)) {
    const baseRecord = isRecord(base) ? base : {};
    const keys = new Set([
      ...Object.keys(baseRecord),
      ...Object.keys(incoming),
      ...Object.keys(current),
    ]);
    const merged: Record<string, unknown> = {};
    for (const key of keys) {
      const baseValue = baseRecord[key];
      const incomingValue = incoming[key];
      const currentValue = current[key];

      if (incomingValue === undefined && currentValue === undefined) continue;
      if (incomingValue === undefined) {
        if (stable(currentValue) !== stable(baseValue)) merged[key] = currentValue;
        continue;
      }
      if (currentValue === undefined) {
        merged[key] = incomingValue;
        continue;
      }
      merged[key] = mergeTutoringSnapshotValue(
        baseValue,
        incomingValue,
        currentValue,
      );
    }
    return merged;
  }

  return current;
}

export function withTutoringBaseline<T>(state: T, version: number): T {
  if (!isRecord(state)) return state;
  return {
    ...state,
    __tutoringBaselineVersion: Math.max(0, Math.trunc(version)),
  } as T;
}

export function getTutoringBaselineVersion(state: unknown) {
  if (!isRecord(state)) return 0;
  const value = Number(state.__tutoringBaselineVersion ?? 0);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}
