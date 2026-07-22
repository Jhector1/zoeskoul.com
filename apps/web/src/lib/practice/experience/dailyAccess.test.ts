import { describe, expect, it } from "vitest";

import type { AccessSnapshot } from "@/lib/access/accessSnapshot";
import type { PublishedPracticeExerciseOption } from "@/lib/practice/challenges/publishedCatalog";
import { selectAccessibleDailyPracticeOptions } from "./dailyAccessCore";

function option(args: {
  subjectSlug: string;
  moduleSlug: string;
  releaseStatus?: "active" | "legacy";
}): PublishedPracticeExerciseOption {
  return {
    id: `${args.subjectSlug}:${args.moduleSlug}`,
    catalogSlug: "python",
    catalogTitle: "Python",
    subjectSlug: args.subjectSlug,
    subjectTitle: args.subjectSlug,
    releaseStatus: args.releaseStatus ?? "active",
    moduleSlug: args.moduleSlug,
    moduleTitle: args.moduleSlug,
    sectionSlug: "section",
    sectionTitle: "Section",
    sectionRole: "lesson",
    topicSlug: "topic",
    topicTitle: "Topic",
    exerciseKey: "exercise",
    exerciseTitle: "Exercise",
    exerciseKind: "code_input",
    exercisePurpose: "project",
    isMultiFile: false,
    requiresTerminal: false,
    isStandaloneTryIt: true,
  };
}

function snapshot(overrides: Partial<AccessSnapshot> = {}): AccessSnapshot {
  return {
    actorKey: "u:test",
    hasUser: true,
    isSubscribed: false,
    subjectAccess: new Set(),
    moduleAccess: new Set(),
    featureAccess: new Set(),
    ...overrides,
  };
}

describe("daily practice access filtering", () => {
  it("keeps the enrolled legacy version and hides the active sibling", () => {
    const options = [
      option({ subjectSlug: "python-v1", moduleSlug: "python-v1-m1", releaseStatus: "legacy" }),
      option({ subjectSlug: "python-v2", moduleSlug: "python-v2-m1" }),
    ];

    const selected = selectAccessibleDailyPracticeOptions({
      options,
      subjects: [
        {
          id: "s1",
          slug: "python-v1",
          accessPolicy: "free",
          enrolled: true,
          versioning: { family: "python", status: "legacy", defaultForNewEnrollments: false },
        },
        {
          id: "s2",
          slug: "python-v2",
          accessPolicy: "free",
          enrolled: false,
          versioning: { family: "python", status: "active", defaultForNewEnrollments: true },
        },
      ],
      modules: [
        { id: "m1", slug: "python-v1-m1", accessOverride: "inherit", subjectSlug: "python-v1" },
        { id: "m2", slug: "python-v2-m1", accessOverride: "inherit", subjectSlug: "python-v2" },
      ],
      snapshot: snapshot(),
    });

    expect(selected.map((item) => item.subjectSlug)).toEqual(["python-v1"]);
  });

  it("does not leak access between courses that reuse a module slug", () => {
    const options = [
      option({ subjectSlug: "python-v2", moduleSlug: "module-1" }),
      option({ subjectSlug: "sql-v2", moduleSlug: "module-1" }),
    ];

    const selected = selectAccessibleDailyPracticeOptions({
      options,
      subjects: [
        {
          id: "python",
          slug: "python-v2",
          accessPolicy: "free",
          enrolled: false,
          versioning: {
            family: "python",
            status: "active",
            defaultForNewEnrollments: true,
          },
        },
        {
          id: "sql",
          slug: "sql-v2",
          accessPolicy: "paid",
          enrolled: false,
          versioning: {
            family: "sql",
            status: "active",
            defaultForNewEnrollments: true,
          },
        },
      ],
      modules: [
        {
          id: "python-module",
          slug: "module-1",
          accessOverride: "inherit",
          subjectSlug: "python-v2",
        },
        {
          id: "sql-module",
          slug: "module-1",
          accessOverride: "inherit",
          subjectSlug: "sql-v2",
        },
      ],
      snapshot: snapshot(),
    });

    expect(selected.map((item) => item.subjectSlug)).toEqual(["python-v2"]);
  });

  it("removes paid modules until subscription or a grant is present", () => {
    const options = [option({ subjectSlug: "python-v2", moduleSlug: "python-v2-paid" })];
    const subjects = [
      {
        id: "s2",
        slug: "python-v2",
        accessPolicy: "free" as const,
        enrolled: false,
        versioning: { family: "python", status: "active" as const, defaultForNewEnrollments: true },
      },
    ];
    const modules = [
      {
        id: "m2",
        slug: "python-v2-paid",
        accessOverride: "paid" as const,
        subjectSlug: "python-v2",
      },
    ];

    expect(
      selectAccessibleDailyPracticeOptions({
        options,
        subjects,
        modules,
        snapshot: snapshot(),
      }),
    ).toEqual([]);

    expect(
      selectAccessibleDailyPracticeOptions({
        options,
        subjects,
        modules,
        snapshot: snapshot({ moduleAccess: new Set(["m2"]) }),
      }),
    ).toHaveLength(1);
  });
});
