import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { PracticeChooserPublishedExerciseOption } from "@/lib/practice/challenges/publishedCatalog";
import {
  buildPracticeChooserCatalogs,
  type PracticeChooserHierarchyCatalog,
} from "./practiceChooserCore";
import { practiceModuleAccessKey } from "./practiceAccessKey";

function option(
  exerciseKey: string,
  overrides: Partial<PracticeChooserPublishedExerciseOption> = {},
): PracticeChooserPublishedExerciseOption {
  return {
    id: exerciseKey,
    catalogSlug: "python",
    catalogTitle: "Python",
    subjectSlug: "python-v2",
    subjectTitle: "Python for Beginners",
    subjectTitleKey: "subjects.python-v2.title",
    releaseStatus: "active",
    moduleSlug: "module-1",
    moduleTitle: "Foundations",
    moduleTitleKey: "modules.python-v2.module-1.title",
    sectionSlug: "section-1",
    sectionTitle: "Start here",
    sectionTitleKey: "sections.python-v2.module-1.section-1.title",
    sectionRole: "lesson",
    topicSlug: "topic-1",
    topicTitle: "First steps",
    topicTitleKey: "topics.python-v2.module-1.topic-1.label",
    exerciseKey,
    exerciseTitle: exerciseKey,
    exerciseKind: "code_input",
    exercisePurpose: "practice",
    isMultiFile: false,
    requiresTerminal: false,
    isStandaloneTryIt: false,
    ...overrides,
  };
}

