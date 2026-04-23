export function buildModuleSlug(subjectSlug: string, index: number) {
    return `${subjectSlug}_module_${index}`;
}

export function buildModulePrefix(subjectSlug: string, index: number) {
    const short = subjectSlug.slice(0, 2) || subjectSlug;
    return `${short}${index}`;
}

export function buildSectionSlug(moduleIndex: number, sectionIndex: number) {
    return `section_${moduleIndex}_${sectionIndex}`;
}