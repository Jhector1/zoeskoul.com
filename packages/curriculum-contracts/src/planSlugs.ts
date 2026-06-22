import type { CoursePlan } from "./plan.js";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeCoursePlanStructureSlugs(
  subjectSlug: string,
  plan: CoursePlan,
): CoursePlan {
  const normalizedSubjectSlug = String(subjectSlug ?? "").trim().toLowerCase();

  if (!normalizedSubjectSlug) {
    return plan;
  }

  const shorthandPattern = new RegExp(
    `^${escapeRegExp(normalizedSubjectSlug)}-(\\d+)(-.+)$`,
  );

  const normalizeSlug = (value: string) =>
    value.replace(shorthandPattern, `${normalizedSubjectSlug}-module-$1$2`);

  return {
    ...plan,
    modules: Array.isArray(plan.modules)
      ? plan.modules.map((module) => ({
          ...module,
          moduleSlug:
            typeof module.moduleSlug === "string"
              ? normalizeSlug(module.moduleSlug)
              : module.moduleSlug,
          sections: Array.isArray(module.sections)
            ? module.sections.map((section) => ({
                ...section,
                sectionSlug:
                  typeof section.sectionSlug === "string"
                    ? normalizeSlug(section.sectionSlug)
                    : section.sectionSlug,
              }))
            : module.sections,
        }))
      : plan.modules,
  };
}
