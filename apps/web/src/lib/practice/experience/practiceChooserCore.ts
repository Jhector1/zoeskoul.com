import { SUBJECT_ARTIFACTS } from "@/lib/subjects";
import { CATALOG_MANIFESTS } from "@zoeskoul/curriculum-registry/runtime";
import type { PracticeChooserPublishedExerciseOption } from "@/lib/practice/challenges/publishedCatalog";
import { isDailyFiveEligible } from "./dailyFive";
import { isSubscriberPracticeEligible } from "./subscriberPractice";
import { practiceModuleAccessKey } from "./practiceAccessKey";
import type {
  PracticeChooserCatalog,
  PracticeChooserModule,
} from "./practiceChooserTypes";

export type PracticeChooserModuleAccess = {
  availability: PracticeChooserModule["availability"];
  billingHref?: string | null;
};

export type PracticeChooserHierarchyTopic = {
  slug: string;
  title: string;
  titleKey: string | null;
  description: string | null;
};

export type PracticeChooserHierarchySection = {
  slug: string;
  title: string;
  titleKey: string | null;
  topics: readonly PracticeChooserHierarchyTopic[];
};

export type PracticeChooserHierarchyModule = {
  slug: string;
  title: string;
  titleKey: string | null;
  sections: readonly PracticeChooserHierarchySection[];
};

export type PracticeChooserHierarchyCourse = {
  slug: string;
  title: string;
  titleKey: string | null;
  catalogSlug: string;
  catalogTitle: string;
  modules: readonly PracticeChooserHierarchyModule[];
};

export type PracticeChooserHierarchyCatalog = {
  slug: string;
  title: string;
  titleKey: string | null;
  courses: readonly PracticeChooserHierarchyCourse[];
};

type SharedReviewTopicPresentation = {
  slug?: string;
  id?: string;
  title?: string;
  titleKey?: string | null;
  label?: string;
  labelKey?: string | null;
};

function uniqueCount(values: Iterable<string>) {
  return new Set(values).size;
}

function humanize(value: string) {
  return (
    value
      .replace(/^@:/, "")
      .split(".")
      .filter(Boolean)
      .at(-1)
      ?.replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase()) || value
  );
}

function presentationTitle(value: unknown, fallback: string) {
  const text = typeof value === "string" ? value.trim() : "";
  return text && !text.startsWith("@:") ? text : humanize(fallback);
}

function optionalKey(value: unknown) {
  const key = typeof value === "string" ? value.trim() : "";
  return key || null;
}

function taggedPresentationKey(value: unknown) {
  const tagged = typeof value === "string" ? value.trim() : "";
  return tagged.startsWith("@:") ? tagged.slice(2) || null : null;
}

/**
 * Practice does not own a second curriculum tree.
 *
 * Lesson/Review already uses SUBJECT_ARTIFACTS, which is built from the shared
 * COURSE_BUNDLES/defineCourseFromManifest pipeline. Practice projects that same
 * structure into chooser rows and joins authored Practice eligibility onto it.
 */
function buildPracticeChooserHierarchyFromSharedSubjectArtifacts():
  PracticeChooserHierarchyCatalog[] {
  const subjectBySlug = new Map(
    SUBJECT_ARTIFACTS.subjects.map((subject) => [subject.slug, subject] as const),
  );

  return Object.values(CATALOG_MANIFESTS)
    .map((entry) => entry.catalog)
    .filter((catalog) => (catalog.status ?? "active") === "active")
    .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))
    .map((catalog) => {
      const subjectSlugs = catalog.subjectSlugs as readonly string[];

      const courses = subjectSlugs.flatMap((subjectSlug) => {
        const subject = subjectBySlug.get(subjectSlug);
        if (!subject) return [];

        const modules = SUBJECT_ARTIFACTS.modules
          .filter((module) => module.subjectSlug === subjectSlug)
          .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))
          .map((module) => {
            const sections = SUBJECT_ARTIFACTS.sections
              .filter((section) => section.moduleSlug === module.slug)
              .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))
              .map((section) => {
                const topicSlugs = section.topicSlugs as readonly string[];
                const topics = topicSlugs.map((topicSlug) => {
                  const topic = SUBJECT_ARTIFACTS.reviewTopicsBySlug[
                    topicSlug
                  ] as SharedReviewTopicPresentation | undefined;

                  const presentation = topic?.title ?? topic?.label;

                  return {
                    slug: topicSlug,
                    title: presentationTitle(presentation, topicSlug),
                    titleKey:
                      optionalKey(topic?.titleKey ?? topic?.labelKey) ??
                      taggedPresentationKey(presentation),
                    description: null,
                  } satisfies PracticeChooserHierarchyTopic;
                });

                return {
                  slug: section.slug,
                  title: presentationTitle(section.title, section.slug),
                  titleKey: optionalKey(section.titleKey),
                  topics,
                } satisfies PracticeChooserHierarchySection;
              });

            return {
              slug: module.slug,
              title: presentationTitle(module.title, module.slug),
              titleKey: optionalKey(module.titleKey),
              sections,
            } satisfies PracticeChooserHierarchyModule;
          });

        return [
          {
            slug: subject.slug,
            title: presentationTitle(subject.title, subject.slug),
            titleKey: optionalKey(subject.titleKey),
            catalogSlug: catalog.slug,
            catalogTitle: catalog.title,
            modules,
          } satisfies PracticeChooserHierarchyCourse,
        ];
      });

      return {
        slug: catalog.slug,
        title: catalog.title,
        titleKey: null,
        courses,
      } satisfies PracticeChooserHierarchyCatalog;
    });
}