const TEST_HIERARCHY: readonly PracticeChooserHierarchyCatalog[] = [
  {
    slug: "python",
    title: "Python",
    titleKey: null,
    courses: [
      {
        slug: "python-v2",
        title: "Python for Beginners",
        titleKey: "subjects.python-v2.title",
        catalogSlug: "python",
        catalogTitle: "Python",
        modules: [
          {
            slug: "module-1",
            title: "Foundations",
            titleKey: "modules.python-v2.module-1.title",
            sections: [
              {
                slug: "section-1",
                title: "Start here",
                titleKey: "sections.python-v2.module-1.section-1.title",
                topics: [
                  {
                    slug: "topic-1",
                    title: "First steps",
                    titleKey: "topics.python-v2.module-1.topic-1.label",
                    description: null,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

function buildChooser(
  args: Omit<
    Parameters<typeof buildPracticeChooserCatalogs>[0],
    "hierarchy"
  > & {
    hierarchy?: readonly PracticeChooserHierarchyCatalog[];
  },
) {
  return buildPracticeChooserCatalogs({
    ...args,
    hierarchy: args.hierarchy ?? TEST_HIERARCHY,
  });
}

describe("practice chooser hierarchy", () => {
  it("builds catalog, course, module, section, and topic levels from canonical structure", () => {
    const catalogs = buildChooser({
      options: [option("one"), option("two")],
      visibleSubjectSlugs: new Set(["python-v2"]),
      moduleAccessByKey: new Map([
        [
          practiceModuleAccessKey("python-v2", "module-1"),
          { availability: "available" as const },
        ],
      ]),
    });

    expect(catalogs).toHaveLength(1);
    expect(catalogs[0]).toMatchObject({
      title: "Python",
      titleKey: null,
      exerciseCount: 2,
      courses: [
        {
          title: "Python for Beginners",
          titleKey: "subjects.python-v2.title",
          exerciseCount: 2,
          modules: [
            {
              title: "Foundations",
              titleKey: "modules.python-v2.module-1.title",
              exerciseCount: 2,
              sections: [
                {
                  title: "Start here",
                  titleKey: "sections.python-v2.module-1.section-1.title",
                  exerciseCount: 2,
                  topics: [
                    {
                      slug: "topic-1",
                      title: "First steps",
                      titleKey: "topics.python-v2.module-1.topic-1.label",
                      exerciseCount: 2,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("counts only exercises explicitly authored for Practice", () => {
    const catalogs = buildChooser({
      options: [
        option("practice"),
        option("project", { exercisePurpose: "project" }),
        option("try-it", { exercisePurpose: "try_it" }),
        option("quiz", {
          exercisePurpose: "quiz",
          exerciseKind: "single_choice",
        }),
      ],
      visibleSubjectSlugs: new Set(["python-v2"]),
      moduleAccessByKey: new Map(),
    });

    expect(catalogs[0]?.exerciseCount).toBe(1);
    expect(
      catalogs[0]?.courses[0]?.modules[0]?.sections[0]?.topics[0]
        ?.exerciseCount,
    ).toBe(1);
  });

  it("preserves locked modules and their billing destination", () => {
    const catalogs = buildChooser({
      options: [option("paid")],
      visibleSubjectSlugs: new Set(["python-v2"]),
      moduleAccessByKey: new Map([
        [
          practiceModuleAccessKey("python-v2", "module-1"),
          {
            availability: "locked" as const,
            billingHref: "/billing?next=%2Fen%2Fpractice%2Fdaily",
          },
        ],
      ]),
    });

    expect(catalogs[0]?.courses[0]?.modules[0]).toMatchObject({
      availability: "locked",
      billingHref: "/billing?next=%2Fen%2Fpractice%2Fdaily",
    });
  });

  it("keeps access scoped when two courses reuse a module slug", () => {
    const hierarchy: readonly PracticeChooserHierarchyCatalog[] = [
      TEST_HIERARCHY[0],
      {
        slug: "sql",
        title: "SQL",
        titleKey: null,
        courses: [
          {
            slug: "sql-v2",
            title: "SQL Foundations",
            titleKey: "subjects.sql-v2.title",
            catalogSlug: "sql",
            catalogTitle: "SQL",
            modules: [
              {
                slug: "module-1",
                title: "Foundations",
                titleKey: null,
                sections: [
                  {
                    slug: "section-1",
                    title: "Start here",
                    titleKey: null,
                    topics: [
                      {
                        slug: "topic-1",
                        title: "First steps",
                        titleKey: null,
                        description: null,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    const catalogs = buildChooser({
      hierarchy,
      options: [
        option("free"),
        option("paid", {
          catalogSlug: "sql",
          catalogTitle: "SQL",
          subjectSlug: "sql-v2",
          subjectTitle: "SQL Foundations",
        }),
      ],
      visibleSubjectSlugs: new Set(["python-v2", "sql-v2"]),
      moduleAccessByKey: new Map([
        [
          practiceModuleAccessKey("python-v2", "module-1"),
          { availability: "available" as const },
        ],
        [
          practiceModuleAccessKey("sql-v2", "module-1"),
          { availability: "locked" as const, billingHref: "/billing" },
        ],
      ]),
    });

    const python = catalogs
      .find((catalog) => catalog.slug === "python")
      ?.courses[0]?.modules[0];
    const sql = catalogs
      .find((catalog) => catalog.slug === "sql")
      ?.courses[0]?.modules[0];

    expect(python?.availability).toBe("available");
    expect(sql?.availability).toBe("locked");
  });

  it("carries authored topic label keys instead of falling back to the literal word Label", () => {
    const moduleSlug =
      "sql-analysis-reporting-module-1-null-safe-calculations";
    const sectionSlug =
      "sql-analysis-reporting-sql-analysis-reporting-section-1-business-calculations";
    const catalogs = buildPracticeChooserCatalogs({
      options: [
        option("percentage-practice", {
          catalogSlug: "sql",
          catalogTitle: "SQL",
          subjectSlug: "sql-analysis-reporting",
          subjectTitle: "SQL Analysis & Reporting",
          moduleSlug,
          sectionSlug,
          topicSlug:
            "sql_analysis_reporting_module_1.percentage-and-discount-calculations",
        }),
        option("labels-practice", {
          catalogSlug: "sql",
          catalogTitle: "SQL",
          subjectSlug: "sql-analysis-reporting",
          subjectTitle: "SQL Analysis & Reporting",
          moduleSlug,
          sectionSlug,
          topicSlug:
            "sql_analysis_reporting_module_1.case-for-readable-labels",
        }),
      ],
      visibleSubjectSlugs: new Set(["sql-analysis-reporting"]),
      moduleAccessByKey: new Map(),
    });

    const module = catalogs
      .find((catalog) => catalog.slug === "sql")
      ?.courses.find((course) => course.slug === "sql-analysis-reporting")
      ?.modules.find(
        (item) =>
          item.slug ===
          "sql-analysis-reporting-module-1-null-safe-calculations",
      );
    const section = module?.sections.find(
      (item) =>
        item.slug ===
        "sql-analysis-reporting-sql-analysis-reporting-section-1-business-calculations",
    );

    const percentage = section?.topics.find(
      (topic) =>
        topic.slug ===
        "sql_analysis_reporting_module_1.percentage-and-discount-calculations",
    );
    const readableLabels = section?.topics.find(
      (topic) =>
        topic.slug ===
        "sql_analysis_reporting_module_1.case-for-readable-labels",
    );

    expect(percentage).toMatchObject({
      title: "Percentage And Discount Calculations",
      titleKey:
        "topics.sql-analysis-reporting.sql-analysis-reporting-module-1-null-safe-calculations.percentage-and-discount-calculations.label",
    });
    expect(readableLabels).toMatchObject({
      title: "Case For Readable Labels",
      titleKey:
        "topics.sql-analysis-reporting.sql-analysis-reporting-module-1-null-safe-calculations.case-for-readable-labels.label",
    });
    expect(percentage?.title).not.toBe("Label");
    expect(readableLabels?.title).not.toBe("Label");
  });

  it("hides actor-visible courses when they have no authored Practice exercises", () => {
    const catalogs = buildPracticeChooserCatalogs({
      options: [],
      visibleSubjectSlugs: new Set([
        "sql-v2",
        "sql-analysis-reporting",
        "multi-table-sql",
        "sql-data-management",
      ]),
      moduleAccessByKey: new Map(),
    });

    expect(catalogs).toEqual([]);
  });

  it("prunes zero-Practice topics, sections, modules, courses, and empty catalogs bottom-up", () => {
    const catalogs = buildPracticeChooserCatalogs({
      options: [
        option("keep-practice", {
          catalogSlug: "catalog-a",
          catalogTitle: "Catalog A",
          subjectSlug: "course-a",
          subjectTitle: "Course A",
          moduleSlug: "module-a",
          moduleTitle: "Module A",
          sectionSlug: "section-a",
          sectionTitle: "Section A",
          topicSlug: "topic-keep",
          topicTitle: "Keep Topic",
        }),
      ],
      visibleSubjectSlugs: new Set(["course-a", "course-empty"]),
      moduleAccessByKey: new Map(),
      hierarchy: [
        {
          slug: "catalog-a",
          title: "Catalog A",
          titleKey: null,
          courses: [
            {
              slug: "course-a",
              title: "Course A",
              titleKey: null,
              catalogSlug: "catalog-a",
              catalogTitle: "Catalog A",
              modules: [
                {
                  slug: "module-a",
                  title: "Module A",
                  titleKey: null,
                  sections: [
                    {
                      slug: "section-a",
                      title: "Section A",
                      titleKey: null,
                      topics: [
                        {
                          slug: "topic-keep",
                          title: "Keep Topic",
                          titleKey: null,
                          description: null,
                        },
                        {
                          slug: "topic-zero",
                          title: "Zero Topic",
                          titleKey: null,
                          description: null,
                        },
                      ],
                    },
                    {
                      slug: "section-zero",
                      title: "Zero Section",
                      titleKey: null,
                      topics: [
                        {
                          slug: "topic-zero-only",
                          title: "Zero Only",
                          titleKey: null,
                          description: null,
                        },
                      ],
                    },
                  ],
                },
                {
                  slug: "module-zero",
                  title: "Zero Module",
                  titleKey: null,
                  sections: [
                    {
                      slug: "module-zero-section",
                      title: "Zero Section",
                      titleKey: null,
                      topics: [
                        {
                          slug: "module-zero-topic",
                          title: "Zero Topic",
                          titleKey: null,
                          description: null,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              slug: "course-empty",
              title: "Empty Course",
              titleKey: null,
              catalogSlug: "catalog-a",
              catalogTitle: "Catalog A",
              modules: [
                {
                  slug: "empty-module",
                  title: "Empty Module",
                  titleKey: null,
                  sections: [],
                },
              ],
            },
          ],
        },
        {
          slug: "catalog-empty",
          title: "Empty Catalog",
          titleKey: null,
          courses: [],
        },
      ],
    });

    expect(catalogs.map((catalog) => catalog.slug)).toEqual(["catalog-a"]);
    expect(catalogs[0]?.courses.map((course) => course.slug)).toEqual([
      "course-a",
    ]);
    expect(catalogs[0]?.courses[0]?.modules.map((module) => module.slug)).toEqual([
      "module-a",
    ]);
    expect(
      catalogs[0]?.courses[0]?.modules[0]?.sections.map(
        (section) => section.slug,
      ),
    ).toEqual(["section-a"]);
    expect(
      catalogs[0]?.courses[0]?.modules[0]?.sections[0]?.topics.map(
        (topic) => topic.slug,
      ),
    ).toEqual(["topic-keep"]);
  });


  it("applies the same authored Practice eligibility to an actor-visible draft course", () => {
    const catalogs = buildChooser({
      options: [
        option("draft-practice", {
          releaseStatus: "draft",
          exercisePurpose: "practice",
        }),
      ],
      visibleSubjectSlugs: new Set(["python-v2"]),
      moduleAccessByKey: new Map(),
    });

    expect(catalogs[0]?.courses[0]?.exerciseCount).toBe(1);
    expect(
      catalogs[0]?.courses[0]?.modules[0]?.sections[0]?.topics[0]
        ?.exerciseCount,
    ).toBe(1);
  });

  it("excludes hidden subject versions", () => {
    const catalogs = buildChooser({
      options: [option("hidden")],
      visibleSubjectSlugs: new Set(),
      moduleAccessByKey: new Map(),
    });

    expect(catalogs).toEqual([]);
  });
});
