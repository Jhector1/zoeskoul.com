import type { SlimTopicManifest } from "@/lib/subjects/_core/subjectManifestTypes";
import { SUBJECT_GENERATOR_SOURCES } from "@/lib/subjects/subjects.generated";

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