function optionIdentity(option: PracticeChooserPublishedExerciseOption) {
  return `${option.subjectSlug}|${option.moduleSlug}|${option.sectionSlug}|${option.topicSlug}|${option.exerciseKey}`;
}

function appendOption(
  groups: Map<string, PracticeChooserPublishedExerciseOption[]>,
  key: string,
  option: PracticeChooserPublishedExerciseOption,
) {
  const current = groups.get(key) ?? [];
  current.push(option);
  groups.set(key, current);
}

function countEligible(options: readonly PracticeChooserPublishedExerciseOption[]) {
  return uniqueCount(options.map((option) => option.exerciseKey));
}

function countDailyEligible(options: readonly PracticeChooserPublishedExerciseOption[]) {
  return uniqueCount(
    options
      .filter(isDailyFiveEligible)
      .map((option) => option.exerciseKey),
  );
}

export function buildPracticeChooserCatalogs(args: {
  options: readonly PracticeChooserPublishedExerciseOption[];
  visibleSubjectSlugs: ReadonlySet<string>;
  moduleAccessByKey: ReadonlyMap<string, PracticeChooserModuleAccess>;
  hierarchy?: readonly PracticeChooserHierarchyCatalog[];
}): PracticeChooserCatalog[] {
  const uniqueOptions = new Map<string, PracticeChooserPublishedExerciseOption>();

  for (const option of args.options) {
    if (!args.visibleSubjectSlugs.has(option.subjectSlug)) continue;
    if (!isSubscriberPracticeEligible(option)) continue;
    const identity = optionIdentity(option);
    if (!uniqueOptions.has(identity)) uniqueOptions.set(identity, option);
  }

  const byCatalog = new Map<string, PracticeChooserPublishedExerciseOption[]>();
  const byCourse = new Map<string, PracticeChooserPublishedExerciseOption[]>();
  const byModule = new Map<string, PracticeChooserPublishedExerciseOption[]>();
  const bySection = new Map<string, PracticeChooserPublishedExerciseOption[]>();
  const byTopic = new Map<string, PracticeChooserPublishedExerciseOption[]>();

  for (const option of uniqueOptions.values()) {
    appendOption(byCatalog, option.catalogSlug, option);
    appendOption(byCourse, option.subjectSlug, option);
    appendOption(
      byModule,
      practiceModuleAccessKey(option.subjectSlug, option.moduleSlug),
      option,
    );
    appendOption(
      bySection,
      `${option.subjectSlug}|${option.moduleSlug}|${option.sectionSlug}`,
      option,
    );
    appendOption(
      byTopic,
      `${option.subjectSlug}|${option.moduleSlug}|${option.sectionSlug}|${option.topicSlug}`,
      option,
    );
  }

  const hierarchy =
    args.hierarchy ?? buildPracticeChooserHierarchyFromSharedSubjectArtifacts();

  return hierarchy.flatMap((catalog) => {
    const courses = catalog.courses.flatMap((course) => {
      if (!args.visibleSubjectSlugs.has(course.slug)) return [];

      const courseOptions = byCourse.get(course.slug) ?? [];
      const modules = course.modules.flatMap((module) => {
        const moduleKey = practiceModuleAccessKey(course.slug, module.slug);
        const moduleOptions = byModule.get(moduleKey) ?? [];
        const access = args.moduleAccessByKey.get(moduleKey) ?? {
          availability: "unavailable" as const,
          billingHref: null,
        };

        const sections = module.sections.flatMap((section) => {
          const sectionOptions =
            bySection.get(
              `${course.slug}|${module.slug}|${section.slug}`,
            ) ?? [];

          const topics = section.topics.flatMap((topic) => {
            const topicOptions =
              byTopic.get(
                `${course.slug}|${module.slug}|${section.slug}|${topic.slug}`,
              ) ?? [];
            const exerciseCount = countEligible(topicOptions);

            if (exerciseCount <= 0) return [];

            return [
              {
                slug: topic.slug,
                title: topic.title,
                titleKey: topic.titleKey,
                description: topic.description,
                exerciseCount,
                dailyExerciseCount: countDailyEligible(topicOptions),
              },
            ];
          });
          const exerciseCount = countEligible(sectionOptions);

          if (exerciseCount <= 0 || topics.length <= 0) return [];

          return [
            {
              slug: section.slug,
              title: section.title,
              titleKey: section.titleKey,
              exerciseCount,
              dailyExerciseCount: countDailyEligible(sectionOptions),
              topics,
            },
          ];
        });
        const exerciseCount = countEligible(moduleOptions);

        if (exerciseCount <= 0 || sections.length <= 0) return [];

        return [
          {
            slug: module.slug,
            title: module.title,
            titleKey: module.titleKey,
            availability: access.availability,
            billingHref: access.billingHref ?? null,
            exerciseCount,
            dailyExerciseCount: countDailyEligible(moduleOptions),
            sections,
          } satisfies PracticeChooserModule,
        ];
      });
      const exerciseCount = countEligible(courseOptions);

      if (exerciseCount <= 0 || modules.length <= 0) return [];

      return [
        {
          slug: course.slug,
          title: course.title,
          titleKey: course.titleKey,
          catalogSlug: catalog.slug,
          catalogTitle: catalog.title,
          exerciseCount,
          dailyExerciseCount: countDailyEligible(courseOptions),
          modules,
        },
      ];
    });

    if (courses.length <= 0) return [];

    const catalogOptions = byCatalog.get(catalog.slug) ?? [];

    return [
      {
        slug: catalog.slug,
        title: catalog.title,
        titleKey: catalog.titleKey,
        exerciseCount: countEligible(catalogOptions),
        dailyExerciseCount: countDailyEligible(catalogOptions),
        courses,
      },
    ];
  });
}
