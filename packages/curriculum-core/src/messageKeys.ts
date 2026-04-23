export function buildSubjectTitleKey(subjectSlug: string) {
  return `subjects.${subjectSlug}.title`;
}
export function buildSubjectDescriptionKey(subjectSlug: string) {
  return `subjects.${subjectSlug}.description`;
}
export function buildModuleTitleKey(subjectSlug: string, moduleSlug: string) {
  return `modules.${subjectSlug}.${moduleSlug}.title`;
}
export function buildModuleDescriptionKey(subjectSlug: string, moduleSlug: string) {
  return `modules.${subjectSlug}.${moduleSlug}.description`;
}
export function buildSectionTitleKey(subjectSlug: string, moduleSlug: string, sectionSlug: string) {
  return `sections.${subjectSlug}.${moduleSlug}.${sectionSlug}.title`;
}
export function buildSectionDescriptionKey(subjectSlug: string, moduleSlug: string, sectionSlug: string) {
  return `sections.${subjectSlug}.${moduleSlug}.${sectionSlug}.description`;
}
export function buildTopicBaseKey(subjectSlug: string, moduleSlug: string, topicId: string) {
  return `topics.${subjectSlug}.${moduleSlug}.${topicId}`;
}
