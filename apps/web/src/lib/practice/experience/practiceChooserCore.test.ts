import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { PublishedPracticeExerciseOption } from "@/lib/practice/challenges/publishedCatalog";
import { buildPracticeChooserCatalogs } from "./practiceChooserCore";
import { practiceModuleAccessKey } from "./practiceAccessKey";

function option(
  exerciseKey: string,
  overrides: Partial<PublishedPracticeExerciseOption> = {},
): PublishedPracticeExerciseOption {
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
    exercisePurpose: "project",
    isMultiFile: false,
    requiresTerminal: false,
    isStandaloneTryIt: true,
    ...overrides,
  };
}

describe("practice chooser hierarchy", () => {
  it("builds catalog, course, module, section, and topic levels once", () => {
    const catalogs = buildPracticeChooserCatalogs({
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
      courses: [
        {
          title: "Python for Beginners",
          titleKey: "subjects.python-v2.title",
          modules: [
            {
              title: "Foundations",
              titleKey: "modules.python-v2.module-1.title",
              sections: [
                {
                  title: "Start here",
                  titleKey: "sections.python-v2.module-1.section-1.title",
                  topics: [
                    {
                      slug: "topic-1",
                      title: "First steps",
                      titleKey: "topics.python-v2.module-1.topic-1.label",
                      exerciseCount: 2,
                      dailyExerciseCount: 2,
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


  it("counts every eligible authored lesson exercise for subscriber practice", () => {
    const catalogs = buildPracticeChooserCatalogs({
      options: [
        option("project"),
        option("try-it", { exercisePurpose: "try_it" }),
        option("quiz", { exercisePurpose: "quiz", exerciseKind: "single_choice" }),
      ],
      visibleSubjectSlugs: new Set(["python-v2"]),
      moduleAccessByKey: new Map([
        [
          practiceModuleAccessKey("python-v2", "module-1"),
          { availability: "available" as const },
        ],
      ]),
    });

    expect(catalogs[0]?.exerciseCount).toBe(3);
    expect(catalogs[0]?.courses[0]?.modules[0]?.sections[0]?.topics[0])
      .toMatchObject({ exerciseCount: 3, dailyExerciseCount: 2 });
  });

  it("preserves locked modules and their billing destination", () => {
    const catalogs = buildPracticeChooserCatalogs({
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
    const catalogs = buildPracticeChooserCatalogs({
      options: [
        option("free", { subjectSlug: "python-v2" }),
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

  it("excludes hidden subject versions", () => {
    const catalogs = buildPracticeChooserCatalogs({
      options: [option("hidden")],
      visibleSubjectSlugs: new Set(),
      moduleAccessByKey: new Map(),
    });

    expect(catalogs).toEqual([]);
  });
});
