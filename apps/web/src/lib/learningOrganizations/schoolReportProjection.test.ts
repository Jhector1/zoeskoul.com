import {
  describe,
  expect,
  it,
} from "vitest";

import {
  projectSchoolReport,
} from "./schoolReportProjection";

describe("projectSchoolReport", () => {
  it("aggregates class dashboards without duplicating a learner or shared assignment", () => {
    const report = projectSchoolReport({
      school: {
        id: "school-1",
        name: "Zoe Academy",
      },
      dashboards: [
        {
          class: {
            id: "class-1",
            name: "Python A",
          },
          summary: {
            students: 1,
            assignments: 1,
            averageProgressPct: 50,
            averageAccuracyPct: 50,
          },
          assignments: [
            {
              id: "assignment-1",
              title: "Python",
              status: "assigned",
              availableFrom: null,
              dueAt: null,
              subjectId: "subject-python",
              subjectSlug: "python-v2",
              subjectTitle: "Python",
              totalModules: 2,
              averageProgressPct: 50,
            },
          ],
          students: [
            {
              userId: "user-1",
              name: "Ava",
              email: "ava@example.com",
              totalXp: 100,
              lastActivityAt:
                "2026-09-02T00:00:00.000Z",
              assignments: [
                {
                  assignmentId: "assignment-1",
                  status: "in_progress",
                  progressPct: 50,
                  completedModules: 1,
                  totalModules: 2,
                  attempts: 2,
                  correct: 1,
                  accuracyPct: 50,
                  lastActivityAt:
                    "2026-09-02T00:00:00.000Z",
                },
              ],
            },
          ],
        },
        {
          class: {
            id: "class-2",
            name: "Python B",
          },
          summary: {
            students: 1,
            assignments: 1,
            averageProgressPct: 50,
            averageAccuracyPct: 50,
          },
          assignments: [
            {
              id: "assignment-1",
              title: "Python",
              status: "assigned",
              availableFrom: null,
              dueAt: null,
              subjectId: "subject-python",
              subjectSlug: "python-v2",
              subjectTitle: "Python",
              totalModules: 2,
              averageProgressPct: 50,
            },
          ],
          students: [
            {
              userId: "user-1",
              name: "Ava",
              email: "ava@example.com",
              totalXp: 100,
              lastActivityAt:
                "2026-09-03T00:00:00.000Z",
              assignments: [
                {
                  assignmentId: "assignment-1",
                  status: "in_progress",
                  progressPct: 50,
                  completedModules: 1,
                  totalModules: 2,
                  attempts: 2,
                  correct: 1,
                  accuracyPct: 50,
                  lastActivityAt:
                    "2026-09-03T00:00:00.000Z",
                },
              ],
            },
          ],
        },
      ],
    });

    expect(report.summary).toEqual({
      classes: 2,
      students: 1,
      assignments: 1,
      averageProgressPct: 50,
      averageAccuracyPct: 50,
    });

    expect(report.students[0]).toMatchObject({
      userId: "user-1",
      classes: 2,
      assignments: 1,
      attempts: 2,
      correct: 1,
      accuracyPct: 50,
      lastActivityAt:
        "2026-09-03T00:00:00.000Z",
    });
  });

  it("returns a clean empty school report", () => {
    const report = projectSchoolReport({
      school: {
        id: "school-1",
        name: "Empty School",
      },
      dashboards: [],
    });

    expect(report.summary).toEqual({
      classes: 0,
      students: 0,
      assignments: 0,
      averageProgressPct: 0,
      averageAccuracyPct: 0,
    });
    expect(report.classes).toEqual([]);
    expect(report.students).toEqual([]);
  });
});
