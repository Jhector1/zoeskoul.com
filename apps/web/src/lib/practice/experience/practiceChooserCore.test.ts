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
                sections: [],
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

  it("uses the shared subject artifacts so canonical SQL courses do not disappear", () => {
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

    expect(
      catalogs
        .find((catalog) => catalog.slug === "sql")
        ?.courses.map((course) => course.slug),
    ).toEqual([
      "sql-v2",
      "sql-analysis-reporting",
      "multi-table-sql",
      "sql-data-management",
    ]);
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
