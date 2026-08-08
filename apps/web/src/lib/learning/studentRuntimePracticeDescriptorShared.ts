import type {
  ReviewModule,
  ReviewTopic,
} from "@zoeskoul/curriculum-contracts/subjects/types";

export type JsonRecord = Record<string, unknown>;

export function asJsonRecord(
  value: unknown,
): JsonRecord | null {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  )
    ? value as JsonRecord
    : null;
}

export function runtimeString(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function aliases(value: string): string[] {
  const normalized = value.trim();
  if (!normalized) return [];

  const out = new Set([normalized]);
  const dot = normalized.lastIndexOf(".");

  if (
    dot >= 0 &&
    dot < normalized.length - 1
  ) {
    out.add(normalized.slice(dot + 1));
  }

  return Array.from(out);
}

export function findStudentRuntimeTopic(
  module: ReviewModule,
  topicSlug: string,
): ReviewTopic | null {
  const wanted = new Set(aliases(topicSlug));

  for (const topic of module.topics) {
    if (
      aliases(topic.id).some(
        (value) => wanted.has(value),
      )
    ) {
      return topic;
    }
  }

  return null;
}

export function studentRuntimeDifficulty(
  value: unknown,
): "easy" | "medium" | "hard" {
  return value === "medium" || value === "hard"
    ? value
    : "easy";
}
