import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  visibleCatalogs: vi.fn(),
  onboardingProfile: vi.fn(),
  chooserOptions: vi.fn(),
  accessModel: vi.fn(),
  buildChooser: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: { userOnboardingProfile: { findUnique: mocks.onboardingProfile } },
}));

vi.mock("@/lib/subjects/server/catalogVisibility", () => ({
  getAvailableVisibleCatalogsForActor: mocks.visibleCatalogs,
}));

vi.mock("@/lib/practice/challenges/publishedCatalog", () => ({
  listVisiblePracticeChooserExerciseOptions: mocks.chooserOptions,
}));

vi.mock("./dailyAccess", () => ({
  loadPracticeAccessModelForActor: mocks.accessModel,
}));

vi.mock("./practiceChooserCore", () => ({
  buildPracticeChooserCatalogs: mocks.buildChooser,
}));

vi.mock("@/lib/access/resolveModuleAccess", () => ({
  resolveModuleAccess: vi.fn(() => ({ ok: true })),
}));

vi.mock("@zoeskoul/learner-ui/lib/billing/moduleAccess", () => ({
  buildBillingHref: vi.fn(() => "/billing"),
}));

import { loadPracticeChooser } from "./practiceChooser.server";

describe("Practice chooser catalog parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.onboardingProfile.mockReset();
    mocks.onboardingProfile.mockResolvedValue(null);

    mocks.visibleCatalogs.mockResolvedValue([
      {
        slug: "sql",
        subjects: [
          { slug: "sql-v2" },
          { slug: "sql-analysis-reporting" },
          { slug: "multi-table-sql" },
          { slug: "sql-data-management" },
        ],
      },
    ]);

    mocks.chooserOptions.mockResolvedValue([]);
    mocks.buildChooser.mockReturnValue([]);

    mocks.accessModel.mockResolvedValue({
      subjects: [],
      modules: [],
      snapshot: {
        actorKey: "u:test",
        hasUser: true,
        isSubscribed: false,
        subjectAccess: new Set(),
        moduleAccess: new Set(),
        featureAccess: new Set(),
      },
      requireAll: false,
    });
  });

  it("passes the exact learner-visible course set into authored Practice loading", async () => {
    const actor = {
      userId: "admin-1",
      guestId: null,
    };

    const catalogs = await loadPracticeChooser({
      actor,
      locale: "en",
      mode: "subscriber",
      catalogIdentity: {
        userId: "admin-1",
        email: "admin@example.com",
      },
    });

    expect(catalogs).toEqual([]);

    expect(mocks.visibleCatalogs).toHaveBeenCalledWith({
      userId: "admin-1",
      email: "admin@example.com",
    });

    expect(mocks.chooserOptions).toHaveBeenCalledWith(
      new Set([
        "sql-v2",
        "sql-analysis-reporting",
        "multi-table-sql",
        "sql-data-management",
      ]),
    );
  });

  it("makes a payment-locked module startable in free Daily Practice without a billing link", async () => {
    mocks.buildChooser.mockReturnValue([
      {
        slug: "python",
        title: "Python",
        titleKey: null,
        exerciseCount: 4,
        dailyExerciseCount: 3,
        courses: [
          {
            slug: "python-v2",
            title: "Python",
            titleKey: null,
            catalogSlug: "python",
            catalogTitle: "Python",
            exerciseCount: 4,
            dailyExerciseCount: 3,
            modules: [
              {
                slug: "python-v2-0",
                title: "Getting Started",
                titleKey: null,
                availability: "locked",
                billingHref: "/billing",
                exerciseCount: 4,
                dailyExerciseCount: 3,
                sections: [],
              },
            ],
          },
        ],
      },
    ]);

    const catalogs = await loadPracticeChooser({
      actor: { userId: "learner-1", guestId: null },
      locale: "en",
      mode: "free",
    });

    expect(catalogs[0]?.courses[0]?.modules[0]).toMatchObject({
      availability: "available",
      billingHref: null,
      dailyExerciseCount: 3,
    });
  });

  it("keeps a truly unavailable module unavailable in free Daily Practice", async () => {
    mocks.buildChooser.mockReturnValue([
      {
        slug: "python",
        title: "Python",
        titleKey: null,
        exerciseCount: 4,
        dailyExerciseCount: 3,
        courses: [
          {
            slug: "python-v2",
            title: "Python",
            titleKey: null,
            catalogSlug: "python",
            catalogTitle: "Python",
            exerciseCount: 4,
            dailyExerciseCount: 3,
            modules: [
              {
                slug: "python-v2-0",
                title: "Getting Started",
                titleKey: null,
                availability: "unavailable",
                billingHref: null,
                exerciseCount: 4,
                dailyExerciseCount: 3,
                sections: [],
              },
            ],
          },
        ],
      },
    ]);

    const catalogs = await loadPracticeChooser({
      actor: { userId: "learner-1", guestId: null },
      locale: "en",
      mode: "free",
    });

    expect(catalogs[0]?.courses[0]?.modules[0]).toMatchObject({
      availability: "unavailable",
      billingHref: null,
    });
  });

  it("uses a completed learner selection for discovery and retains enrolled courses from other departments", async () => {
    mocks.onboardingProfile.mockResolvedValue({
      version: 2,
      useMode: "learner",
      completedAt: new Date("2026-01-01T00:00:00Z"),
      skippedAt: null,
      departments: [{ departmentKey: "computer-science" }],
    });
    mocks.visibleCatalogs.mockResolvedValue([
      {
        slug: "sql",
        family: "data",
        subjects: [{ slug: "sql-v2", enrolled: false }],
      },
      {
        slug: "languages",
        family: "languages",
        subjects: [
          { slug: "language-enrolled", enrolled: true },
          { slug: "language-other", enrolled: false },
        ],
      },
      {
        slug: "science",
        family: "science",
        subjects: [{ slug: "science-other", enrolled: false }],
      },
    ]);

    await loadPracticeChooser({
      actor: { userId: "learner-1", guestId: null },
      locale: "en",
      mode: "subscriber",
    });

    expect(mocks.onboardingProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "learner-1" },
        select: expect.objectContaining({
          departments: {
            where: { context: "learner" },
            select: { departmentKey: true },
          },
        }),
      }),
    );
    expect(mocks.chooserOptions).toHaveBeenCalledWith(
      new Set(["sql-v2", "language-enrolled"]),
    );
  });

  it("keeps discovery unfiltered for a skipped onboarding profile", async () => {
    mocks.onboardingProfile.mockResolvedValue({
      version: 2,
      useMode: "learner",
      completedAt: new Date("2026-01-01T00:00:00Z"),
      skippedAt: new Date("2026-01-01T00:00:00Z"),
      departments: [{ departmentKey: "languages" }],
    });

    await loadPracticeChooser({
      actor: { userId: "learner-1", guestId: null },
      locale: "en",
      mode: "subscriber",
    });

    expect(mocks.chooserOptions).toHaveBeenCalledWith(
      new Set(["sql-v2", "sql-analysis-reporting", "multi-table-sql", "sql-data-management"]),
    );
  });
});
