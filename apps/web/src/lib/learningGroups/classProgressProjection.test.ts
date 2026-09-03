import {
  describe,
  expect,
  it,
} from "vitest";

import {
  projectClassProgress,
} from "./classProgressProjection";

describe("projectClassProgress", () => {
  it("projects class gradebook cells from existing enrollment, review, and attempt state", () => {
    const dashboard = projectClassProgress({
      class: {
        id: "group-1",
        name: "Python 1",
      },
      assignments: [
        {
          id: "assignment-1",
          title: "Python Foundations",
          status: "assigned",
          availableFrom: null,
          dueAt: "2026-09-20T00:00:00.000Z",
          assignedAt: "2026-09-01T00:00:00.000Z",
          subject: {
            id: "subject-1",
            slug: "python-v2",
            title: "Python",
            modules: [
              { id: "module-db-1", slug: "module-1" },
              { id: "module-db-2", slug: "module-2" },
            ],
          },
        },
      ],
      students: [
        {
          userId: "user-1",
          name: "Ava",
          email: "ava@example.com",
          actorKey: "user:user-1",
          totalXp: 100,
          lastActiveOn: "2026-09-02T00:00:00.000Z",
        },
        {
          userId: "user-2",
          name: "Mia",
          email: "mia@example.com",
          actorKey: "user:user-2",
          totalXp: 80,
          lastActiveOn: null,
        },
      ],
      enrollments: [
        {
          userId: "user-1",
          actorKey: "user:user-1",
          subjectId: "subject-1",
          lastSeenAt: "2026-09-03T00:00:00.000Z",
          completedAt: null,
        },
        {
          userId: "user-2",
          actorKey: "user:user-2",
          subjectId: "subject-1",
          lastSeenAt: "2026-09-03T00:00:00.000Z",
          completedAt: "2026-09-03T01:00:00.000Z",
        },
      ],
      reviews: [
        {
          actorKey: "user:user-1",
          subjectSlug: "python-v2",
          moduleId: "module-1",
          state: { moduleCompleted: true },
          updatedAt: "2026-09-03T02:00:00.000Z",
        },
        {
          actorKey: "user:user-1",
          subjectSlug: "python-v2",
          moduleId: "module-1",
          state: { completed: true },
          updatedAt: "2026-09-03T03:00:00.000Z",
        },
      ],
      attempts: [
        {
          userId: "user-1",
          subjectId: "subject-1",
          ok: true,
          createdAt: "2026-09-03T04:00:00.000Z",
        },
        {
          userId: "user-1",
          subjectId: "subject-1",
          ok: false,
          createdAt: "2026-09-03T05:00:00.000Z",
        },
      ],
    });

    expect(dashboard.summary).toEqual({
      students: 2,
      assignments: 1,
      averageProgressPct: 75,
      averageAccuracyPct: 50,
    });

    expect(
      dashboard.students[0]?.assignments[0],
    ).toMatchObject({
      status: "in_progress",
      progressPct: 50,
      completedModules: 1,
      totalModules: 2,
      attempts: 2,
      correct: 1,
      accuracyPct: 50,
    });

    expect(
      dashboard.students[1]?.assignments[0],
    ).toMatchObject({
      status: "completed",
      progressPct: 100,
    });

    expect(
      dashboard.assignments[0]?.averageProgressPct,
    ).toBe(75);
  });

  it("keeps an untouched roster learner as not started instead of inventing progress", () => {
    const dashboard = projectClassProgress({
      class: { id: "group-1", name: "SQL" },
      assignments: [
        {
          id: "assignment-1",
          title: "SQL",
          status: "assigned",
          availableFrom: null,
          dueAt: null,
          assignedAt: "2026-09-01T00:00:00.000Z",
          subject: {
            id: "subject-1",
            slug: "sql-v2",
            title: "SQL",
            modules: [
              { id: "m1", slug: "m1" },
            ],
          },
        },
      ],
      students: [
        {
          userId: "user-1",
          name: null,
          email: "student@example.com",
          actorKey: null,
          totalXp: 0,
          lastActiveOn: null,
        },
      ],
      enrollments: [],
      reviews: [],
      attempts: [],
    });

    expect(
      dashboard.students[0]?.assignments[0],
    ).toMatchObject({
      status: "not_started",
      progressPct: 0,
      attempts: 0,
    });
  });
});
