import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  visibleCatalogs: vi.fn(),
  chooserOptions: vi.fn(),
  accessModel: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
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

  it("uses the exact learner catalog course set, including an admin-visible draft course", async () => {
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

    const sql = catalogs.find((catalog) => catalog.slug === "sql");

    expect(sql?.courses.map((course) => course.slug)).toEqual([
      "sql-v2",
      "sql-analysis-reporting",
      "multi-table-sql",
      "sql-data-management",
    ]);

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
});
