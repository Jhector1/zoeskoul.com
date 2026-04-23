import type { SubjectManifest } from "@zoeskoul/curriculum-contracts";

function parseTopicSlug(topicSlug: string) {
  const parts = topicSlug.split(".");
  if (parts.length > 1) {
    return {
      prefix: parts[0],
      base: parts.slice(1).join("."),
    };
  }

  return {
    prefix: null,
    base: topicSlug,
  };
}

export function resolveModuleFromTopicSlug(args: {
  manifest: SubjectManifest;
  topicSlug: string | null | undefined;
}): string | null {
  const { manifest, topicSlug } = args;
  const { base, prefix } = parseTopicSlug(String(topicSlug ?? ""));

  if (prefix) {
    const byPrefix = manifest.modules.find((m) => m.prefix === prefix);
    if (byPrefix) return byPrefix.slug;
  }

  for (const module of manifest.modules) {
    for (const section of module.sections) {
      if (section.topics.includes(base)) {
        return module.slug;
      }
    }
  }

  return null;
}
