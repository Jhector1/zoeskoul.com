export function buildModuleSlug(subjectSlug: string, index: number) {
  return `${subjectSlug}_module_${index}`;
}

function buildSubjectPrefixBase(subjectSlug: string) {
  const normalized = subjectSlug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const versionMatch = normalized.match(/^(.*)-v(\d+)$/);

  if (versionMatch) {
    const [, family, version] = versionMatch;

    const familyPrefix = family
        .split("-")
        .filter(Boolean)
        .map((part) => part[0])
        .join("");

    return `${familyPrefix}v${version}`;
  }

  return normalized
      .split("-")
      .filter(Boolean)
      .map((part) => part[0])
      .join("");
}

export function buildModulePrefix(subjectSlug: string, index: number) {
  return `${buildSubjectPrefixBase(subjectSlug)}_${index}`;
}

export function buildSectionSlug(moduleIndex: number, sectionIndex: number) {
  return `section_${moduleIndex}_${sectionIndex}`;
}
