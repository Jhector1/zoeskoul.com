export type ClassProgressStatus =
  | "not_started"
  | "in_progress"
  | "completed";

export type ClassProgressProjectionSource = {
  class: {
    id: string;
    name: string;
  };
  assignments: Array<{
    id: string;
    title: string;
    status: string;
    availableFrom: string | null;
    dueAt: string | null;
    assignedAt: string;
    subject: {
      id: string;
      slug: string;
      title: string;
      modules: Array<{
        id: string;
        slug: string;
      }>;
    };
  }>;
  students: Array<{
    userId: string;
    name: string | null;
    email: string | null;
    actorKey: string | null;
    totalXp: number;
    lastActiveOn: string | null;
  }>;
  enrollments: Array<{
    userId: string;
    actorKey: string;
    subjectId: string;
    lastSeenAt: string | null;
    completedAt: string | null;
  }>;
  reviews: Array<{
    actorKey: string;
    subjectSlug: string;
    moduleId: string;
    state: unknown;
    updatedAt: string;
  }>;
  attempts: Array<{
    userId: string;
    subjectId: string;
    ok: boolean;
    createdAt: string;
  }>;
};

export type TeacherClassDashboard = {
  class: {
    id: string;
    name: string;
  };
  summary: {
    students: number;
    assignments: number;
    averageProgressPct: number;
    averageAccuracyPct: number;
  };
  assignments: Array<{
    id: string;
    title: string;
    status: string;
    availableFrom: string | null;
    dueAt: string | null;
    subjectId: string;
    subjectSlug: string;
    subjectTitle: string;
    totalModules: number;
    averageProgressPct: number;
  }>;
  students: Array<{
    userId: string;
    name: string | null;
    email: string | null;
    totalXp: number;
    lastActivityAt: string | null;
    assignments: Array<{
      assignmentId: string;
      status: ClassProgressStatus;
      progressPct: number;
      completedModules: number;
      totalModules: number;
      attempts: number;
      correct: number;
      accuracyPct: number;
      lastActivityAt: string | null;
    }>;
  }>;
};

function isCompletedReviewState(state: unknown) {
  if (!state || typeof state !== "object") return false;

  const value = state as {
    moduleCompleted?: unknown;
    completed?: unknown;
    status?: unknown;
    completedAt?: unknown;
  };

  return (
    value.moduleCompleted === true ||
    value.completed === true ||
    value.status === "completed" ||
    typeof value.completedAt === "string"
  );
}

function laterIso(
  current: string | null,
  candidate: string | null | undefined,
) {
  if (!candidate) return current;
  if (!current) return candidate;
  return Date.parse(candidate) > Date.parse(current)
    ? candidate
    : current;
}

