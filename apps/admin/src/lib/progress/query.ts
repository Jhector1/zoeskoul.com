import { z } from "zod";
import {
    type AtRiskLearnerSnapshot,
    type DailyProgressPoint,
    type LearnerAttemptSummary,
    type LearnerCourseProgressReport,
    type LearnerCourseStatus,
    type LearnerProgressDetailQuery,
    type LearnerProgressDetailResponse,
    type LearnerModuleProgressSnapshot,
    type LearnerModuleStatus,
    type LearnerProgressSnapshot,
    type LearnerQuestionHistoryItem,
    type LearnerWeakTopicSnapshot,
    type ProgressDashboardQuery,
    type ProgressDashboardResponse,
    type RawLearnerProgressDetailQuery,
    type RawProgressDashboardQuery,
    type RecentXpEventSnapshot,
    type SubjectProgressInsight,
} from "@zoeskoul/progress-contracts";
import { prisma } from "@zoeskoul/db";
import {
    daysForRange,
    formatTopicLabel,
    firstParam,
    PROGRESS_RANGE_IDS,
    rangeStart,
    startOfDay,
    toIso,
} from "./shared";

const querySchema = z.object({
    range: z.preprocess(firstParam, z.enum(PROGRESS_RANGE_IDS)).catch("30d"),
    search: z.preprocess(firstParam, z.string().trim().max(120)).catch(""),
    limit: z
        .preprocess(firstParam, z.coerce.number().int().min(1).max(100))
        .catch(25),
});

const learnerDetailQuerySchema = z.object({
    range: z.preprocess(firstParam, z.enum(PROGRESS_RANGE_IDS)).catch("30d"),
    limit: z
        .preprocess(firstParam, z.coerce.number().int().min(1).max(100))
        .catch(30),
});

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

function getReviewCompletedAt(state: unknown, fallback: Date | null) {
    if (!state || typeof state !== "object") return fallback;

    const value = state as {
        completedAt?: unknown;
    };

    if (typeof value.completedAt === "string") {
        const date = new Date(value.completedAt);
        if (!Number.isNaN(date.getTime())) return date;
    }

    return fallback;
}

function moduleKeyMatches(
    progressModuleId: string,
    module: { id: string; slug: string },
) {
    return progressModuleId === module.id || progressModuleId === module.slug;
}

function maxDate(a: Date | null, b: Date | null) {
    if (!a) return b;
    if (!b) return a;
    return a > b ? a : b;
}

function dateKey(date: Date) {
    return date.toISOString().slice(0, 10);
}

function inactiveDays(lastActiveOn: Date | null, now = new Date()) {
    if (!lastActiveOn) return null;
    return Math.max(
        0,
        Math.floor(
            (startOfDay(now).getTime() - startOfDay(lastActiveOn).getTime()) /
            MS_PER_DAY,
        ),
    );
}

function isReviewCompleted(state: unknown) {
    if (!state || typeof state !== "object") return false;

    const value = state as {
        moduleCompleted?: unknown;
        completed?: unknown;
        status?: unknown;
    };

    return (
        value.moduleCompleted === true ||
        value.completed === true ||
        value.status === "completed"
    );
}

function emptyDashboard(query: ProgressDashboardQuery): ProgressDashboardResponse {
    return {
        overview: {
            totalLearners: 0,
            activeLearners: 0,
            inactiveLearners: 0,
            totalXpInRange: 0,
            totalAttempts: 0,
            totalCorrect: 0,
            averageAccuracy: 0,
            totalSessionsCompleted: 0,
            totalMinutesStudied: 0,
            totalEnrollments: 0,
            totalCompletedEnrollments: 0,
            totalCertificates: 0,
            xpEventsInRange: 0,
        },
        learners: [],
        insights: {
            daily: [],
            topSubjects: [],
            recentXpEvents: [],
            atRiskLearners: [],
            mostActiveLearners: [],
        },
        meta: {
            range: query.range,
            search: query.search,
            limit: query.limit,
            generatedAt: new Date().toISOString(),
        },
    };
}

export function normalizeProgressDashboardQuery(
    input: RawProgressDashboardQuery = {},
): ProgressDashboardQuery {
    return querySchema.parse(input);
}

export function normalizeLearnerProgressDetailQuery(
    input: RawLearnerProgressDetailQuery = {},
): LearnerProgressDetailQuery {
    return learnerDetailQuerySchema.parse(input);
}

