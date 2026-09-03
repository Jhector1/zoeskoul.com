import {
  Fragment,
  createContext,
  createElement,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import { formatIcuMessage } from "./icu-message";

export type IntlMessages = Record<string, unknown>;
type TranslationValues = Record<string, unknown>;
type RichMapper = (
  chunks: ReactNode,
) => ReactNode;
type RichValues = Record<
  string,
  ReactNode | RichMapper
>;

type Translator = ((
  key: string,
  values?: TranslationValues,
) => string) & {
  has: (key: string) => boolean;
  raw: (key: string) => unknown;
  rich: (
    key: string,
    values?: RichValues,
  ) => ReactNode;
};

const IntlContext = createContext<{
  locale: string;
  messages: IntlMessages;
}>({
  locale: "en",
  messages: {},
});

function getValue(
  messages: IntlMessages,
  path: string,
): unknown {
  let current: unknown = messages;

  for (
    const segment of
    path.split(".")
  ) {
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment)) {
        return undefined;
      }

      current = current[
        Number(segment)
      ];
      continue;
    }

    if (
      !current ||
      typeof current !== "object"
    ) {
      return undefined;
    }

    current = (
      current as Record<
        string,
        unknown
      >
    )[segment];
  }

  return current;
}

export function readIntlMessagePath(
  messages: Record<string, unknown>,
  path: string,
) {
  return getValue(
    messages,
    path,
  );
}


function formatScalarMessage(
  value: unknown,
  values?: TranslationValues,
  locale = "en",
): string {
  if (typeof value !== "string") {
    if (value == null) return "";
    return String(value);
  }

  return formatIcuMessage(
    value,
    values,
    locale,
  );
}

function richNodes(
  input: string,
  values: RichValues,
  keyPrefix = "rich",
): ReactNode[] {
  const result: ReactNode[] = [];
  const tagPattern =
    /<([a-zA-Z0-9_]+)>([\s\S]*?)<\/\1>/g;

  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = tagPattern.exec(input))) {
    if (match.index > cursor) {
      result.push(input.slice(cursor, match.index));
    }

    const tag = match[1];
    const content = match[2];
    const children = richNodes(
      content,
      values,
      `${keyPrefix}-${index}`,
    );
    const mapper = values[tag];
    const mapped =
      typeof mapper === "function"
        ? (mapper as RichMapper)(
            createElement(
              Fragment,
              null,
              ...children,
            ),
          )
        : createElement(
            Fragment,
            null,
            ...children,
          );

    result.push(
      createElement(
        Fragment,
        {
          key: `${keyPrefix}-${tag}-${index}`,
        },
        mapped,
      ),
    );

    cursor = match.index + match[0].length;
    index += 1;
  }

  if (cursor < input.length) {
    result.push(input.slice(cursor));
  }

  return result;
}

export function IntlBridgeProvider(props: {
  locale: string;
  messages: IntlMessages;
  children: ReactNode;
}) {
  return (
    <IntlContext.Provider
      value={{
        locale: props.locale,
        messages: props.messages,
      }}
    >
      {props.children}
    </IntlContext.Provider>
  );
}

export function useLocale() {
  return useContext(IntlContext).locale;
}

export function useMessages() {
  return useContext(IntlContext).messages;
}

export function useTranslations(
  namespace?: string,
): Translator {
  const { locale, messages } = useContext(IntlContext);

  return useMemo(() => {
    const fullKey = (key: string) =>
      namespace ? `${namespace}.${key}` : key;

    const translate = ((
      key: string,
      values?: TranslationValues,
    ) => {
      const value = getValue(
        messages,
        fullKey(key),
      );

      return formatScalarMessage(
        value === undefined ? key : value,
        values,
        locale,
      );
    }) as Translator;

    translate.has = (key: string) =>
      getValue(messages, fullKey(key)) !==
      undefined;

    translate.raw = (key: string) =>
      getValue(messages, fullKey(key));

    translate.rich = (
      key: string,
      values: RichValues = {},
    ) => {
      const value = getValue(
        messages,
        fullKey(key),
      );
      const source = formatScalarMessage(
        value === undefined ? key : value,
        values,
        locale,
      );
      const nodes = richNodes(
        source,
        values,
        fullKey(key),
      );

      return createElement(
        Fragment,
        null,
        ...nodes,
      );
    };

    return translate;
  }, [locale, messages, namespace]);
}
