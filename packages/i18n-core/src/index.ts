export type I18nMessages = Record<string, unknown>;

function isRecord(
  value: unknown,
): value is I18nMessages {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

/**
 * Deeply overlays localized messages onto the canonical base locale.
 *
 * Objects merge recursively.
 * Scalars and arrays from the localized locale replace the base value.
 * Missing localized keys remain available from the base locale.
 */
export function mergeMessages(
  base: I18nMessages,
  localized: I18nMessages,
): I18nMessages {
  const result: I18nMessages = { ...base };

  for (
    const [key, localizedValue]
    of Object.entries(localized)
  ) {
    const baseValue = result[key];

    if (
      isRecord(baseValue) &&
      isRecord(localizedValue)
    ) {
      result[key] = mergeMessages(
        baseValue,
        localizedValue,
      );
      continue;
    }

    result[key] = localizedValue;
  }

  return result;
}

export async function loadMessagesWithFallback(args: {
  locale: string;
  defaultLocale?: string;
  loadLocaleMessages: (
    locale: string,
  ) => Promise<I18nMessages>;
}): Promise<I18nMessages> {
  const defaultLocale =
    args.defaultLocale ?? "en";

  const base =
    await args.loadLocaleMessages(defaultLocale);

  if (args.locale === defaultLocale) {
    return base;
  }

  const localized =
    await args.loadLocaleMessages(args.locale);

  return mergeMessages(base, localized);
}

export {
  formatMoneyMinor,
  toIntlLocale,
} from "./money";

export {
  I18N_TAG,
  isTaggedKey,
  stripTag,
  toText,
  type Values,
} from "./tagged";

export function tag(key: string): string {
  return `@:${key}`;
}

export {
  resolveDeepTagged,
  type DeepResolved,
} from "./resolveDeepTagged";
