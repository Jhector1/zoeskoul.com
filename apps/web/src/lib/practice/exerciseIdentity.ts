import type { Exercise } from "@/lib/practice/types";
import type { QItem } from "@/lib/practice/uiTypes";

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}


function readInstanceIdFromSignedPracticeKey(value: unknown) {
  if (typeof value !== "string") return null;
  const body = value.split(".", 1)[0];
  if (!body) return null;

  try {
    const decode = globalThis.atob;
    if (typeof decode !== "function") return null;

    const base64 = body
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(body.length / 4) * 4, "=");
    const payload = JSON.parse(decode(base64));
    return firstText(payload?.instanceId);
  } catch {
    return null;
  }
}

function normalizeIdentityPart(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/**
 * Returns a stable authored exercise identity.
 *
 * Practice `item.key` is an expiring signed authorization token. It must never
 * be used as a React key, tool scope, editor owner, or persisted workspace id.
 * Refreshing that token should not remount the exercise or reset the editor.
 */
export function resolveStablePracticeExerciseId(args: {
  item?: QItem | null;
  exercise?: Exercise | null;
  fallbackIndex?: number | null;
}) {
  const item = args.item as any;
  const exercise = args.exercise as any;

  const authored = firstText(
    exercise?.exerciseKey,
    item?.exerciseKey,
    exercise?.id,
    item?.exercise?.exerciseKey,
    item?.exercise?.id,
  );

  if (authored) return normalizeIdentityPart(authored);

  const instanceId = readInstanceIdFromSignedPracticeKey(item?.key);
  if (instanceId) return `instance:${normalizeIdentityPart(instanceId)}`;

  const semantic = [
    exercise?.topic ?? item?.exercise?.topic,
    exercise?.kind ?? item?.exercise?.kind,
    exercise?.title ?? item?.exercise?.title,
  ]
    .map(normalizeIdentityPart)
    .filter(Boolean)
    .join(":");

  if (semantic) return semantic;

  const index = Number(args.fallbackIndex);
  return `practice-${Number.isInteger(index) && index >= 0 ? index : 0}`;
}

export function samePracticeExerciseIdentity(args: {
  leftItem?: QItem | null;
  leftExercise?: Exercise | null;
  rightItem?: QItem | null;
  rightExercise?: Exercise | null;
}) {
  return (
    resolveStablePracticeExerciseId({
      item: args.leftItem,
      exercise: args.leftExercise,
    }) ===
    resolveStablePracticeExerciseId({
      item: args.rightItem,
      exercise: args.rightExercise,
    })
  );
}
