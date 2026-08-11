type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as UnknownRecord;
}

function normalizeMessageRef(ref: string) {
  return ref.startsWith("@:") ? ref.slice(2) : ref;
}

function looksLikeDraftMessageRef(value: string) {
  const normalized = normalizeMessageRef(value);
  return (
    value.startsWith("@:") ||
    normalized.startsWith("topics.") ||
    normalized.startsWith("sketches.")
  );
}

export function readDraftMessagePath(root: unknown, keyPath: string) {
  const parts = keyPath.split(".").filter(Boolean);
  let current: unknown = root;

  for (const part of parts) {
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || String(index) !== part) {
        return undefined;
      }

      current = current[index];
      continue;
    }

    const object = asRecord(current);
    if (!object) return undefined;
    current = object[part];
  }

  return current;
}

export function normalizeDraftQaExpectedForGrading(
  kind: unknown,
  expected: unknown,
): unknown {
  if (String(kind) !== "drag_reorder") return expected;

  const object = asRecord(expected);
  if (!object) return expected;

  const rawOrder = Array.isArray(object.order)
    ? object.order
    : Array.isArray(object.tokenIds)
      ? object.tokenIds
      : null;

  if (!rawOrder) return expected;

  return {
    ...object,
    kind: "drag_reorder",
    order: rawOrder.map((item) => String(item)),
  };
}

function isOptionalDraftQaMessagePath(path: readonly string[]) {
  const leaf = path[path.length - 1] ?? "";
  const parent = path[path.length - 2] ?? "";

  if (leaf === "expectedExampleMeta") return true;

  // buildExerciseFromManifest() moves expectedExampleMeta into the actual
  // runtime exercise shape as expectedExample.meta. That metadata is optional
  // in the practice contract, so an unresolved Draft QA message reference at
  // this exact root-level nested location should be omitted while preserving
  // expectedExample.kind/stdin/stdout.
  if (
    path.length === 2 &&
    parent === "expectedExample" &&
    leaf === "meta"
  ) {
    return true;
  }

  if (path.length === 1 && leaf === "hint") return true;

  return (
    parent === "help" &&
    (leaf === "concept" || leaf === "hint_1" || leaf === "hint_2")
  );
}

export function normalizeDraftQaOptionalMessageRefs(
  value: unknown,
  path: string[] = [],
): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      normalizeDraftQaOptionalMessageRefs(item, [...path, String(index)]),
    );
  }

  const object = asRecord(value);
  if (!object) return value;

  const entries: Array<[string, unknown]> = [];

  for (const [key, child] of Object.entries(object)) {
    const childPath = [...path, key];

    if (
      typeof child === "string" &&
      looksLikeDraftMessageRef(child) &&
      isOptionalDraftQaMessagePath(childPath)
    ) {
      continue;
    }

    const normalized = normalizeDraftQaOptionalMessageRefs(child, childPath);

    if (
      key === "help" &&
      asRecord(normalized) &&
      Object.keys(asRecord(normalized)!).length === 0
    ) {
      continue;
    }

    entries.push([key, normalized]);
  }

  return Object.fromEntries(entries);
}