function pct(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

export function projectClassProgress(
  source: ClassProgressProjectionSource,
): TeacherClassDashboard {
  const enrollmentsByUserSubject = new Map<
    string,
    ClassProgressProjectionSource["enrollments"][number]
  >();

  for (const enrollment of source.enrollments) {
    enrollmentsByUserSubject.set(
      `${enrollment.userId}:${enrollment.subjectId}`,
      enrollment,
    );
  }

  const reviewsByActorSubject = new Map<
    string,
    ClassProgressProjectionSource["reviews"]
  >();

  for (const review of source.reviews) {
    const key = `${review.actorKey}:${review.subjectSlug}`;
    const bucket = reviewsByActorSubject.get(key) ?? [];
    bucket.push(review);
    reviewsByActorSubject.set(key, bucket);
  }

  const attemptsByUserSubject = new Map<
    string,
    ClassProgressProjectionSource["attempts"]
  >();

  for (const attempt of source.attempts) {
    const key = `${attempt.userId}:${attempt.subjectId}`;
    const bucket = attemptsByUserSubject.get(key) ?? [];
    bucket.push(attempt);
    attemptsByUserSubject.set(key, bucket);
  }

  let totalProgress = 0;
  let totalCells = 0;
  let totalAttempts = 0;
  let totalCorrect = 0;

  const students = source.students.map((student) => {
    let studentLastActivity = student.lastActiveOn;

    const assignments = source.assignments.map((assignment) => {
      const enrollment = enrollmentsByUserSubject.get(
        `${student.userId}:${assignment.subject.id}`,
      );

      const actorKey =
        student.actorKey ??
        enrollment?.actorKey ??
        null;

      const reviews = actorKey
        ? reviewsByActorSubject.get(
            `${actorKey}:${assignment.subject.slug}`,
          ) ?? []
        : [];

      const completedModuleKeys = new Set<string>();
      let lastActivityAt = enrollment?.lastSeenAt ?? null;
      lastActivityAt = laterIso(lastActivityAt, enrollment?.completedAt);

      for (const review of reviews) {
        lastActivityAt = laterIso(
          lastActivityAt,
          review.updatedAt,
        );

        if (!isCompletedReviewState(review.state)) {
          continue;
        }

        for (const module of assignment.subject.modules) {
          if (
            review.moduleId === module.id ||
            review.moduleId === module.slug
          ) {
            completedModuleKeys.add(module.id);
          }
        }
      }

      const attempts =
        attemptsByUserSubject.get(
          `${student.userId}:${assignment.subject.id}`,
        ) ?? [];

      let correct = 0;
      for (const attempt of attempts) {
        if (attempt.ok) correct += 1;
        lastActivityAt = laterIso(
          lastActivityAt,
          attempt.createdAt,
        );
      }

      const completedByEnrollment =
        Boolean(enrollment?.completedAt);

      const totalModules =
        assignment.subject.modules.length;

      const completedModules =
        completedModuleKeys.size;

      const completedByModules =
        totalModules > 0 &&
        completedModules >= totalModules;

      const status: ClassProgressStatus =
        completedByEnrollment || completedByModules
          ? "completed"
          : completedModules > 0 ||
              Boolean(enrollment) ||
              attempts.length > 0
            ? "in_progress"
            : "not_started";

      const progressPct =
        status === "completed"
          ? 100
          : pct(completedModules, totalModules);

      const accuracyPct =
        pct(correct, attempts.length);

      totalProgress += progressPct;
      totalCells += 1;
      totalAttempts += attempts.length;
      totalCorrect += correct;

      studentLastActivity = laterIso(
        studentLastActivity,
        lastActivityAt,
      );

      return {
        assignmentId: assignment.id,
        status,
        progressPct,
        completedModules,
        totalModules,
        attempts: attempts.length,
        correct,
        accuracyPct,
        lastActivityAt,
      };
    });

    return {
      userId: student.userId,
      name: student.name,
      email: student.email,
      totalXp: student.totalXp,
      lastActivityAt: studentLastActivity,
      assignments,
    };
  });

  const assignments = source.assignments.map((assignment) => {
    const progress = students.map((student) => {
      const cell = student.assignments.find(
        (item) => item.assignmentId === assignment.id,
      );
      return cell?.progressPct ?? 0;
    });

    return {
      id: assignment.id,
      title: assignment.title,
      status: assignment.status,
      availableFrom: assignment.availableFrom,
      dueAt: assignment.dueAt,
      subjectId: assignment.subject.id,
      subjectSlug: assignment.subject.slug,
      subjectTitle: assignment.subject.title,
      totalModules: assignment.subject.modules.length,
      averageProgressPct: progress.length
        ? Math.round(
            progress.reduce((sum, value) => sum + value, 0) /
              progress.length,
          )
        : 0,
    };
  });

  return {
    class: source.class,
    summary: {
      students: students.length,
      assignments: assignments.length,
      averageProgressPct: totalCells
        ? Math.round(totalProgress / totalCells)
        : 0,
      averageAccuracyPct: pct(totalCorrect, totalAttempts),
    },
    assignments,
    students,
  };
}
