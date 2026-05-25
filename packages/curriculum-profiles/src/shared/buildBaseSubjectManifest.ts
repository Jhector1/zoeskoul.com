import type {
  CourseBlueprint,
  PlannedModule,
  SubjectManifest,
} from "@zoeskoul/curriculum-contracts";
import {
  buildModuleDescriptionKey,
  buildModulePrefix,
  buildModuleTitleKey,
  buildSectionDescriptionKey,
  buildSectionTitleKey,
  buildSubjectDescriptionKey,
  buildSubjectTitleKey,
} from "@zoeskoul/curriculum-core";

export function buildBaseSubjectManifest(
  blueprint: CourseBlueprint,
  modules: PlannedModule[],
  buildRuntimeDefaults: (module: PlannedModule) => any,
): SubjectManifest {
  return {
    subject: {
      slug: blueprint.subjectSlug,
      catalogSlug: blueprint.catalogSlug ?? blueprint.subjectSlug,
      genKey: blueprint.subjectSlug,
      order: 10,
      accessPolicy: blueprint.accessPolicy ?? "free",
      status: "active",
      titleKey: buildSubjectTitleKey(blueprint.subjectSlug),
      descriptionKey: buildSubjectDescriptionKey(blueprint.subjectSlug),
      meta: {
        curriculum: {
          plannedModuleCount: modules.length,
          isTerminalRelease: false,
          moreComingMessageKey: `subjects.${blueprint.subjectSlug}.moreComingSoon`,
        },
        completionPolicy: {
          requireAllPublishedModules: true,
          rewardEnabledByDefault: true,
          certificateEnabledByDefault: true,
        },
      },
    },
    modules: modules.map((m, moduleIndex) => ({
      slug: m.moduleSlug,
      prefix: m.prefix || buildModulePrefix(blueprint.subjectSlug, moduleIndex),
      order: m.order,
      titleKey: buildModuleTitleKey(blueprint.subjectSlug, m.moduleSlug),
      descriptionKey: buildModuleDescriptionKey(blueprint.subjectSlug, m.moduleSlug),
      weekStart: m.weekStart ?? null,
      weekEnd: m.weekEnd ?? null,
      accessOverride: m.accessOverride ?? blueprint.moduleAccessOverrideDefault ?? null,
      runtimeDefaults: buildRuntimeDefaults(m),
      meta: {
        estimatedMinutes: m.sections.flatMap((s) => s.topics).reduce((sum, t) => sum + (t.minutes ?? 0), 0),
        prereqKeys: moduleIndex > 0
          ? [buildModuleTitleKey(blueprint.subjectSlug, modules[moduleIndex - 1]!.moduleSlug)]
          : [],
        outcomeKeys: [],
        whyKeys: [],
      },
      sections: m.sections.map((s) => ({
        slug: s.sectionSlug,
        order: s.order,
        titleKey: buildSectionTitleKey(blueprint.subjectSlug, m.moduleSlug, s.sectionSlug),
        descriptionKey: buildSectionDescriptionKey(blueprint.subjectSlug, m.moduleSlug, s.sectionSlug),
        meta: {
          module: moduleIndex,
          weeksKey: `sections.${blueprint.subjectSlug}.${m.moduleSlug}.${s.sectionSlug}.weeks`,
          bulletKeys: [],
        },
        topics: s.topics.map((t) => t.topicId),
      })),
    })),
  };
}
