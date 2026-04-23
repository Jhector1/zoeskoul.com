import type { TopicBundleManifest } from "./manifest.js";

export type TranslationEntry = {
  key: string;
  value: string;
};

export type TranslationEntriesPayload = {
  entries: TranslationEntry[];
};

export type TopicRecipe = {
  topicBundle: TopicBundleManifest;
  messagesByLocale: Record<string, Record<string, unknown>>;
};
