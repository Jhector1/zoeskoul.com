import type {
  TeacherClassDashboard,
} from "@/lib/learningGroups/classProgressProjection";

export type TeacherSchoolReport = {
  school: {
    id: string;
    name: string;
  };
  summary: {
    classes: number;
    students: number;
    assignments: number;
    averageProgressPct: number;
    averageAccuracyPct: number;
  };
  courses: Array<{
    subjectId: string;
    subjectSlug: string;
    subjectTitle: string;
    classes: number;
    students: number;
    assignments: number;
    averageProgressPct: number;
    attempts: number;
    correct: number;
    accuracyPct: number;
  }>;
  classes: Array<{
    id: string;
    name: string;
    students: number;
    assignments: number;
    averageProgressPct: number;
    averageAccuracyPct: number;
  }>;
  students: Array<{
    userId: string;
    name: string | null;
    email: string | null;
    classes: number;
    assignments: number;
    averageProgressPct: number;
    attempts: number;
    correct: number;
    accuracyPct: number;
    lastActivityAt: string | null;
  }>;
};

function pct(
  numerator: number,
  denominator: number,
) {
  if (!denominator) return 0;
  return Math.round(
    (numerator / denominator) * 100,
  );
}

function laterIso(
  current: string | null,
  candidate: string | null,
) {
  if (!candidate) return current;
  if (!current) return candidate;
  return Date.parse(candidate) >
    Date.parse(current)
    ? candidate
    : current;
}

