import type { SlimTopicManifest } from "@/lib/subjects/_core/subjectManifestTypes";
import { TOPIC_MANIFESTS as APPLIED_PYTHON_PROJECTS_TOPIC_MANIFESTS } from "@/lib/subjects/applied-python-projects/topics.generated";
import { TOPIC_MANIFESTS as PYTHON_TOPIC_MANIFESTS } from "@/lib/subjects/python/topics.generated";
import { TOPIC_MANIFESTS as PYTHON_V2_TOPIC_MANIFESTS } from "@/lib/subjects/python-v2/topics.generated";
import { TOPIC_MANIFESTS as PYTHON_DATA_FUNCTIONS_TOPIC_MANIFESTS } from "@/lib/subjects/python-data-functions/topics.generated";
import { TOPIC_MANIFESTS as SQL_TOPIC_MANIFESTS } from "@/lib/subjects/sql/topics.generated";
import { TOPIC_MANIFESTS as SQL_V2_TOPIC_MANIFESTS } from "@/lib/subjects/sql-v2/topics.generated";
import { TOPIC_MANIFESTS as LINUX_TERMINAL_FUNDAMENTALS_TOPIC_MANIFESTS } from "@/lib/subjects/linux-terminal-fundamentals/topics.generated";

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

  switch (args.subjectSlug) {
    case "applied-python-projects":
      return APPLIED_PYTHON_PROJECTS_TOPIC_MANIFESTS[topicId] ?? null;

    case "python":
      return PYTHON_TOPIC_MANIFESTS[topicId] ?? null;

    case "python-v2":
      return PYTHON_V2_TOPIC_MANIFESTS[topicId] ?? null;

    case "python-data-functions":
    case "python--python-data-functions--draft":
      return PYTHON_DATA_FUNCTIONS_TOPIC_MANIFESTS[topicId] ?? null;

    case "sql":
      return SQL_TOPIC_MANIFESTS[topicId] ?? null;

    case "sql-v2":
      return SQL_V2_TOPIC_MANIFESTS[topicId] ?? null;

      // Linux umbrella subject + course subject alias.
      // The course/runtime subject is linux-terminal-fundamentals, but authoring may group it under linux.
    case "linux":
    case "linux-terminal-fundamentals":
      return LINUX_TERMINAL_FUNDAMENTALS_TOPIC_MANIFESTS[topicId] ?? null;

    default:
      return null;
  }
}