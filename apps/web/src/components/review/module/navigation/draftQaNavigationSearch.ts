export const DRAFT_QA_REVIEW_ROUTE_CHANGED = "zoeskoul:draft-qa-review-route-changed";

export function buildDraftQaNavigationSearch(args: {
  enabled: boolean;
  baseSearch: string;
  destinationTopicDir?: string | null;
  fallbackTopicSlug?: string | null;
}) {
  if (!args.enabled) return "";

  const query = new URLSearchParams(args.baseSearch);
  const destinationTopicDir =
    args.destinationTopicDir?.trim() ||
    args.fallbackTopicSlug?.trim() ||
    "";

  if (destinationTopicDir) {
    query.set("topicDir", destinationTopicDir);
  }

  return query.toString();
}
