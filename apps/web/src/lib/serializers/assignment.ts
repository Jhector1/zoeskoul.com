// src/lib/serializers/assignment.ts

export type TopicUI = {
  id: string;
  slug: string;
  titleKey: string;
  order?: number;
};

export type AssignmentPublicUI = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  difficulty: "easy" | "medium" | "hard";
  questionCount: number;
  availableFrom: string | null;
  dueAt: string | null;
  timeLimitSec: number | null;
  allowReveal: boolean;
  showDebug: boolean;
  maxAttempts: number | null;

  // ✅ the important part
  topics: TopicUI[];

  // optional: convenience
  topicSlugs: string[];
};

function toIsoOrNull(d: any) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isFinite(dt.getTime()) ? dt.toISOString() : null;
}

/**
 * Normalize an Assignment (with join rows included) into the shape the PUBLIC UI needs.
 * Expects `a.topics` as join rows with `.topic` included.
 */
export function serializeAssignmentPublic(a: any): AssignmentPublicUI {
  const topicRows = Array.isArray(a?.topics) ? a.topics : [];
  const topics: TopicUI[] = topicRows
    .slice()
    .sort((x: any, y: any) => (x?.order ?? 0) - (y?.order ?? 0))
    .map((row: any) => ({
      id: row.topic?.id ?? row.topicId,
      slug: row.topic?.slug ?? "",
      titleKey: row.topic?.titleKey ?? "",
      order: row.topic?.order ?? 0,
    }))
    .filter((t: TopicUI) => !!t.slug && !!t.titleKey);

  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    description: a.description ?? null,
    difficulty: a.difficulty,
    questionCount: a.questionCount ?? 10,
    availableFrom: toIsoOrNull(a.availableFrom),
    dueAt: toIsoOrNull(a.dueAt),
    timeLimitSec: a.timeLimitSec ?? null,
    allowReveal: !!a.allowReveal,
    showDebug: !!a.showDebug,
    maxAttempts: a.maxAttempts ?? null,

    topics,
    topicSlugs: topics.map((t) => t.slug),
  };
}
