
import { buildReviewRegistry } from "./buildReviewRegistry";

export const REVIEW_REGISTRY = buildReviewRegistry();

export function getReviewModule(subjectSlug: string, moduleSlug: string) {
  return REVIEW_REGISTRY[subjectSlug]?.[moduleSlug] ?? null;
}

export function hasReviewModule(subjectSlug: string, moduleSlug: string) {
  return Boolean(REVIEW_REGISTRY[subjectSlug]?.[moduleSlug]);
}


