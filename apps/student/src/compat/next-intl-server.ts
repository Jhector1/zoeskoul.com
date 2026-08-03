type Values = Record<string, unknown>;

function translator(namespace?: string) {
  const translate = (
    key: string,
    _values?: Values,
  ) => namespace ? `${namespace}.${key}` : key;

  translate.raw = (key: string) =>
    namespace ? `${namespace}.${key}` : key;
  translate.has = (_key: string) => false;
  translate.rich = (
    key: string,
    _values?: Values,
  ) => translate(key);

  return translate;
}

export async function getLocale() {
  return "en";
}

export async function getMessages() {
  return {};
}

export async function getTranslations(
  namespace?:
    | string
    | {
        namespace?: string;
      },
) {
  return translator(
    typeof namespace === "string"
      ? namespace
      : namespace?.namespace,
  );
}
