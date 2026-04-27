export const PROGRESS_RANGE_IDS = ["7d", "30d", "90d"] as const;

export type ProgressRangeId = (typeof PROGRESS_RANGE_IDS)[number];

export type RawProgressDashboardQuery = {
    range?: string | string[] | undefined;
    search?: string | string[] | undefined;
    limit?: string | string[] | number | undefined;
};

export type ProgressDashboardQuery = {
    range: ProgressRangeId;
    search: string;
    limit: number;
};

export type RawLearnerProgressDetailQuery = {
    range?: string | string[] | undefined;
    limit?: string | string[] | number | undefined;
};

export type LearnerProgressDetailQuery = {
    range: ProgressRangeId;
    limit: number;
};


export type QuestionAnalyticsQuery = {
    range?: ProgressRangeId;
    search?: string;
    limit?: number;
    minAttempts?: number;
};

export type RawQuestionAnalyticsQuery = {
    range?: string | string[] | undefined;
    search?: string | string[] | undefined;
    limit?: string | string[] | number | undefined;
    minAttempts?: string | string[] | number | undefined;
};

export type StrugglingQuestionSnapshot = {
    questionKey: string;
    instanceId: string;

    title: string;
    prompt: string;
    kind: string;
    difficulty: string;

    topicSlug: string | null;
    topicTitleKey: string | null;

    subjectId: string | null;
    subjectSlug: string | null;
    subjectTitle: string | null;

    moduleId: string | null;
    moduleSlug: string | null;
    moduleTitle: string | null;

    attempts: number;
    correctAttempts: number;
    wrongAttempts: number;
    revealUsed: number;

    uniqueLearners: number;
    avgAttemptsPerLearner: number;
    successRate: number;
    stuckScore: number;

    firstAttemptAt: string | null;
    lastAttemptAt: string | null;
};

export type QuestionAnalyticsOverview = {
    totalQuestions: number;
    totalAttempts: number;
    totalWrongAttempts: number;
    averageSuccessRate: number;
    questionsNeedingReview: number;
};

export type QuestionAnalyticsResponse = {
    overview: QuestionAnalyticsOverview;
    questions: StrugglingQuestionSnapshot[];
    meta: {
        range: ProgressRangeId;
        search: string;
        limit: number;
        minAttempts: number;
        generatedAt: string;
    };
};



export type LearnerProgressSnapshot = {
    actorKey: string;
    userId: string | null;
    learnerId: string;
    name: string | null;
    email: string | null;

    level: number;
    totalXp: number;
    xpInRange: number;

    currentStreak: number;
    longestStreak: number;
    lastActiveOn: string | null;
    inactiveDays: number | null;

    daysActive: number;
    minutesStudied: number;
    sessionsCompleted: number;

    attempts: number;
    correct: number;
    accuracy: number;

    reviewModulesTracked: number;
    reviewModulesCompleted: number;

    enrolledSubjects: number;
    completedSubjects: number;
    certificatesIssued: number;

    lastEventAt: string | null;

    courseReports: LearnerCourseProgressReport[];
};
export type ProgressDashboardOverview = {
    totalLearners: number;
    activeLearners: number;
    inactiveLearners: number;

    totalXpInRange: number;
    totalAttempts: number;
    totalCorrect: number;
    averageAccuracy: number;

    totalSessionsCompleted: number;
    totalMinutesStudied: number;

    totalEnrollments: number;
    totalCompletedEnrollments: number;
    totalCertificates: number;

    xpEventsInRange: number;
};

export type DailyProgressPoint = {
    day: string;
    xpEarned: number;
    attempts: number;
    correct: number;
    sessions: number;
    minutesStudied: number;
    activeLearners: number;
};

export type SubjectProgressInsight = {
    subjectId: string;
    slug: string;
    title: string;
    enrolledLearners: number;
    completedLearners: number;
    activeLearners: number;
    xpInRange: number;
};

export type RecentXpEventSnapshot = {
    id: string;
    actorKey: string;
    learnerName: string | null;
    learnerEmail: string | null;
    sourceType: string;
    xpDelta: number;
    reason: string;
    subjectTitle: string | null;
    moduleTitle: string | null;
    createdAt: string;
};

export type AtRiskLearnerSnapshot = {
    actorKey: string;
    learnerId: string;
    name: string | null;
    email: string | null;
    totalXp: number;
    lastActiveOn: string | null;
    inactiveDays: number | null;
    accuracy: number;
    reason: string;
};

export type ProgressDashboardInsights = {
    daily: DailyProgressPoint[];
    topSubjects: SubjectProgressInsight[];
    recentXpEvents: RecentXpEventSnapshot[];
    atRiskLearners: AtRiskLearnerSnapshot[];
    mostActiveLearners: LearnerProgressSnapshot[];
};

export type ProgressDashboardResponse = {
    overview: ProgressDashboardOverview;
    learners: LearnerProgressSnapshot[];
    insights: ProgressDashboardInsights;
    meta: {
        range: ProgressRangeId;
        search: string;
        limit: number;
        generatedAt: string;
    };
};


export type LearnerCourseStatus =
    | "not_started"
    | "in_progress"
    | "completed"
    | "certified";

export type LearnerModuleStatus =
    | "not_started"
    | "current"
    | "in_progress"
    | "completed";

export type LearnerModuleProgressSnapshot = {
    moduleId: string;
    moduleSlug: string;
    title: string;
    order: number;
    status: LearnerModuleStatus;
    completedAt: string | null;
    lastActivityAt: string | null;
};

export type LearnerCourseProgressReport = {
    subjectId: string;
    subjectSlug: string;
    subjectTitle: string;

    status: LearnerCourseStatus;

    currentModuleId: string | null;
    currentModuleSlug: string | null;
    currentModuleTitle: string | null;
    currentModuleOrder: number | null;

    totalModules: number;
    completedModules: number;
    remainingModules: number;
    progressPct: number;

    startedAt: string | null;
    lastSeenAt: string | null;
    completedAt: string | null;

    certificateIssued: boolean;
    certificateIssuedAt: string | null;

    modules: LearnerModuleProgressSnapshot[];
};

export type LearnerQuestionHistoryItem = {
    attemptId: string;
    sessionId: string | null;
    occurredAt: string;
    ok: boolean;
    revealUsed: boolean;
    kind: string;
    difficulty: string;
    title: string;
    prompt: string;
    topicSlug: string | null;
    topicTitle: string | null;
    subjectTitle: string | null;
    moduleTitle: string | null;
};

export type LearnerWeakTopicSnapshot = {
    topicSlug: string;
    topicTitle: string | null;
    subjectTitle: string | null;
    moduleTitle: string | null;
    attempts: number;
    correct: number;
    wrong: number;
    successRate: number;
    lastAttemptAt: string | null;
};

export type LearnerAttemptSummary = {
    attempts: number;
    correct: number;
    wrong: number;
    accuracy: number;
};

export type LearnerProgressDetailResponse = {
    learner: LearnerProgressSnapshot;
    summary: LearnerAttemptSummary;
    history: LearnerQuestionHistoryItem[];
    weakTopics: LearnerWeakTopicSnapshot[];
    canLoadAttemptHistory: boolean;
    historyNotice: string | null;
    meta: {
        range: ProgressRangeId;
        limit: number;
        generatedAt: string;
    };
};
