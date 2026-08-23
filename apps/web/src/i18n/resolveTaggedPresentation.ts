import "server-only";

import {
  isTaggedKey,
  resolveDeepTagged,
  stripTag,
  type DeepResolved,
  type I18nMessages,
} from "@zoeskoul/i18n-core";

import { loadWebLocaleMessages } from "@/i18n/messages";

const GENERIC_LEAF_SEGMENTS = new Set([
  "title",
  "label",
  "name",
  "prompt",
  "summary",
  "description",
  "subtitle",
  "heading",
]);

function humanizeSegment(value: string): string {
  const words = value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  if (!words) return "Untitled";

  return words
    .split(" ")
    .map((word) => {
      if (/^[A-Z0-9]{2,}$/.test(word)) return word;
      if (/^v\d+$/i.test(word)) return word.toUpperCase();
      return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
    })
    .join(" ");
}

export function readableTaggedFallback(value: string): string {
  const raw = isTaggedKey(value) ? stripTag(value) : value;
  const segments = raw
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);

  while (
    segments.length > 1 &&
    GENERIC_LEAF_SEGMENTS.has(
      segments[segments.length - 1]!.toLowerCase(),
    )
  ) {
    segments.pop();
  }

  return humanizeSegment(
    segments[segments.length - 1] ?? raw,
  );
}

export function messageAtPath(
  messages: I18nMessages,
  key: string,
): unknown {
  let current: unknown = messages;

  for (const segment of key.split(".")) {
    if (
      !current ||
      typeof current !== "object" ||
      Array.isArray(current)
    ) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function containsTaggedKey(value: unknown): boolean {
  if (typeof value === "string") {
    return isTaggedKey(value);
  }

  if (Array.isArray(value)) {
    return value.some(containsTaggedKey);
  }

  if (value && typeof value === "object") {
    return Object.values(value).some(containsTaggedKey);
  }

  return false;
}

/**
 * Resolve API presentation strings from the same canonical message sources
 * used across ZoeSkoul. This boundary is intentionally request-independent:
 * browser apps do not need Next/React i18n context, and they never own message
 * lookup or tagged-key parsing.
 */
export async function resolveTaggedPresentation<T>(
  value: T,
  locale = "en",
): Promise<DeepResolved<T>> {
  if (!containsTaggedKey(value)) {
    return value as DeepResolved<T>;
  }

  const messages = await loadWebLocaleMessages(locale);

  return resolveDeepTagged(
    value,
    (key) => {
      const resolved = messageAtPath(messages, key);

      if (
        typeof resolved === "string" &&
        resolved.trim().length > 0
      ) {
        return resolved;
      }

      if (
        typeof resolved === "number" ||
        typeof resolved === "boolean"
      ) {
        return String(resolved);
      }

      return readableTaggedFallback(`@:${key}`);
    },
  ) as DeepResolved<T>;
}
