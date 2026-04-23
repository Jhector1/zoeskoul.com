export const LOCALES = ["en", "fr", "ht", "es"] as const;
export type LocaleCode = (typeof LOCALES)[number];
export type LocaleBuildStatus =
  | "draft"
  | "machine_translated"
  | "reviewed"
  | "published";
