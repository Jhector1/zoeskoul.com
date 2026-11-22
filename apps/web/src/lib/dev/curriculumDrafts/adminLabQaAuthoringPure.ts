import { AdminLabFilesystemExpectedSchema, type AdminLabFilesystemExpected } from "@zoeskoul/code-contracts";

/** Development-only authoring format. NOT a student quizDraft or published topic. */
export type AuthorOnlyAdminQaExercise = {
  id: string;
  title: string;
  instructions: string;
  expected: AdminLabFilesystemExpected;
};
export type AuthorOnlyAdminQaContract = {
  version: 1;
  purpose: "draft-admin-lab-qa-only";
  topicSlug: string;
  exercises: AuthorOnlyAdminQaExercise[];
};

export const AUTHOR_ONLY_QA_TOPIC_MODULES: Readonly<Record<string, string>> = Object.freeze({
  "sudo-root-concepts": "linux-module-3-users-groups-troubleshooting",
  "ownership-administration-concepts": "linux-module-3-users-groups-troubleshooting",
  "final-capstone-secure-project": "linux-module-4-secure-project-capstone",
});
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const isApprovedTopic = (value: string): boolean =>
  Object.prototype.hasOwnProperty.call(AUTHOR_ONLY_QA_TOPIC_MODULES, value);
const KEY_PREFIX = "draft-admin-fs-qa.v1.";

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function keysExactly(record: Record<string, unknown>, allowed: string[]): boolean {
  return JSON.stringify(Object.keys(record).sort()) === JSON.stringify([...allowed].sort());
}

export function parseAuthorOnlyAdminQaContract(
  raw: unknown, expectedTopic: string,
): AuthorOnlyAdminQaContract {
  const spec = asObject(raw);
  if (!isApprovedTopic(expectedTopic) || !spec ||
      !keysExactly(spec, ["version", "purpose", "topicSlug", "exercises"]) ||
      spec.version !== 1 || spec.purpose !== "draft-admin-lab-qa-only" ||
      spec.topicSlug !== expectedTopic || !Array.isArray(spec.exercises) ||
      spec.exercises.length < 1 || spec.exercises.length > 5) {
    throw new Error("Invalid author-only draft administrator QA contract.");
  }
  const exercises: AuthorOnlyAdminQaExercise[] = [];
  const ids = new Set<string>();
  for (const item of spec.exercises) {
    const row = asObject(item);
    if (!row || !keysExactly(row, ["id", "title", "instructions", "expected"]) ||
        typeof row.id !== "string" || !ID.test(row.id) || ids.has(row.id) ||
        typeof row.title !== "string" || row.title.trim().length < 8 || row.title.length > 120 ||
        typeof row.instructions !== "string" || row.instructions.trim().length < 20 ||
        row.instructions.length > 4000) {
      throw new Error("Invalid author-only draft administrator QA exercise.");
    }
    const expected = AdminLabFilesystemExpectedSchema.safeParse(row.expected);
    if (!expected.success) throw new Error("Invalid trusted administrator QA filesystem targets.");
    ids.add(row.id);
    exercises.push({id: row.id, title: row.title, instructions: row.instructions,
      expected: expected.data});
  }
  return {version: 1, purpose: "draft-admin-lab-qa-only", topicSlug: expectedTopic, exercises};
}

/** Browser receives only this stable opaque selector, never expected filesystem metadata. */
export function authorOnlyAdminQaKey(topic: string, exerciseId: string): string {
  if (!isApprovedTopic(topic) || !ID.test(exerciseId)) {
    throw new Error("Invalid administrator QA key.");
  }
  return `${KEY_PREFIX}${topic}.${exerciseId}`;
}
export function parseAuthorOnlyAdminQaKey(value: unknown): {topic: string; id: string; module: string} | null {
  if (typeof value !== "string" || value.length > 250 || !value.startsWith(KEY_PREFIX)) return null;
  const suffix = value.slice(KEY_PREFIX.length);
  const parts = suffix.split(".");
  if (parts.length !== 2) return null;
  const [topic, id] = parts;
  if (typeof topic !== "string" || typeof id !== "string" || !isApprovedTopic(topic) || !ID.test(id)) return null;
  return {topic, id, module:AUTHOR_ONLY_QA_TOPIC_MODULES[topic]!};
}
