import type { SlimTopicManifest } from "@zoeskoul/curriculum-contracts";
import { SUBJECT_GENERATOR_SOURCES } from "@zoeskoul/curriculum-registry/runtime";
import { setReviewTopicManifestResolver } from "@zoeskoul/learning-runtime/review/module/runtime/reviewRoute";

function normalizeTopicId(topicSlugOrId: string) {
  if (!topicSlugOrId.includes(".")) return topicSlugOrId;
  return topicSlugOrId.split(".").slice(1).join(".");
}

export function resolveTopicBundleManifest(args: {
  subjectSlug: string;
  topicSlugOrId: string;
}): SlimTopicManifest | null {
  const topicId = normalizeTopicId(String(args.topicSlugOrId ?? "").trim());
  if (!topicId) return null;

  const canonicalSubjectSlug =
    args.subjectSlug === "python--python-data-functions--draft"
      ? "python-data-functions"
      : args.subjectSlug === "linux"
        ? "linux-terminal-fundamentals"
        : args.subjectSlug;

  return SUBJECT_GENERATOR_SOURCES[canonicalSubjectSlug]?.topicManifests[topicId] ?? null;
}

setReviewTopicManifestResolver(resolveTopicBundleManifest);
