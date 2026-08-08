import {
  loadMessagesWithFallback,
  type I18nMessages,
} from "@zoeskoul/i18n-core";

import {
  loadLocaleMessages as loadGeneratedLocaleMessages,
} from "../legacy-web/i18n/messages.generated";

export type StudentLocaleMessageLoader = (
  locale: string,
) => Promise<I18nMessages>;

export function loadStudentLocaleMessages(
  locale: string,
  loadLocaleMessages: StudentLocaleMessageLoader =
    loadGeneratedLocaleMessages,
) {
  return loadMessagesWithFallback({
    locale,
    defaultLocale: "en",
    loadLocaleMessages,
  });
}
