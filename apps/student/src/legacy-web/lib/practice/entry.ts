import { ROUTES } from "@/utils";

export const PRACTICE_ENTRY_QUERY_KEY = "practice";
export const PRACTICE_ENTRY_QUERY_VALUE = "start";

export function buildPracticeEntryHref(isAuthenticated: boolean) {
  if (isAuthenticated) return ROUTES.dailyPractice;

  const query = new URLSearchParams({
    [PRACTICE_ENTRY_QUERY_KEY]: PRACTICE_ENTRY_QUERY_VALUE,
  });

  return `${ROUTES.home}?${query.toString()}`;
}

export function hasPracticeEntryIntent(
  search: string | Pick<URLSearchParams, "get">,
): boolean {
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search;

  return params.get(PRACTICE_ENTRY_QUERY_KEY) === PRACTICE_ENTRY_QUERY_VALUE;
}

export function removePracticeEntryIntent(href: string) {
  const url = new URL(href, "https://zoeskoul.local");
  url.searchParams.delete(PRACTICE_ENTRY_QUERY_KEY);

  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
}
