export type PracticeTitleResolver = (
  textOrTagged?: string | null,
  values?: Record<string, string | number | Date>,
  fallback?: string,
) => string;

export function toTaggedPracticeTitleKey(
  value: string | null | undefined,
): string | null {
  const key = value?.trim();
  if (!key) return null;
  return key.startsWith("@:") ? key : `@:${key}`;
}

export function resolvePracticeDisplayTitle(args: {
  title?: string | null;
  titleKey?: string | null;
  resolve: PracticeTitleResolver;
  fallback?: string;
}): string {
  const title = args.title?.trim() ?? "";
  const fallback = args.fallback ?? (title.startsWith("@:") ? "" : title);
  const taggedKey =
    toTaggedPracticeTitleKey(args.titleKey) ??
    (title.startsWith("@:") ? title : null);

  if (!taggedKey) return title || fallback;

  const resolved = args.resolve(taggedKey, {}, fallback).trim();
  if (resolved && !resolved.startsWith("@:")) return resolved;

  return fallback;
}
