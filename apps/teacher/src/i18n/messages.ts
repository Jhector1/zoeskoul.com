import {
  loadMessagesWithFallback,
  type I18nMessages,
} from "@zoeskoul/i18n-core";

import {
  loadLocaleMessages as loadGeneratedLocaleMessages,
} from "./messages.generated";

export type TeacherLocaleMessageLoader = (
  locale: string,
) => Promise<I18nMessages>;

export function loadTeacherLocaleMessages(
  locale: string,
  loadLocaleMessages: TeacherLocaleMessageLoader =
    loadGeneratedLocaleMessages,
) {
  return loadMessagesWithFallback({
    locale,
    defaultLocale: "en",
    loadLocaleMessages,
  });
}
