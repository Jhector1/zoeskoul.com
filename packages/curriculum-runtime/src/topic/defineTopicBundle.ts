import type { ManifestRuntimeDefaults } from "@zoeskoul/curriculum-contracts";

export type JsonObject = { readonly [key: string]: unknown };
export type TopicPoolItem = {
  key: string;
  w: number;
  kind?: string;
  purpose?: "quiz" | "project";
};

export type TopicMeta = {
  label: string;
  minutes: number;
  preferKind?: string | null;
  pool?: readonly TopicPoolItem[];
  runtimeDefaults?: ManifestRuntimeDefaults | null;
};

export type TopicDefInput = {
  id: string;
  order?: number;
  variant?: string | null;
  titleKey?: string;
  description?: string | null;
  meta: TopicMeta;
};

export type SubjectTopicBundle = {
  def: TopicDefInput;
  review?: unknown;
  sketches?: Record<string, unknown>;
  generator?: unknown;
  locale?: JsonObject;
};

export type GeneratedSubjectTopicBundle = SubjectTopicBundle & {
  generator: unknown;
};

export function defineTopicBundle<T extends SubjectTopicBundle>(input: T): T {
  return input;
}
