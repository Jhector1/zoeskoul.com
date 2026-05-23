import type {
    CourseQualityReport,
    CourseSpec,
    CourseSpecDifficulty,
    ExerciseKind,
    QualityReportIssue,
    QualityReportSeverity,
    TopicQualityReport,
} from "@zoeskoul/curriculum-contracts";

const EXERCISE_KINDS: ExerciseKind[] = [
    "single_choice",
    "multi_choice",
    "drag_reorder",
    "fill_blank_choice",
    "code_input",
];

function makeExerciseCounts(): Record<ExerciseKind, number> {
    return {
        single_choice: 0,
        multi_choice: 0,
        drag_reorder: 0,
        fill_blank_choice: 0,
        code_input: 0,
    };
}

function normalizeText(value: unknown): string {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function countSeverities(
    issues: QualityReportIssue[],
): Record<QualityReportSeverity, number> {
    return issues.reduce(
        (counts, issue) => {
            counts[issue.severity] += 1;
            return counts;
        },
        {
            blocker: 0,
            error: 0,
            warning: 0,
            info: 0,
        } satisfies Record<QualityReportSeverity, number>,
    );
}

function difficultyLevel(difficulty: CourseSpecDifficulty | undefined): number {
    if (difficulty === "advanced") return 3;
    if (difficulty === "intermediate") return 2;
    return 1;
}

export function buildCourseQualityReport(args: {
    profileId: string;
    subjectSlug: string;
    courseSlug?: string;
    spec?: CourseSpec | null;
    topicReports: TopicQualityReport[];
}): CourseQualityReport {
    const issues: QualityReportIssue[] = args.topicReports.flatMap(
        (report) => report.issues,
    );
    const exerciseCounts = makeExerciseCounts();
    let fixedTestsExercises = 0;
    let semanticExercises = 0;
    let sqlExercises = 0;
    let thinTestExercises = 0;

    for (const report of args.topicReports) {
        for (const kind of EXERCISE_KINDS) {
            exerciseCounts[kind] += report.exerciseCounts[kind];
        }
        fixedTestsExercises += report.codeInputSummary.fixedTestsExercises;
        semanticExercises += report.codeInputSummary.semanticExercises;
        sqlExercises += report.codeInputSummary.sqlExercises;
        thinTestExercises += report.codeInputSummary.thinTestExercises;
    }

    const spec = args.spec ?? null;

    if (
        spec?.policy?.projectPolicy?.capstoneRequired &&
        !spec.modules[spec.modules.length - 1]?.moduleProject?.trim()
    ) {
        issues.push({
            severity: "error",
            code: "COURSE_CAPSTONE_MISSING",
            category: "capstone",
            message:
                "Course policy requires a final capstone, but the last module has no moduleProject.",
        });
    }

    const maxJump = spec?.policy?.qualityPolicy?.maxAdjacentDifficultyJump ?? 1;
    const adjacencyTopics =
        spec?.modules.flatMap((module) =>
            module.sections.flatMap((section) =>
                section.topics.map((topic) => ({
                    moduleSlug: module.moduleSlug,
                    moduleOrder: module.moduleNumber,
                    topicId: topic.topicId,
                    title: topic.title,
                    summary: topic.summary ?? "",
                    difficulty: topic.difficulty,
                })),
            ),
        ) ?? [];

    for (let index = 1; index < adjacencyTopics.length; index += 1) {
        const previous = adjacencyTopics[index - 1];
        const current = adjacencyTopics[index];
        const jump =
            difficultyLevel(current.difficulty) -
            difficultyLevel(previous.difficulty);

        if (jump <= maxJump) continue;

        const bridgeText = normalizeText(
            `${current.title} ${current.summary}`,
        );
        const hasBridgeLanguage =
            bridgeText.includes("review") ||
            bridgeText.includes("bridge") ||
            bridgeText.includes("recap") ||
            bridgeText.includes("reminder");

        issues.push({
            severity: hasBridgeLanguage ? "warning" : "error",
            code: "DIFFICULTY_JUMP_TOO_SHARP",
            category: "progression",
            moduleSlug: current.moduleSlug,
            moduleOrder: current.moduleOrder,
            topicId: current.topicId,
            message: `Topic "${current.topicId}" jumps from ${previous.difficulty ?? "beginner"} to ${current.difficulty ?? "beginner"} without enough progression.`,
        });

        if (!hasBridgeLanguage) {
            issues.push({
                severity: "warning",
                code: "DIFFICULTY_BRIDGE_MISSING",
                category: "progression",
                moduleSlug: current.moduleSlug,
                moduleOrder: current.moduleOrder,
                topicId: current.topicId,
                message: `Topic "${current.topicId}" increases difficulty sharply without review or bridge language in the topic title/summary.`,
            });
        }
    }

    for (const rule of spec?.policy?.qualityPolicy?.reservedConceptsByModule ?? []) {
        for (const module of spec.modules) {
            if (module.moduleNumber >= rule.earliestModuleNumber) continue;

            const text = normalizeText(
                [
                    module.title,
                    module.description,
                    module.purpose,
                    ...module.sections.flatMap((section) => [
                        section.title,
                        section.description,
                        ...section.topics.flatMap((topic) => [
                            topic.title,
                            topic.summary,
                            ...(topic.learningGoals ?? []),
                        ]),
                    ]),
                ]
                    .filter(Boolean)
                    .join(" "),
            );

            if (!text.includes(normalizeText(rule.concept))) continue;

            issues.push({
                severity: "warning",
                code: "CONCEPT_INTRODUCED_TOO_EARLY",
                category: "progression",
                moduleSlug: module.moduleSlug,
                moduleOrder: module.moduleNumber,
                message: `Concept "${rule.concept}" appears before module ${rule.earliestModuleNumber}.`,
            });
        }
    }

    const severityCounts = countSeverities(issues);

    return {
        ok: severityCounts.blocker === 0 && severityCounts.error === 0,
        profileId: args.profileId,
        subjectSlug: args.subjectSlug,
        courseSlug: args.courseSlug,
        modulesTotal: spec?.modules.length ?? 0,
        topicsTotal: args.topicReports.length,
        exerciseCounts,
        codeInputSummary: {
            total: exerciseCounts.code_input,
            fixedTestsExercises,
            semanticExercises,
            sqlExercises,
            thinTestExercises,
        },
        severityCounts,
        issues,
    };
}
