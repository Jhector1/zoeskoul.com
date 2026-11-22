import type { ReviewModule } from "@zoeskoul/curriculum-contracts/subjects/types";
import {
  buildReviewCardRouteTarget,
  resolveReviewRouteTarget,
  type ReviewResolvedRouteTarget,
} from "@zoeskoul/learning-runtime/review/module/runtime/reviewRoute";

// Fail closed: the browser route and the chosen canonical topic directory must
// agree before a Draft QA preview may render or load practice exercises.
type Route = {
  sectionSlug: string;
  topicSlug: string;
  targetKind: string;
  targetSlug: string;
};

type Resolution =
  | { status: "ready" }
  | { status: "invalid" }
  | { status: "redirect"; target: ReviewResolvedRouteTarget };

/** Canonical selection for the local-only Draft QA progress fallback. */
export function selectedDraftQaFirstTopicId(mod: ReviewModule | null | undefined, topicDir: string): string | null {
  if (!topicDir) return null;
  const found = (mod?.topics ?? []).filter(
    (topic) => (topic as typeof topic & { draftTopicDir?: string }).draftTopicDir === topicDir,
  );
  return found.length === 1 ? found[0].id : null;
}

function sameRoute(a: Route, b: Route): boolean {
  return a.sectionSlug === b.sectionSlug &&
    a.topicSlug === b.topicSlug &&
    a.targetKind === b.targetKind &&
    a.targetSlug === b.targetSlug;
}

export function canonicalDraftQaPreviewRoute(args: {
  mod: ReviewModule;
  topicDir: string;
  subjectSlug: string;
  moduleSlug: string;
  requested: Route;
}): Resolution {
  if (!args.topicDir || !args.subjectSlug || !args.moduleSlug) {
    return { status: "invalid" };
  }

  // Only a single canonical draft directory can own the selection.
  const candidates = (args.mod.topics ?? []).filter(
    (topic) => (topic as typeof topic & { draftTopicDir?: string }).draftTopicDir === args.topicDir,
  );
  if (candidates.length !== 1) return { status: "invalid" };
  const selected = candidates[0];

  const current = resolveReviewRouteTarget({
    mod: args.mod,
    subjectSlug: args.subjectSlug,
    moduleSlug: args.moduleSlug,
    route: args.requested,
  });

  if (current?.topicId === selected.id) {
    return sameRoute(current, args.requested)
      ? { status: "ready" }
      : { status: "redirect", target: current };
  }

  const firstCard = selected.cards?.[0];
  if (!firstCard) return { status: "invalid" };

  const destination = buildReviewCardRouteTarget({
    mod: args.mod,
    topicId: selected.id,
    card: firstCard,
  });
  if (!destination || destination.topicId !== selected.id) {
    return { status: "invalid" };
  }

  // Do not redirect to a fallback that the canonical learner route resolver
  // itself cannot resolve. Otherwise a malformed draft would redirect forever.
  const canonical = resolveReviewRouteTarget({
    mod: args.mod,
    subjectSlug: args.subjectSlug,
    moduleSlug: args.moduleSlug,
    route: {
      sectionSlug: destination.sectionSlug,
      topicSlug: destination.topicSlug,
      targetKind: destination.targetKind,
      targetSlug: destination.targetSlug,
    },
  });
  if (!canonical || canonical.topicId !== selected.id ||
      !sameRoute(canonical, destination)) return { status: "invalid" };

  return { status: "redirect", target: canonical };
}
