import {
  createApiClient,
} from "@zoeskoul/api-client";

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

export function createTeacherReportsClient(args: {
  apiOrigin: string;
  fetchImpl?: typeof globalThis.fetch;
}) {
  const api = createApiClient({
    baseOrigin: args.apiOrigin,
    fetchImpl: args.fetchImpl,
  });

  return {
    async getSchoolReport(schoolId: string) {
      return api.request<{
        report: TeacherSchoolReport;
      }>(
        `/api/teacher/schools/${encodeURIComponent(schoolId)}/report`,
        {
          method: "GET",
          cache: "no-store",
        },
      );
    },
  };
}