export function searchParamsToProgressQuery(
    searchParams: URLSearchParams,
): ProgressDashboardQuery {
    return normalizeProgressDashboardQuery({
        range: searchParams.get("range") ?? undefined,
        search: searchParams.get("search") ?? undefined,
        limit: searchParams.get("limit") ?? undefined,
    });
}

export function searchParamsToLearnerProgressDetailQuery(
    searchParams: URLSearchParams,
): LearnerProgressDetailQuery {
    return normalizeLearnerProgressDetailQuery({
        range: searchParams.get("range") ?? undefined,
        limit: searchParams.get("limit") ?? undefined,
    });
}

export async function getProgressDashboard(
    input: RawProgressDashboardQuery = {},
): Promise<ProgressDashboardResponse> {
    const query = normalizeProgressDashboardQuery(input);
    const from = rangeStart(query.range);
    const searchLower = query.search.toLowerCase();

    const learnerRows = await prisma.learnerProgress.findMany({
        orderBy: [{ totalXp: "desc" }, { updatedAt: "desc" }],
        take: 1000,
    });

    const userIds = learnerRows
        .map((row) => row.userId)
        .filter((value): value is string => Boolean(value));
    const users = userIds.length
        ? await prisma.user.findMany({
            where: {
                id: { in: userIds },
            },
            select: {
                id: true,
                name: true,
                email: true,
            },
        })
        : [];

    const userById = new Map(users.map((user) => [user.id, user]));

    const filteredLearners = learnerRows.filter((row) => {        if (!searchLower) return true;

        const user = row.userId ? userById.get(row.userId) : null;

        const haystack = [
            row.actorKey,
            row.userId ?? "",
            user?.name ?? "",
            user?.email ?? "",
        ]
            .join(" ")
            .toLowerCase();

        return haystack.includes(searchLower);
    });

    const actorKeys = filteredLearners.map((row) => row.actorKey);

    if (!actorKeys.length) {
        return emptyDashboard(query);
    }

    const [
        dailyStats,
        reviewRows,
        enrollments,
        certificates,
        xpEvents,
        subjectsWithModules,
        moduleActivityEvents,
    ] = await Promise.all([
        prisma.dailyLearningStat.findMany({
            where: {
                actorKey: { in: actorKeys },
                day: { gte: from },
            },
            select: {
                actorKey: true,
                day: true,
                xpEarned: true,
                answeredCount: true,
                correctCount: true,
                sessionCount: true,
                minutesStudied: true,
            },
        }),

        prisma.reviewProgress.findMany({
            where: {
                actorKey: { in: actorKeys },
            },
            select: {
                actorKey: true,
                subjectSlug: true,
                moduleId: true,
                state: true,
                updatedAt: true,
            },
        }),

        prisma.subjectEnrollment.findMany({
            where: {
                actorKey: { in: actorKeys },
            },
            select: {
                actorKey: true,
                subjectId: true,
                status: true,
                startedAt: true,
                lastSeenAt: true,
                completedAt: true,
                subject: {
                    select: {
                        id: true,
                        slug: true,
                        title: true,
                    },
                },
            },
        }),

        prisma.courseCertificate.findMany({
            where: {
                actorKey: { in: actorKeys },
            },
            select: {
                actorKey: true,
                subjectSlug: true,
                issuedAt: true,
                completedAt: true,
            },
        }),

        prisma.xpEvent.findMany({
            where: {
                actorKey: { in: actorKeys },
                createdAt: { gte: from },
            },
            orderBy: {
                createdAt: "desc",
            },
            take: 5000,
            select: {
                id: true,
                actorKey: true,
                sourceType: true,
                sourceId: true,
                subjectId: true,
                moduleId: true,
                topicId: true,
                instanceId: true,
                sessionId: true,
                xpDelta: true,
                reason: true,
                createdAt: true,
            },
        }),

        prisma.practiceSubject.findMany({
            where: {
                status: "active",
            },
            orderBy: {
                order: "asc",
            },
            select: {
                id: true,
                slug: true,
                title: true,
                modules: {
                    orderBy: {
                        order: "asc",
                    },
                    select: {
                        id: true,
                        slug: true,
                        title: true,
                        order: true,
                    },
                },
            },
        }),

        prisma.xpEvent.findMany({
            where: {
                actorKey: { in: actorKeys },
                subjectId: { not: null },
                moduleId: { not: null },
            },
            orderBy: {
                createdAt: "desc",
            },
            take: 10000,
            select: {
                actorKey: true,
                subjectId: true,
                moduleId: true,
                createdAt: true,
            },
        }),
    ]);

    const xpSubjectIds = xpEvents
        .map((event) => event.subjectId)
        .filter((value): value is string => Boolean(value));

    const enrollmentSubjectIds = enrollments.map((row) => row.subjectId);

    const subjectIds = Array.from(
        new Set([...xpSubjectIds, ...enrollmentSubjectIds]),
    );

    const moduleIds = Array.from(
        new Set(
            xpEvents
                .map((event) => event.moduleId)
                .filter((value): value is string => Boolean(value)),
        ),
    );

    const [extraSubjects, modules] = await Promise.all([
        subjectIds.length
            ? prisma.practiceSubject.findMany({
                where: {
                    id: { in: subjectIds },
                },
                select: {
                    id: true,
                    slug: true,
                    title: true,
                },
            })
            : [],

        moduleIds.length
            ? prisma.practiceModule.findMany({
                where: {
                    id: { in: moduleIds },
                },
                select: {
                    id: true,
                    slug: true,
                    title: true,
                },
            })
            : [],
    ]);

    const subjectById = new Map(
        extraSubjects.map((subject) => [subject.id, subject]),
    );

    for (const enrollment of enrollments) {
        subjectById.set(enrollment.subject.id, enrollment.subject);
    }

    const moduleById = new Map(modules.map((module) => [module.id, module]));

    const statsByActor = new Map<
        string,
        {
            xpInRange: number;
            attempts: number;
            correct: number;
            sessionsCompleted: number;
            daysActive: number;
            minutesStudied: number;
        }
    >();

    for (const learner of filteredLearners) {
        statsByActor.set(learner.actorKey, {
            xpInRange: 0,
            attempts: 0,
            correct: 0,
            sessionsCompleted: 0,
            daysActive: 0,
            minutesStudied: 0,
        });
    }

    const dailyByDay = new Map<
        string,
        DailyProgressPoint & { activeActorKeys: Set<string> }
    >();

    for (const stat of dailyStats) {
        const actorBucket = statsByActor.get(stat.actorKey);
        if (!actorBucket) continue;

        actorBucket.xpInRange += stat.xpEarned;
        actorBucket.attempts += stat.answeredCount;
        actorBucket.correct += stat.correctCount;
        actorBucket.sessionsCompleted += stat.sessionCount;
        actorBucket.minutesStudied += stat.minutesStudied;

        if (
            stat.xpEarned > 0 ||
            stat.answeredCount > 0 ||
            stat.sessionCount > 0 ||
            stat.minutesStudied > 0
        ) {
            actorBucket.daysActive += 1;
        }

        const key = dateKey(stat.day);
        const dailyBucket =
            dailyByDay.get(key) ??
            {
                day: key,
                xpEarned: 0,
                attempts: 0,
                correct: 0,
                sessions: 0,
                minutesStudied: 0,
                activeLearners: 0,
                activeActorKeys: new Set<string>(),
            };

        dailyBucket.xpEarned += stat.xpEarned;
        dailyBucket.attempts += stat.answeredCount;
        dailyBucket.correct += stat.correctCount;
        dailyBucket.sessions += stat.sessionCount;
        dailyBucket.minutesStudied += stat.minutesStudied;

        if (
            stat.xpEarned > 0 ||
            stat.answeredCount > 0 ||
            stat.sessionCount > 0 ||
            stat.minutesStudied > 0
        ) {
            dailyBucket.activeActorKeys.add(stat.actorKey);
        }

        dailyByDay.set(key, dailyBucket);
    }

    const reviewByActor = new Map<
        string,
        {
            tracked: number;
            completed: number;
        }
    >();

    for (const row of reviewRows) {
        const bucket = reviewByActor.get(row.actorKey) ?? {
            tracked: 0,
            completed: 0,
        };

        bucket.tracked += 1;

        if (isReviewCompleted(row.state)) {
            bucket.completed += 1;
        }

        reviewByActor.set(row.actorKey, bucket);
    }

    const enrollmentsByActor = new Map<
        string,
        {
            enrolled: number;
            completed: number;
        }
    >();

    for (const enrollment of enrollments) {
        const bucket = enrollmentsByActor.get(enrollment.actorKey) ?? {
            enrolled: 0,
            completed: 0,
        };

        bucket.enrolled += 1;

        if (
            enrollment.status === "completed" ||
            Boolean(enrollment.completedAt)
        ) {
            bucket.completed += 1;
        }

        enrollmentsByActor.set(enrollment.actorKey, bucket);
    }

    const certificatesByActor = new Map<string, number>();

    for (const certificate of certificates) {
        certificatesByActor.set(
            certificate.actorKey,
            (certificatesByActor.get(certificate.actorKey) ?? 0) + 1,
        );
    }
    const subjectsById = new Map(
        subjectsWithModules.map((subject) => [subject.id, subject]),
    );

    const subjectsBySlug = new Map(
        subjectsWithModules.map((subject) => [subject.slug, subject]),
    );

    const enrollmentsByActorSubject = new Map<
        string,
        (typeof enrollments)[number]
    >();

    for (const enrollment of enrollments) {
        enrollmentsByActorSubject.set(
            `${enrollment.actorKey}:${enrollment.subjectId}`,
            enrollment,
        );
    }

    const certificateByActorSubjectSlug = new Map<
        string,
        (typeof certificates)[number]
    >();

    for (const certificate of certificates) {
        certificateByActorSubjectSlug.set(
            `${certificate.actorKey}:${certificate.subjectSlug}`,
            certificate,
        );
    }

    const reviewRowsByActorSubjectSlug = new Map<
        string,
        typeof reviewRows
    >();

    for (const row of reviewRows) {
        const key = `${row.actorKey}:${row.subjectSlug}`;
        const bucket = reviewRowsByActorSubjectSlug.get(key) ?? [];
        bucket.push(row);
        reviewRowsByActorSubjectSlug.set(key, bucket);
    }

    const activityByActorSubjectModule = new Map<string, Date>();

    for (const event of moduleActivityEvents) {
        if (!event.subjectId || !event.moduleId) continue;

        const key = `${event.actorKey}:${event.subjectId}:${event.moduleId}`;
        const current = activityByActorSubjectModule.get(key) ?? null;

        activityByActorSubjectModule.set(
            key,
            maxDate(current, event.createdAt) ?? event.createdAt,
        );
    }

    function getCourseReportsForActor(
        actorKey: string,
    ): LearnerCourseProgressReport[] {
        const actorEnrollments = enrollments.filter(
            (enrollment) => enrollment.actorKey === actorKey,
        );

        const enrolledSubjectIds = new Set(
            actorEnrollments.map((enrollment) => enrollment.subjectId),
        );

        const activeSubjectIds = new Set(
            moduleActivityEvents
                .filter((event) => event.actorKey === actorKey && event.subjectId)
                .map((event) => event.subjectId as string),
        );

        const subjectIds = Array.from(
            new Set([...enrolledSubjectIds, ...activeSubjectIds]),
        );

        const reports: LearnerCourseProgressReport[] = [];

        for (const subjectId of subjectIds) {
            const subject = subjectsById.get(subjectId);

            if (!subject) {
                continue;
            }

            const enrollment = enrollmentsByActorSubject.get(
                `${actorKey}:${subject.id}`,
            );

            const certificate = certificateByActorSubjectSlug.get(
                `${actorKey}:${subject.slug}`,
            );

            const subjectReviewRows =
                reviewRowsByActorSubjectSlug.get(`${actorKey}:${subject.slug}`) ??
                [];

            const completedModuleIds = new Set<string>();
            const completedAtByModuleId = new Map<string, Date | null>();
            const reviewUpdatedAtByModuleId = new Map<string, Date>();

            for (const review of subjectReviewRows) {
                const matchingModule = subject.modules.find((module) =>
                    moduleKeyMatches(review.moduleId, module),
                );

                if (!matchingModule) {
                    continue;
                }

                reviewUpdatedAtByModuleId.set(
                    matchingModule.id,
                    maxDate(
                        reviewUpdatedAtByModuleId.get(matchingModule.id) ?? null,
                        review.updatedAt,
                    ) ?? review.updatedAt,
                );

                if (isCompletedReviewState(review.state)) {
                    completedModuleIds.add(matchingModule.id);

                    completedAtByModuleId.set(
                        matchingModule.id,
                        getReviewCompletedAt(review.state, review.updatedAt),
                    );
                }
            }

            const moduleReportsBase: LearnerModuleProgressSnapshot[] =
                subject.modules.map((module) => {
                    const activityAt =
                        activityByActorSubjectModule.get(
                            `${actorKey}:${subject.id}:${module.id}`,
                        ) ??
                        activityByActorSubjectModule.get(
                            `${actorKey}:${subject.id}:${module.slug}`,
                        ) ??
                        reviewUpdatedAtByModuleId.get(module.id) ??
                        null;

                    const completedAt = completedAtByModuleId.get(module.id) ?? null;

                    const status: LearnerModuleStatus = completedModuleIds.has(
                        module.id,
                    )
                        ? "completed"
                        : activityAt
                            ? "in_progress"
                            : "not_started";

                    return {
                        moduleId: module.id,
                        moduleSlug: module.slug,
                        title: module.title,
                        order: module.order,
                        status,
                        completedAt: toIso(completedAt),
                        lastActivityAt: toIso(activityAt),
                    };
                });

            const completedModules = moduleReportsBase.filter(
                (module) => module.status === "completed",
            ).length;

            const totalModules = moduleReportsBase.length;
            const remainingModules = Math.max(0, totalModules - completedModules);

            const latestActiveModule = [...moduleReportsBase]
                .filter((module) => module.lastActivityAt)
                .sort((a, b) =>
                    String(b.lastActivityAt).localeCompare(String(a.lastActivityAt)),
                )[0];

            const firstIncompleteModule = moduleReportsBase.find(
                (module) => module.status !== "completed",
            );

            const currentModule =
                firstIncompleteModule ??
                latestActiveModule ??
                moduleReportsBase[0] ??
                null;

            const moduleReports: LearnerModuleProgressSnapshot[] =
                moduleReportsBase.map((module) => ({
                    ...module,
                    status:
                        currentModule &&
                        module.moduleId === currentModule.moduleId &&
                        module.status !== "completed"
                            ? "current"
                            : module.status,
                }));

            const courseCompleted =
                enrollment?.status === "completed" ||
                Boolean(enrollment?.completedAt) ||
                (totalModules > 0 && completedModules === totalModules);

            const courseStatus: LearnerCourseStatus = certificate
                ? "certified"
                : courseCompleted
                    ? "completed"
                    : completedModules > 0 || Boolean(latestActiveModule)
                        ? "in_progress"
                        : "not_started";

            reports.push({
                subjectId: subject.id,
                subjectSlug: subject.slug,
                subjectTitle: subject.title,

                status: courseStatus,

                currentModuleId: currentModule?.moduleId ?? null,
                currentModuleSlug: currentModule?.moduleSlug ?? null,
                currentModuleTitle: currentModule?.title ?? null,
                currentModuleOrder: currentModule?.order ?? null,

                totalModules,
                completedModules,
                remainingModules,
                progressPct: totalModules
                    ? Math.round((completedModules / totalModules) * 100)
                    : 0,

                startedAt: toIso(enrollment?.startedAt ?? null),
                lastSeenAt: toIso(enrollment?.lastSeenAt ?? null),
                completedAt: toIso(enrollment?.completedAt ?? null),

                certificateIssued: Boolean(certificate),
                certificateIssuedAt: toIso(certificate?.issuedAt ?? null),

                modules: moduleReports,
            });
        }

        return reports.sort((a, b) => {
            if (a.status === "in_progress" && b.status !== "in_progress") return -1;
            if (b.status === "in_progress" && a.status !== "in_progress") return 1;
            if (a.status === "completed" && b.status === "not_started") return -1;
            if (b.status === "completed" && a.status === "not_started") return 1;

            return a.subjectTitle.localeCompare(b.subjectTitle);
        });
    }    const lastXpEventByActor = new Map<string, Date>();

    for (const event of xpEvents) {
        const current = lastXpEventByActor.get(event.actorKey);

        if (!current || event.createdAt > current) {
            lastXpEventByActor.set(event.actorKey, event.createdAt);
        }
    }

    const learnerSnapshotsAll: LearnerProgressSnapshot[] =
        filteredLearners.map((row) => {
            const user = row.userId ? userById.get(row.userId) : null;

            const stats = statsByActor.get(row.actorKey) ?? {
                xpInRange: 0,
                attempts: 0,
                correct: 0,
                sessionsCompleted: 0,
                daysActive: 0,
                minutesStudied: 0,
            };

            const review = reviewByActor.get(row.actorKey) ?? {
                tracked: 0,
                completed: 0,
            };

            const enrollment = enrollmentsByActor.get(row.actorKey) ?? {
                enrolled: 0,
                completed: 0,
            };

            const certCount = certificatesByActor.get(row.actorKey) ?? 0;
            const lastEventAt = lastXpEventByActor.get(row.actorKey) ?? null;

            return {
                actorKey: row.actorKey,
                userId: row.userId,
                learnerId: row.id,
                name: user?.name ?? null,
                email: user?.email ?? null,

                level: row.level,
                totalXp: row.totalXp,
                xpInRange: stats.xpInRange,

                currentStreak: row.currentStreak,
                longestStreak: row.longestStreak,
                lastActiveOn: row.lastActiveOn?.toISOString() ?? null,
                inactiveDays: inactiveDays(row.lastActiveOn),

                daysActive: stats.daysActive,
                minutesStudied: stats.minutesStudied,
                sessionsCompleted: stats.sessionsCompleted,

                attempts: stats.attempts,
                correct: stats.correct,
                accuracy: stats.attempts ? stats.correct / stats.attempts : 0,

                reviewModulesTracked: review.tracked,
                reviewModulesCompleted: review.completed,

                enrolledSubjects: enrollment.enrolled,
                completedSubjects: enrollment.completed,
                certificatesIssued: certCount,

                lastEventAt: lastEventAt?.toISOString() ?? null,

                courseReports: getCourseReportsForActor(row.actorKey),
            };        });

    const learners = learnerSnapshotsAll.slice(0, query.limit);

    const activeLearners = learnerSnapshotsAll.filter(
        (learner) => learner.daysActive > 0,
    ).length;

    const inactiveLearners = learnerSnapshotsAll.filter(
        (learner) => learner.daysActive === 0,
    ).length;

    const totalAttempts = learnerSnapshotsAll.reduce(
        (sum, learner) => sum + learner.attempts,
        0,
    );

    const totalCorrect = learnerSnapshotsAll.reduce(
        (sum, learner) => sum + learner.correct,
        0,
    );

    const daily: DailyProgressPoint[] = Array.from(dailyByDay.values())
        .map((point) => ({
            day: point.day,
            xpEarned: point.xpEarned,
            attempts: point.attempts,
            correct: point.correct,
            sessions: point.sessions,
            minutesStudied: point.minutesStudied,
            activeLearners: point.activeActorKeys.size,
        }))
        .sort((a, b) => a.day.localeCompare(b.day));

    const subjectBuckets = new Map<
        string,
        {
            subjectId: string;
            slug: string;
            title: string;
            enrolledLearners: Set<string>;
            completedLearners: Set<string>;
            activeLearners: Set<string>;
            xpInRange: number;
        }
    >();

    function ensureSubjectBucket(subjectId: string) {
        const subject = subjectById.get(subjectId);

        const bucket =
            subjectBuckets.get(subjectId) ??
            {
                subjectId,
                slug: subject?.slug ?? subjectId,
                title: subject?.title ?? subjectId,
                enrolledLearners: new Set<string>(),
                completedLearners: new Set<string>(),
                activeLearners: new Set<string>(),
                xpInRange: 0,
            };

        subjectBuckets.set(subjectId, bucket);
        return bucket;
    }

    for (const enrollment of enrollments) {
        const bucket = ensureSubjectBucket(enrollment.subjectId);
        bucket.enrolledLearners.add(enrollment.actorKey);

        if (
            enrollment.status === "completed" ||
            Boolean(enrollment.completedAt)
        ) {
            bucket.completedLearners.add(enrollment.actorKey);
        }
    }

    for (const event of xpEvents) {
        if (!event.subjectId) continue;

        const bucket = ensureSubjectBucket(event.subjectId);
        bucket.xpInRange += event.xpDelta;
        bucket.activeLearners.add(event.actorKey);
    }

    const topSubjects: SubjectProgressInsight[] = Array.from(
        subjectBuckets.values(),
    )
        .map((bucket) => ({
            subjectId: bucket.subjectId,
            slug: bucket.slug,
            title: bucket.title,
            enrolledLearners: bucket.enrolledLearners.size,
            completedLearners: bucket.completedLearners.size,
            activeLearners: bucket.activeLearners.size,
            xpInRange: bucket.xpInRange,
        }))
        .sort((a, b) => {
            if (b.xpInRange !== a.xpInRange) return b.xpInRange - a.xpInRange;
            return b.enrolledLearners - a.enrolledLearners;
        })
        .slice(0, 8);

    const learnerByActor = new Map(
        learnerSnapshotsAll.map((learner) => [learner.actorKey, learner]),
    );

    const recentXpEvents: RecentXpEventSnapshot[] = xpEvents
        .slice(0, 25)
        .map((event) => {
            const learner = learnerByActor.get(event.actorKey);
            const subject = event.subjectId
                ? subjectById.get(event.subjectId)
                : null;
            const module = event.moduleId ? moduleById.get(event.moduleId) : null;

            return {
                id: event.id,
                actorKey: event.actorKey,
                learnerName: learner?.name ?? null,
                learnerEmail: learner?.email ?? null,
                sourceType: String(event.sourceType),
                xpDelta: event.xpDelta,
                reason: event.reason,
                subjectTitle: subject?.title ?? null,
                moduleTitle: module?.title ?? null,
                createdAt: event.createdAt.toISOString(),
            };
        });

    const atRiskLearners: AtRiskLearnerSnapshot[] = learnerSnapshotsAll
        .filter((learner) => {
            const lowAccuracy =
                learner.attempts >= 5 && learner.accuracy > 0 && learner.accuracy < 0.6;

            const inactive =
                learner.totalXp > 0 &&
                learner.daysActive === 0 &&
                (learner.inactiveDays === null ||
                    learner.inactiveDays >= daysForRange(query.range));

            return lowAccuracy || inactive;
        })
        .map((learner) => {
            const lowAccuracy =
                learner.attempts >= 5 && learner.accuracy > 0 && learner.accuracy < 0.6;

            return {
                actorKey: learner.actorKey,
                learnerId: learner.learnerId,
                name: learner.name,
                email: learner.email,
                totalXp: learner.totalXp,
                lastActiveOn: learner.lastActiveOn,
                inactiveDays: learner.inactiveDays,
                accuracy: learner.accuracy,
                reason: lowAccuracy
                    ? "Low accuracy in selected range"
                    : "No activity in selected range",
            };
        })
        .sort((a, b) => {
            const aDays = a.inactiveDays ?? Number.MAX_SAFE_INTEGER;
            const bDays = b.inactiveDays ?? Number.MAX_SAFE_INTEGER;
            return bDays - aDays;
        })
        .slice(0, 10);

    const mostActiveLearners = [...learnerSnapshotsAll]
        .sort((a, b) => {
            if (b.xpInRange !== a.xpInRange) return b.xpInRange - a.xpInRange;
            if (b.daysActive !== a.daysActive) return b.daysActive - a.daysActive;
            return b.sessionsCompleted - a.sessionsCompleted;
        })
        .slice(0, 10);

    return {
        overview: {
            totalLearners: learnerSnapshotsAll.length,
            activeLearners,
            inactiveLearners,

            totalXpInRange: learnerSnapshotsAll.reduce(
                (sum, learner) => sum + learner.xpInRange,
                0,
            ),
            totalAttempts,
            totalCorrect,
            averageAccuracy: totalAttempts ? totalCorrect / totalAttempts : 0,

            totalSessionsCompleted: learnerSnapshotsAll.reduce(
                (sum, learner) => sum + learner.sessionsCompleted,
                0,
            ),
            totalMinutesStudied: learnerSnapshotsAll.reduce(
                (sum, learner) => sum + learner.minutesStudied,
                0,
            ),

            totalEnrollments: enrollments.length,
            totalCompletedEnrollments: enrollments.filter(
                (row) => row.status === "completed" || Boolean(row.completedAt),
            ).length,
            totalCertificates: certificates.length,

            xpEventsInRange: xpEvents.length,
        },
        learners,
        insights: {
            daily,
            topSubjects,
            recentXpEvents,
            atRiskLearners,
            mostActiveLearners,
        },
        meta: {
            range: query.range,
            search: query.search,
            limit: query.limit,
            generatedAt: new Date().toISOString(),
        },
    };
}

