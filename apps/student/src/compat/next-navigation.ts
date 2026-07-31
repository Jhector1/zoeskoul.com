import { useMemo } from "react";
import {
  currentLocale,
  navigate,
  useLocationSnapshot,
  refreshClientData,
} from "./navigation-runtime";

export function usePathname() {
  useLocationSnapshot();
  return window.location.pathname;
}

export function useSearchParams() {
  const value = useLocationSnapshot();
  return useMemo(
    () => new URLSearchParams(window.location.search),
    [value],
  );
}

export function useRouter() {
  useLocationSnapshot();

  return useMemo(
    () => ({
      push: (
        href: string,
        options?: { scroll?: boolean },
      ) => navigate(href, { scroll: options?.scroll }),
      replace: (
        href: string,
        options?: { scroll?: boolean },
      ) =>
        navigate(href, {
          replace: true,
          scroll: options?.scroll,
        }),
      back: () => window.history.back(),
      forward: () => window.history.forward(),
      refresh: () => refreshClientData(),
      prefetch: async (_href: string) => undefined,
    }),
    [],
  );
}

export function useParams<T extends Record<string, string>>() {
  useLocationSnapshot();
  const segments = window.location.pathname
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);

  const locale =
    /^(en|es|fr|ht)$/.test(segments[0] ?? "")
      ? segments.shift()!
      : currentLocale();

  const result: Record<string, string> = { locale };

  const catalogsIndex = segments.indexOf("catalogs");
  if (catalogsIndex >= 0 && segments[catalogsIndex + 1]) {
    result.catalogSlug = segments[catalogsIndex + 1];
  }

  const subjectsIndex = segments.indexOf("subjects");
  const modulesIndex = segments.indexOf("modules");

  if (subjectsIndex >= 0 && segments[subjectsIndex + 1]) {
    result.subjectSlug = segments[subjectsIndex + 1];
  } else if (
    modulesIndex > 0 &&
    segments[modulesIndex - 1]
  ) {
    // Original subject-first route:
    // /<locale>/<subjectSlug>/modules/<moduleSlug>/learn
    result.subjectSlug = segments[modulesIndex - 1];
  }

  if (modulesIndex >= 0 && segments[modulesIndex + 1]) {
    result.moduleSlug = segments[modulesIndex + 1];
  }

  const learnIndex = segments.indexOf("learn");
  if (learnIndex >= 0) {
    const [sectionSlug, topicId, targetKind, targetSlug] =
      segments.slice(learnIndex + 1);
    if (sectionSlug) result.sectionSlug = sectionSlug;
    if (topicId) result.topicId = topicId;
    if (targetKind) result.targetKind = targetKind;
    if (targetSlug) result.targetSlug = targetSlug;
  }

  return result as T;
}

export function redirect(href: string): never {
  window.location.replace(href);
  throw new Error(`Redirecting to ${href}`);
}

export function notFound(): never {
  throw new Error("Not found");
}
