import {
  loadMessagesWithFallback,
  type I18nMessages,
} from "@zoeskoul/i18n-core";

import {
  loadLocaleMessages as loadGeneratedLocaleMessages,
} from "../legacy-web/i18n/messages.generated";

import {
  loadCurriculumLocaleMessages,
} from "@zoeskoul/curriculum-registry/runtime";

export type StudentLocaleMessageLoader = (
  locale: string,
) => Promise<I18nMessages>;

type StudentMessageObject = Record<string, any>;

function isStudentMessageObject(
  value: unknown,
): value is StudentMessageObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeStudentMessages(
  base: StudentMessageObject,
  override: StudentMessageObject,
): StudentMessageObject {
  const out: StudentMessageObject = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const current = out[key];

    out[key] =
      isStudentMessageObject(current) &&
      isStudentMessageObject(value)
        ? mergeStudentMessages(current, value)
        : value;
  }

  return out;
}

async function loadDefaultStudentLocaleMessages(
  locale: string,
): Promise<I18nMessages> {
  const [appMessages, curriculumMessages] = await Promise.all([
    loadGeneratedLocaleMessages(locale),
    loadCurriculumLocaleMessages(locale),
  ]);

  return mergeStudentMessages(
    appMessages as StudentMessageObject,
    curriculumMessages as StudentMessageObject,
  ) as I18nMessages;
}


export function loadStudentLocaleMessages(
  locale: string,
  loadLocaleMessages: StudentLocaleMessageLoader =
    loadDefaultStudentLocaleMessages,
) {
  return loadMessagesWithFallback({
    locale,
    defaultLocale: "en",
    loadLocaleMessages,
  });
}