export function projectSchoolReport(
  args: {
    school: {
      id: string;
      name: string;
    };
    dashboards:
      TeacherClassDashboard[];
  },
): TeacherSchoolReport {
  const uniqueAssignments =
    new Set<string>();

  const uniqueStudents = new Map<
    string,
    {
      userId: string;
      name: string | null;
      email: string | null;
      classIds: Set<string>;
      assignmentProgress:
        Map<string, number>;
      subjectAccuracy: Map<
        string,
        {
          attempts: number;
          correct: number;
        }
      >;
      lastActivityAt:
        string | null;
    }
  >();

  const courseState = new Map<
    string,
    {
      subjectId: string;
      subjectSlug: string;
      subjectTitle: string;
      classIds: Set<string>;
      studentIds: Set<string>;
      assignmentIds: Set<string>;
      progressCells: Map<
        string,
        number
      >;
      accuracyByStudent: Map<
        string,
        {
          attempts: number;
          correct: number;
        }
      >;
    }
  >();

  const classes =
    args.dashboards.map(
      (dashboard) => {
        for (const assignment of
          dashboard.assignments) {
          uniqueAssignments.add(
            assignment.id,
          );

          const row =
            courseState.get(
              assignment.subjectId,
            ) ?? {
              subjectId:
                assignment.subjectId,
              subjectSlug:
                assignment.subjectSlug,
              subjectTitle:
                assignment.subjectTitle,
              classIds:
                new Set<string>(),
              studentIds:
                new Set<string>(),
              assignmentIds:
                new Set<string>(),
              progressCells:
                new Map<
                  string,
                  number
                >(),
              accuracyByStudent:
                new Map<
                  string,
                  {
                    attempts: number;
                    correct: number;
                  }
                >(),
            };

          row.classIds.add(
            dashboard.class.id,
          );
          row.assignmentIds.add(
            assignment.id,
          );
          courseState.set(
            assignment.subjectId,
            row,
          );
        }

        const assignmentSubject =
          new Map(
            dashboard.assignments.map(
              (assignment) => [
                assignment.id,
                assignment.subjectId,
              ],
            ),
          );

        for (const student of
          dashboard.students) {
          const row =
            uniqueStudents.get(
              student.userId,
            ) ?? {
              userId: student.userId,
              name: student.name,
              email: student.email,
              classIds:
                new Set<string>(),
              assignmentProgress:
                new Map<
                  string,
                  number
                >(),
              subjectAccuracy:
                new Map<
                  string,
                  {
                    attempts: number;
                    correct: number;
                  }
                >(),
              lastActivityAt: null,
            };

          row.classIds.add(
            dashboard.class.id,
          );
          row.lastActivityAt =
            laterIso(
              row.lastActivityAt,
              student.lastActivityAt,
            );

          for (const cell of
            student.assignments) {
            if (
              !row.assignmentProgress.has(
                cell.assignmentId,
              )
            ) {
              row.assignmentProgress.set(
                cell.assignmentId,
                cell.progressPct,
              );
            }

            const subjectId =
              assignmentSubject.get(
                cell.assignmentId,
              );

            if (!subjectId) {
              continue;
            }

            if (
              !row.subjectAccuracy.has(
                subjectId,
              )
            ) {
              row.subjectAccuracy.set(
                subjectId,
                {
                  attempts:
                    cell.attempts,
                  correct:
                    cell.correct,
                },
              );
            }

            const course =
              courseState.get(
                subjectId,
              );

            if (course) {
              course.studentIds.add(
                student.userId,
              );

              const cellKey =
                `${student.userId}:${cell.assignmentId}`;

              if (
                !course.progressCells.has(
                  cellKey,
                )
              ) {
                course.progressCells.set(
                  cellKey,
                  cell.progressPct,
                );
              }

              if (
                !course.accuracyByStudent.has(
                  student.userId,
                )
              ) {
                course.accuracyByStudent.set(
                  student.userId,
                  {
                    attempts:
                      cell.attempts,
                    correct:
                      cell.correct,
                  },
                );
              }
            }
          }

          uniqueStudents.set(
            student.userId,
            row,
          );
        }

        return {
          id: dashboard.class.id,
          name: dashboard.class.name,
          students:
            dashboard.summary.students,
          assignments:
            dashboard.summary
              .assignments,
          averageProgressPct:
            dashboard.summary
              .averageProgressPct,
          averageAccuracyPct:
            dashboard.summary
              .averageAccuracyPct,
        };
      },
    );

  const courses = [
    ...courseState.values(),
  ]
    .map((course) => {
      const progress = [
        ...course.progressCells.values(),
      ];

      let attempts = 0;
      let correct = 0;

      for (const stat of
        course.accuracyByStudent.values()) {
        attempts += stat.attempts;
        correct += stat.correct;
      }

      return {
        subjectId:
          course.subjectId,
        subjectSlug:
          course.subjectSlug,
        subjectTitle:
          course.subjectTitle,
        classes:
          course.classIds.size,
        students:
          course.studentIds.size,
        assignments:
          course.assignmentIds.size,
        averageProgressPct:
          progress.length
            ? Math.round(
                progress.reduce(
                  (sum, value) =>
                    sum + value,
                  0,
                ) /
                  progress.length,
              )
            : 0,
        attempts,
        correct,
        accuracyPct: pct(
          correct,
          attempts,
        ),
      };
    })
    .sort((a, b) =>
      a.subjectTitle.localeCompare(
        b.subjectTitle,
      ),
    );

  let schoolProgressSum = 0;
  let schoolProgressCells = 0;
  let schoolAttempts = 0;
  let schoolCorrect = 0;

  const students = [
    ...uniqueStudents.values(),
  ]
    .map((student) => {
      const progress = [
        ...student.assignmentProgress.values(),
      ];

      let attempts = 0;
      let correct = 0;

      for (const stat of
        student.subjectAccuracy.values()) {
        attempts += stat.attempts;
        correct += stat.correct;
      }

      schoolProgressSum +=
        progress.reduce(
          (sum, value) =>
            sum + value,
          0,
        );
      schoolProgressCells +=
        progress.length;
      schoolAttempts += attempts;
      schoolCorrect += correct;

      return {
        userId: student.userId,
        name: student.name,
        email: student.email,
        classes:
          student.classIds.size,
        assignments:
          student.assignmentProgress
            .size,
        averageProgressPct:
          progress.length
            ? Math.round(
                progress.reduce(
                  (sum, value) =>
                    sum + value,
                  0,
                ) /
                  progress.length,
              )
            : 0,
        attempts,
        correct,
        accuracyPct: pct(
          correct,
          attempts,
        ),
        lastActivityAt:
          student.lastActivityAt,
      };
    })
    .sort((a, b) => {
      const aLabel =
        a.name ?? a.email ?? "";
      const bLabel =
        b.name ?? b.email ?? "";
      return aLabel.localeCompare(
        bLabel,
      );
    });

  return {
    school: args.school,
    summary: {
      classes: classes.length,
      students: students.length,
      assignments:
        uniqueAssignments.size,
      averageProgressPct:
        schoolProgressCells
          ? Math.round(
              schoolProgressSum /
                schoolProgressCells,
            )
          : 0,
      averageAccuracyPct: pct(
        schoolCorrect,
        schoolAttempts,
      ),
    },
    courses,
    classes,
    students,
  };
}
