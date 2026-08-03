/* eslint-disable @typescript-eslint/no-explicit-any */

export async function getAssignedSubjectIdsForUser(
  _prisma: any,
  _args: {
    userId: string;
    subjectIds: readonly string[];
    now?: Date;
  },
): Promise<Set<string>> {
  return new Set<string>();
}

export async function getLearningAssignmentsForUser(
  _prisma: any,
  _args: {
    userId: string;
    now?: Date;
  },
): Promise<any[]> {
  return [];
}

export async function getLearningAssignmentContextsForSubject(
  _prisma: any,
  _args: {
    userId: string;
    subjectId: string;
    now?: Date;
  },
): Promise<any[]> {
  return [];
}

export async function getLearningAssignmentForUser(
  _prisma: any,
  _args: {
    assignmentId: string;
    userId: string;
  },
): Promise<any | null> {
  return null;
}
