export const I18N_TAG = "@:";

const KEY_RE = /^[a-zA-Z0-9_.:-]+$/;

export type Values = Record<
  string,
  string | number | Date
>;

export function isTaggedKey(
  value: unknown,
): value is string {
  if (typeof value !== "string") {
    return false;
  }

  if (!value.startsWith(I18N_TAG)) {
    return false;
  }

  const key = value.slice(I18N_TAG.length);

  return (
    key.length > 0 &&
    KEY_RE.test(key)
  );
}

export function stripTag(
  value: string,
): string {
  return value.slice(I18N_TAG.length);
}

export function toText(
  value: unknown,
  fallback = "",
): string {
  if (typeof value === "string") {
    return value;
  }

  if (value == null) {
    return fallback;
  }

  return String(value);
}
