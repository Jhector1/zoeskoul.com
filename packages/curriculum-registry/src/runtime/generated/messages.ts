/* eslint-disable */
// AUTO-GENERATED canonical curriculum message loader.

const loaders: Record<
  string,
  () => Promise<Record<string, any>>
> = {
  "en": () => import("./messages.en.js").then((module) => module.default as Record<string, any>),
};

export async function loadCurriculumLocaleMessages(
  locale: string,
): Promise<Record<string, any>> {
  const loader = loaders[locale];
  return loader ? loader() : {};
}

export const AVAILABLE_CURRICULUM_MESSAGE_LOCALES =
  [
  "en"
] as const;
