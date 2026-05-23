import type {
    ExerciseKind,
    QualityReportIssue,
    QualityReportSeverity,
    TopicAuthoringDraft,
    TopicBundleManifest,
    TopicQualityReport,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import {
    getCurriculumProfile,
    profileSupportsCodeInput,
} from "@zoeskoul/curriculum-profiles";

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

function stripCommentText(source: string): string {
    return source
        .split("\n")
        .map((line) =>
            line
                .replace(/#.*$/g, "")
                .replace(/\/\/.*$/g, "")
                .replace(/--.*$/g, ""),
        )
        .join("\n");
}

function normalizeCode(source: unknown): string {
    return stripCommentText(String(source ?? ""))
        .replace(/\s+/g, "")
        .trim();
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

function tokenize(text: string): string[] {
    return normalizeText(text)
        .split(/[^a-z0-9_]+/)
        .filter((token) => token.length >= 4);
}

function buildLearningGoalAlignmentIssue(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): QualityReportIssue[] {
    const learningGoals = args.seed.learningGoals ?? [];

    if (learningGoals.length === 0) {
        return [];
    }

    const exerciseText = normalizeText(
        args.draft.quizDraft
            .map((exercise) => `${exercise.title} ${exercise.prompt}`)
            .join(" "),
    );

    const hasAlignment = learningGoals.some((goal) =>
        tokenize(goal).some((token) => exerciseText.includes(token)),
    );

    if (hasAlignment) {
        return [];
    }

    return [
        {
            severity: "warning",
            code: "LEARNING_GOAL_ALIGNMENT_WEAK",
            category: "alignment",
            topicId: args.seed.topicId,
            moduleSlug: args.seed.moduleSlug,
            moduleOrder: args.seed.moduleOrder,
            message:
                "Topic learning goals do not clearly appear in exercise titles or prompts.",
        },
    ];
}

function buildRepeatedWordingIssues(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
    threshold: number;
}): QualityReportIssue[] {
    const seen = new Map<string, string[]>();

    for (const exercise of args.draft.quizDraft) {
        for (const text of [exercise.title, exercise.prompt]) {
            const normalized = normalizeText(text);
            if (!normalized) continue;
            const ids = seen.get(normalized) ?? [];
            ids.push(exercise.id);
            seen.set(normalized, ids);
        }
    }

    const issues: QualityReportIssue[] = [];

    for (const [text, exerciseIds] of seen.entries()) {
        if (exerciseIds.length < threshold) continue;
        issues.push({
            severity: "warning",
            code: "REPEATED_EXERCISE_WORDING",
            category: "redundancy",
            topicId: args.seed.topicId,
            moduleSlug: args.seed.moduleSlug,
            moduleOrder: args.seed.moduleOrder,
            message: `Repeated exercise wording appears ${exerciseIds.length} times in topic "${args.seed.topicId}": ${JSON.stringify(text)}`,
        });
    }

    return issues;
}

function isSqlMutation(solutionCode: string): boolean {
    return /^(insert|update|delete|replace|create|drop|alter)\b/i.test(
        String(solutionCode ?? "").trim(),
    );
}

export function buildTopicQualityReport(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
    topicBundle: TopicBundleManifest;
}): TopicQualityReport {
    const profile = getCurriculumProfile(args.seed.profileId);
    const issues: QualityReportIssue[] = [];
    const exerciseCounts = makeExerciseCounts();
    let fixedTestsExercises = 0;
    let semanticExercises = 0;
    let sqlExercises = 0;
    let thinTestExercises = 0;

    if (
        profile.runtimeKind &&
        args.topicBundle.runtimeDefaults?.kind !== profile.runtimeKind
    ) {
        issues.push({
            severity: "blocker",
            code: "PROFILE_RUNTIME_KIND_LEAK",
            category: "runtime",
            topicId: args.seed.topicId,
            moduleSlug: args.seed.moduleSlug,
            moduleOrder: args.seed.moduleOrder,
            message: `Topic bundle runtime kind "${args.topicBundle.runtimeDefaults?.kind ?? "none"}" does not match profile "${profile.id}" runtime kind "${profile.runtimeKind}".`,
        });
    }

    for (const exercise of args.draft.quizDraft) {
        exerciseCounts[exercise.kind] += 1;

        if (!profile.allowedExerciseKinds.includes(exercise.kind)) {
            issues.push({
                severity: "blocker",
                code: "PROFILE_EXERCISE_KIND_UNSUPPORTED",
                category: "capability",
                topicId: args.seed.topicId,
                moduleSlug: args.seed.moduleSlug,
                moduleOrder: args.seed.moduleOrder,
                exerciseId: exercise.id,
                message: `Profile "${profile.id}" does not support ${exercise.kind} exercises.`,
            });
        }

        if (exercise.kind !== "code_input") {
            continue;
        }

        if (!profileSupportsCodeInput(profile)) {
            issues.push({
                severity: "blocker",
                code: "PROFILE_CODE_INPUT_UNSUPPORTED",
                category: "capability",
                topicId: args.seed.topicId,
                moduleSlug: args.seed.moduleSlug,
                moduleOrder: args.seed.moduleOrder,
                exerciseId: exercise.id,
                message: `Profile "${profile.id}" does not support code_input exercises.`,
            });
            continue;
        }

        const starter = normalizeCode(exercise.starterCode);
        const solution = normalizeCode(exercise.solutionCode);

        if (starter && solution && starter === solution) {
            issues.push({
                severity: "blocker",
                code: "STARTER_REVEALS_SOLUTION",
                category: "starter",
                topicId: args.seed.topicId,
                moduleSlug: args.seed.moduleSlug,
                moduleOrder: args.seed.moduleOrder,
                exerciseId: exercise.id,
                message: `Exercise "${exercise.id}" starterCode reveals its solutionCode.`,
            });
        }

        const manifestExercise = args.topicBundle.exercises.find(
            (candidate) => candidate.id === exercise.id,
        );

        if (!manifestExercise || manifestExercise.kind !== "code_input") {
            issues.push({
                severity: "blocker",
                code: "CODE_INPUT_MANIFEST_MISSING",
                category: "runtime",
                topicId: args.seed.topicId,
                moduleSlug: args.seed.moduleSlug,
                moduleOrder: args.seed.moduleOrder,
                exerciseId: exercise.id,
                message: `Exercise "${exercise.id}" did not emit a code_input manifest entry.`,
            });
            continue;
        }

        if (
            profile.defaultLanguage &&
            manifestExercise.language !== profile.defaultLanguage
        ) {
            issues.push({
                severity: "blocker",
                code: "CODE_INPUT_LANGUAGE_LEAK",
                category: "runtime",
                topicId: args.seed.topicId,
                moduleSlug: args.seed.moduleSlug,
                moduleOrder: args.seed.moduleOrder,
                exerciseId: exercise.id,
                message: `Exercise "${exercise.id}" emitted language "${manifestExercise.language}", expected "${profile.defaultLanguage}" for profile "${profile.id}".`,
            });
        }

        if (
            profile.defaultEntryFileName &&
            manifestExercise.workspace?.entryFilePath !==
                profile.defaultEntryFileName
        ) {
            issues.push({
                severity: "blocker",
                code: "WORKSPACE_ENTRY_FILE_LEAK",
                category: "workspace",
                topicId: args.seed.topicId,
                moduleSlug: args.seed.moduleSlug,
                moduleOrder: args.seed.moduleOrder,
                exerciseId: exercise.id,
                message: `Exercise "${exercise.id}" emitted entry file "${manifestExercise.workspace?.entryFilePath ?? "none"}", expected "${profile.defaultEntryFileName}" for profile "${profile.id}".`,
            });
        }

        if (manifestExercise.recipe.type === "fixed_tests") {
            fixedTestsExercises += 1;
            const minimumFixedTests = profile.codeInput.minimumFixedTests ?? 1;
            if (manifestExercise.recipe.tests.length < minimumFixedTests) {
                thinTestExercises += 1;
                issues.push({
                    severity: "error",
                    code: "CODE_INPUT_TESTS_TOO_THIN",
                    category: "tests",
                    topicId: args.seed.topicId,
                    moduleSlug: args.seed.moduleSlug,
                    moduleOrder: args.seed.moduleOrder,
                    exerciseId: exercise.id,
                    message: `Exercise "${exercise.id}" has ${manifestExercise.recipe.tests.length} fixed test(s), below the profile minimum of ${minimumFixedTests}.`,
                });
            }
        } else if (manifestExercise.recipe.type === "semantic") {
            semanticExercises += 1;
        } else if (manifestExercise.recipe.type === "sql_query") {
            sqlExercises += 1;
            if (!manifestExercise.recipe.datasetId?.trim()) {
                issues.push({
                    severity: "blocker",
                    code: "SQL_DATASET_MISSING",
                    category: "runtime",
                    topicId: args.seed.topicId,
                    moduleSlug: args.seed.moduleSlug,
                    moduleOrder: args.seed.moduleOrder,
                    exerciseId: exercise.id,
                    message: `Exercise "${exercise.id}" emitted SQL recipe without datasetId.`,
                });
            }

            if (
                isSqlMutation(manifestExercise.recipe.solutionCode) &&
                !manifestExercise.recipe.checkSql?.trim()
            ) {
                issues.push({
                    severity: "blocker",
                    code: "SQL_CHECK_SQL_MISSING",
                    category: "tests",
                    topicId: args.seed.topicId,
                    moduleSlug: args.seed.moduleSlug,
                    moduleOrder: args.seed.moduleOrder,
                    exerciseId: exercise.id,
                    message: `Exercise "${exercise.id}" emits a SQL mutation without checkSql.`,
                });
            }
        }
    }

    issues.push(
        ...buildRepeatedWordingIssues({
            seed: args.seed,
            draft: args.draft,
            threshold: profile.qualityPolicy?.repeatedExerciseTextThreshold ?? 2,
        }),
        ...buildLearningGoalAlignmentIssue({
            seed: args.seed,
            draft: args.draft,
        }),
    );

    const severityCounts = countSeverities(issues);

    return {
        ok: severityCounts.blocker === 0 && severityCounts.error === 0,
        profileId: args.seed.profileId,
        subjectSlug: args.seed.subjectSlug,
        moduleSlug: args.seed.moduleSlug,
        moduleOrder: args.seed.moduleOrder,
        topicId: args.seed.topicId,
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
