import type { ExerciseKind } from "./manifest.js";

export type QualityReportSeverity =
    | "blocker"
    | "error"
    | "warning"
    | "info";

export type QualityReportCategory =
    | "capability"
    | "tests"
    | "starter"
    | "hint"
    | "runtime"
    | "workspace"
    | "redundancy"
    | "progression"
    | "capstone"
    | "alignment"
    | "other";

export type QualityReportIssue = {
    severity: QualityReportSeverity;
    code: string;
    category: QualityReportCategory;
    message: string;
    moduleSlug?: string;
    moduleOrder?: number;
    sectionSlug?: string;
    topicId?: string;
    exerciseId?: string;
};

export type TopicQualityReport = {
    ok: boolean;
    profileId: string;
    subjectSlug: string;
    moduleSlug: string;
    moduleOrder: number;
    topicId: string;
    exerciseCounts: Record<ExerciseKind, number>;
    codeInputSummary: {
        total: number;
        fixedTestsExercises: number;
        semanticExercises: number;
        sqlExercises: number;
        thinTestExercises: number;
    };
    severityCounts: Record<QualityReportSeverity, number>;
    issues: QualityReportIssue[];
};

export type CourseQualityReport = {
    ok: boolean;
    profileId: string;
    subjectSlug: string;
    courseSlug?: string;
    modulesTotal: number;
    topicsTotal: number;
    exerciseCounts: Record<ExerciseKind, number>;
    codeInputSummary: {
        total: number;
        fixedTestsExercises: number;
        semanticExercises: number;
        sqlExercises: number;
        thinTestExercises: number;
    };
    severityCounts: Record<QualityReportSeverity, number>;
    issues: QualityReportIssue[];
};
