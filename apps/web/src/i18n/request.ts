import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";
import {
  loadLocaleMessages as loadAppLocaleMessages,
} from "./messages.generated";
import {
  loadCurriculumLocaleMessages,
} from "@zoeskoul/curriculum-registry/runtime";

type AnyObj = Record<string, any>;

function isObject(v: any): v is AnyObj {
    return v && typeof v === "object" && !Array.isArray(v);
}

function deepMerge<T extends AnyObj>(base: T, override: AnyObj): T {
    const out: AnyObj = { ...base };

    for (const k of Object.keys(override ?? {})) {
        const bv = out[k];
        const ov = override[k];

        if (isObject(bv) && isObject(ov)) out[k] = deepMerge(bv, ov);
        else out[k] = ov;
    }

    return out as T;
}


type CurriculumMessageObject = Record<string, any>;

function isCurriculumMessageObject(
  value: unknown,
): value is CurriculumMessageObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeCurriculumMessages(
  base: CurriculumMessageObject,
  override: CurriculumMessageObject,
): CurriculumMessageObject {
  const out: CurriculumMessageObject = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const current = out[key];

    out[key] =
      isCurriculumMessageObject(current) &&
      isCurriculumMessageObject(value)
        ? mergeCurriculumMessages(current, value)
        : value;
  }

  return out;
}

async function loadLocaleMessages(
  locale: string,
): Promise<CurriculumMessageObject> {
  const [appMessages, curriculumMessages] = await Promise.all([
    loadAppLocaleMessages(locale),
    loadCurriculumLocaleMessages(locale),
  ]);

  return mergeCurriculumMessages(
    appMessages,
    curriculumMessages,
  );
}

export default getRequestConfig(async ({ requestLocale }) => {
    let locale = await requestLocale;

    if (!hasLocale(routing.locales, locale)) {
        locale = routing.defaultLocale;
    }

    const base = await loadLocaleMessages(routing.defaultLocale);
    const localized =
        locale === routing.defaultLocale ? {} : await loadLocaleMessages(locale);

    return {
        locale,
        messages: deepMerge(base, localized),

        onError(error) {
            if (process.env.NODE_ENV === "development") {
                console.error(error);
            }
        },

        getMessageFallback({ namespace, key }) {
            if (process.env.NODE_ENV === "development") {
                return namespace ? `${namespace}.${key}` : key;
            }
            return "";
        }
    };
});

