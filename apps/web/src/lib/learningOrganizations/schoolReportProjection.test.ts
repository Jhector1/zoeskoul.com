import {
  describe,
  expect,
  it,
} from "vitest";

import {
  projectSchoolReport,
} from "./schoolReportProjection";

describe("projectSchoolReport", () => {
  it("aggregates classes, learners, and per-course progress without duplicate shared records", () => {
    const sharedDashboard = (
      classId: string,
      className: string,
      lastActivityAt: string,
    ) => ({
      class: {
        id: classId,
        name: className,
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
          subjectId:
            "subject-python",
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
          email:
            "ava@example.com",
          totalXp: 100,
          lastActivityAt,
          assignments: [
            {
              assignmentId:
                "assignment-1",
              status:
                "in_progress" as const,
              progressPct: 50,
              completedModules: 1,
              totalModules: 2,
              attempts: 2,
              correct: 1,
              accuracyPct: 50,
              lastActivityAt,
            },
          ],
        },
      ],
    });

    const report =
      projectSchoolReport({
        school: {
          id: "school-1",
          name: "Zoe Academy",
        },
        dashboards: [
          sharedDashboard(
            "class-1",
            "Python A",
            "2026-09-02T00:00:00.000Z",
          ),
          sharedDashboard(
            "class-2",
            "Python B",
            "2026-09-03T00:00:00.000Z",
          ),
        ],
      });

    expect(report.summary).toEqual({
      classes: 2,
      students: 1,
      assignments: 1,
      averageProgressPct: 50,
      averageAccuracyPct: 50,
    });

    expect(report.courses).toEqual([
      {
        subjectId:
          "subject-python",
        subjectSlug:
          "python-v2",
        subjectTitle: "Python",
        classes: 2,
        students: 1,
        assignments: 1,
        averageProgressPct: 50,
        attempts: 2,
        correct: 1,
        accuracyPct: 50,
      },
    ]);

    expect(
      report.students[0],
    ).toMatchObject({
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

  it("returns clean empty course, class, and learner projections", () => {
    const report =
      projectSchoolReport({
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
    expect(report.courses).toEqual(
      [],
    );
    expect(report.classes).toEqual(
      [],
    );
    expect(report.students).toEqual(
      [],
    );
  });
});
