import {
  loadMessagesWithFallback,
  mergeMessages,
  type I18nMessages,
} from "@zoeskoul/i18n-core";
import {
  loadCurriculumLocaleMessages,
} from "@zoeskoul/curriculum-registry/runtime";

import {
  loadLocaleMessages as loadGeneratedLocaleMessages,
} from "@/i18n/messages.generated";

export type WebLocaleMessageLoader = (
  locale: string,
) => Promise<I18nMessages>;

const defaultMessageCache = new Map<
  string,
  Promise<I18nMessages>
>();

async function loadDefaultWebLocaleMessages(
  locale: string,
): Promise<I18nMessages> {
  const cached = defaultMessageCache.get(locale);
  if (cached) return cached;

  const pending = Promise.all([
    loadGeneratedLocaleMessages(locale),
    loadCurriculumLocaleMessages(locale),
  ]).then(([appMessages, curriculumMessages]) =>
    mergeMessages(
      appMessages as I18nMessages,
      curriculumMessages as I18nMessages,
    ),
  );

  defaultMessageCache.set(locale, pending);

  try {
    return await pending;
  } catch (error) {
    defaultMessageCache.delete(locale);
    throw error;
  }
}

export function loadWebLocaleMessages(
  locale: string,
  loadLocaleMessages: WebLocaleMessageLoader =
    loadDefaultWebLocaleMessages,
) {
  return loadMessagesWithFallback({
    locale,
    defaultLocale: "en",
    loadLocaleMessages,
  });
}