export async function getLearnerProgressDetail(args: {
    actorKey: string;
    query?: RawLearnerProgressDetailQuery;
}): Promise<LearnerProgressDetailResponse | null> {
    const actorKey = String(args.actorKey ?? "").trim();
    if (!actorKey) return null;

    const query = normalizeLearnerProgressDetailQuery(args.query);
    const dashboard = await getProgressDashboard({
        range: query.range,
        search: actorKey,
        limit: 100,
    });
    const learner =
        dashboard.learners.find((item) => item.actorKey === actorKey) ?? null;

    if (!learner) return null;

    if (!learner.userId) {
        return {
            learner,
            summary: {
                attempts: learner.attempts,
                correct: learner.correct,
                wrong: Math.max(learner.attempts - learner.correct, 0),
                accuracy: learner.accuracy,
            },
            history: [],
            weakTopics: [],
            canLoadAttemptHistory: false,
            historyNotice:
                "Detailed attempt history is only available for learners linked to a user account. Guest-only activity is aggregated in the summary cards above.",
            meta: {
                range: query.range,
                limit: query.limit,
                generatedAt: new Date().toISOString(),
            },
        };
    }

    const from = rangeStart(query.range);
    const attempts = await prisma.practiceAttempt.findMany({
        where: {
            userId: learner.userId,
            createdAt: { gte: from },
        },
        orderBy: {
            createdAt: "desc",
        },
        take: Math.max(200, query.limit * 4),
        select: {
            id: true,
            sessionId: true,
            ok: true,
            revealUsed: true,
            createdAt: true,
            instance: {
                select: {
                    kind: true,
                    difficulty: true,
                    title: true,
                    prompt: true,
                    topic: {
                        select: {
                            slug: true,
                            titleKey: true,
                            module: {
                                select: {
                                    title: true,
                                },
                            },
                            subject: {
                                select: {
                                    title: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    const history: LearnerQuestionHistoryItem[] = attempts
        .slice(0, query.limit)
        .map((attempt) => ({
            attemptId: attempt.id,
            sessionId: attempt.sessionId,
            occurredAt: attempt.createdAt.toISOString(),
            ok: attempt.ok,
            revealUsed: attempt.revealUsed,
            kind: String(attempt.instance.kind),
            difficulty: String(attempt.instance.difficulty),
            title: attempt.instance.title,
            prompt: attempt.instance.prompt,
            topicSlug: attempt.instance.topic?.slug ?? null,
            topicTitle: formatTopicLabel({
                slug: attempt.instance.topic?.slug ?? null,
                titleKey: attempt.instance.topic?.titleKey ?? null,
            }),
            subjectTitle: attempt.instance.topic?.subject?.title ?? null,
            moduleTitle: attempt.instance.topic?.module?.title ?? null,
        }));

    const weakTopicMap = new Map<
        string,
        {
            topicSlug: string;
            topicTitle: string | null;
            subjectTitle: string | null;
            moduleTitle: string | null;
            attempts: number;
            correct: number;
            wrong: number;
            lastAttemptAt: Date | null;
        }
    >();

    for (const attempt of attempts) {
        const topicSlug = attempt.instance.topic?.slug ?? "unknown-topic";
        const bucket = weakTopicMap.get(topicSlug) ?? {
            topicSlug,
            topicTitle: formatTopicLabel({
                slug: attempt.instance.topic?.slug ?? null,
                titleKey: attempt.instance.topic?.titleKey ?? null,
            }),
            subjectTitle: attempt.instance.topic?.subject?.title ?? null,
            moduleTitle: attempt.instance.topic?.module?.title ?? null,
            attempts: 0,
            correct: 0,
            wrong: 0,
            lastAttemptAt: null,
        };

        bucket.attempts += 1;
        if (attempt.ok) bucket.correct += 1;
        else bucket.wrong += 1;
        bucket.lastAttemptAt = maxDate(bucket.lastAttemptAt, attempt.createdAt);
        weakTopicMap.set(topicSlug, bucket);
    }

    const weakTopics: LearnerWeakTopicSnapshot[] = Array.from(weakTopicMap.values())
        .map((bucket) => ({
            topicSlug: bucket.topicSlug,
            topicTitle: bucket.topicTitle,
            subjectTitle: bucket.subjectTitle,
            moduleTitle: bucket.moduleTitle,
            attempts: bucket.attempts,
            correct: bucket.correct,
            wrong: bucket.wrong,
            successRate: bucket.attempts ? bucket.correct / bucket.attempts : 0,
            lastAttemptAt: toIso(bucket.lastAttemptAt),
        }))
        .sort((a, b) => {
            if (a.successRate !== b.successRate) return a.successRate - b.successRate;
            if (a.wrong !== b.wrong) return b.wrong - a.wrong;
            return b.attempts - a.attempts;
        })
        .slice(0, 8);

    const summary: LearnerAttemptSummary = {
        attempts: attempts.length,
        correct: attempts.filter((attempt) => attempt.ok).length,
        wrong: attempts.filter((attempt) => !attempt.ok).length,
        accuracy: attempts.length
            ? attempts.filter((attempt) => attempt.ok).length / attempts.length
            : 0,
    };

    return {
        learner,
        summary,
        history,
        weakTopics,
        canLoadAttemptHistory: true,
        historyNotice: null,
        meta: {
            range: query.range,
            limit: query.limit,
            generatedAt: new Date().toISOString(),
        },
    };
}
