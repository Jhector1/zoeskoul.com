import type { PublishedPracticeExerciseOption } from "@/lib/practice/challenges/publishedCatalog";
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

type TitledOptionGroup = {
  title: string;
  titleKey: string | null;
  options: PublishedPracticeExerciseOption[];
};

function uniqueCount(values: Iterable<string>) {
  return new Set(values).size;
}

function optionIdentity(option: PublishedPracticeExerciseOption) {
  return `${option.subjectSlug}|${option.moduleSlug}|${option.sectionSlug}|${option.topicSlug}|${option.exerciseKey}`;
}

function appendTitledOption(args: {
  groups: Map<string, TitledOptionGroup>;
  slug: string;
  title: string;
  titleKey: string | null | undefined;
  option: PublishedPracticeExerciseOption;
}) {
  const current = args.groups.get(args.slug) ?? {
    title: args.title,
    titleKey: args.titleKey ?? null,
    options: [],
  };

  // A generated option should always carry the same authored key for its node.
  // Still prefer a later non-empty key so older cached options remain compatible.
  if (!current.titleKey && args.titleKey) current.titleKey = args.titleKey;

  current.options.push(args.option);
  args.groups.set(args.slug, current);
}

export function buildPracticeChooserCatalogs(args: {
  options: readonly PublishedPracticeExerciseOption[];
  visibleSubjectSlugs: ReadonlySet<string>;
  moduleAccessByKey: ReadonlyMap<string, PracticeChooserModuleAccess>;
}): PracticeChooserCatalog[] {
  const uniqueOptions = new Map<string, PublishedPracticeExerciseOption>();

  for (const option of args.options) {
    if (!args.visibleSubjectSlugs.has(option.subjectSlug)) continue;
    if (!isSubscriberPracticeEligible(option)) continue;
    const identity = optionIdentity(option);
    if (!uniqueOptions.has(identity)) uniqueOptions.set(identity, option);
  }

  const byCatalog = new Map<string, TitledOptionGroup>();

  for (const option of uniqueOptions.values()) {
    appendTitledOption({
      groups: byCatalog,
      slug: option.catalogSlug,
      title: option.catalogTitle,
      titleKey: null,
      option,
    });
  }

  return [...byCatalog.entries()].map(([catalogSlug, catalog]) => {
    const byCourse = new Map<string, TitledOptionGroup>();

    for (const option of catalog.options) {
      appendTitledOption({
        groups: byCourse,
        slug: option.subjectSlug,
        title: option.subjectTitle,
        titleKey: option.subjectTitleKey,
        option,
      });
    }

    const courses = [...byCourse.entries()].map(([subjectSlug, course]) => {
      const byModule = new Map<string, TitledOptionGroup>();

      for (const option of course.options) {
        appendTitledOption({
          groups: byModule,
          slug: option.moduleSlug,
          title: option.moduleTitle,
          titleKey: option.moduleTitleKey,
          option,
        });
      }

      const modules = [...byModule.entries()].map(([moduleSlug, module]) => {
        const access =
          args.moduleAccessByKey.get(
            practiceModuleAccessKey(subjectSlug, moduleSlug),
          ) ?? {
            availability: "unavailable" as const,
            billingHref: null,
          };
        const bySection = new Map<string, TitledOptionGroup>();

        for (const option of module.options) {
          appendTitledOption({
            groups: bySection,
            slug: option.sectionSlug,
            title: option.sectionTitle,
            titleKey: option.sectionTitleKey,
            option,
          });
        }

        const sections = [...bySection.entries()].map(
          ([sectionSlug, section]) => {
            const byTopic = new Map<string, TitledOptionGroup>();

            for (const option of section.options) {
              appendTitledOption({
                groups: byTopic,
                slug: option.topicSlug,
                title: option.topicTitle,
                titleKey: option.topicTitleKey,
                option,
              });
            }

            const topics = [...byTopic.entries()].map(([topicSlug, topic]) => ({
              slug: topicSlug,
              title: topic.title,
              titleKey: topic.titleKey,
              description: null,
              exerciseCount: uniqueCount(
                topic.options.map((option) => option.exerciseKey),
              ),
              dailyExerciseCount: uniqueCount(
                topic.options
                  .filter(isDailyFiveEligible)
                  .map((option) => option.exerciseKey),
              ),
            }));

            return {
              slug: sectionSlug,
              title: section.title,
              titleKey: section.titleKey,
              exerciseCount: uniqueCount(
                section.options.map((option) => option.exerciseKey),
              ),
              dailyExerciseCount: uniqueCount(
                section.options
                  .filter(isDailyFiveEligible)
                  .map((option) => option.exerciseKey),
              ),
              topics,
            };
          },
        );

        return {
          slug: moduleSlug,
          title: module.title,
          titleKey: module.titleKey,
          availability: access.availability,
          billingHref: access.billingHref ?? null,
          exerciseCount: uniqueCount(
            module.options.map((option) => option.exerciseKey),
          ),
          dailyExerciseCount: uniqueCount(
            module.options
              .filter(isDailyFiveEligible)
              .map((option) => option.exerciseKey),
          ),
          sections,
        } satisfies PracticeChooserModule;
      });

      return {
        slug: subjectSlug,
        title: course.title,
        titleKey: course.titleKey,
        catalogSlug,
        catalogTitle: catalog.title,
        exerciseCount: uniqueCount(
          course.options.map((option) => option.exerciseKey),
        ),
        dailyExerciseCount: uniqueCount(
          course.options
            .filter(isDailyFiveEligible)
            .map((option) => option.exerciseKey),
        ),
        modules,
      };
    });

    return {
      slug: catalogSlug,
      title: catalog.title,
      titleKey: catalog.titleKey,
      exerciseCount: uniqueCount(
        catalog.options.map((option) => option.exerciseKey),
      ),
      dailyExerciseCount: uniqueCount(
        catalog.options
          .filter(isDailyFiveEligible)
          .map((option) => option.exerciseKey),
      ),
      courses,
    };
  });
}
