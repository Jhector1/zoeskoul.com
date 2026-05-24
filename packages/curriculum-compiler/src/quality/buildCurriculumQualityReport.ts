import type {
    CourseSpec,
    ManifestCodeInput,
    TopicAuthoringDraft,
    TopicBundleManifest,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import {
    getCurriculumProfile,
    profileSupportsCodeInput,
} from "@zoeskoul/curriculum-profiles";

export type CurriculumQualitySeverity = "blocker" | "error" | "warning" | "info";

export type CurriculumQualityIssue = {
    code: string;
    severity: CurriculumQualitySeverity;
    message: string;
    path?: string;
    profileId?: string;
    moduleId?: string;
    topicId?: string;
    exerciseId?: string;
};

export type CurriculumQualityReport = {
    ok: boolean;
    profileId: string;
    subjectSlug: string;
    courseSlug?: string;
    topicId?: string;
    summary: {
        modules: number;
        topicsTotal: number;
        exercises: number;
        exerciseKinds: Record<string, number>;
        codeInputs: number;
        projects: number;
        capstones: number;
        thinFixedTestCount: number;
        blockers: number;
        errors: number;
        warnings: number;
        infos: number;
    };
    severityCounts: Record<CurriculumQualitySeverity, number>;
    issues: CurriculumQualityIssue[];
};

type TopicQualityInput = {
    seed: TopicSeed;
    draft?: TopicAuthoringDraft;
    topicBundle?: TopicBundleManifest;
};

function normalizeText(value: unknown): string {
    return String(value ?? "").trim();
}

function collapseText(value: string): string {
    return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(value: string): string[] {
    return collapseText(value)
        .split(/[^a-z0-9_]+/)
        .filter((token) => token.length >= 4);
}

function isCodeInputExercise(value: unknown): value is ManifestCodeInput {
    return Boolean(value) && typeof value === "object" && (value as { kind?: unknown }).kind === "code_input";
}

function countIssues(issues: CurriculumQualityIssue[]) {
    return issues.reduce(
        (acc, issue) => {
            acc[issue.severity] += 1;
            return acc;
        },
        { blocker: 0, error: 0, warning: 0, info: 0 } as Record<CurriculumQualitySeverity, number>,
    );
}

function flattenStarterFileText(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
        return value.map((item) => flattenStarterFileText(item)).join("\n");
    }
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        return Object.values(record)
            .map((child) => {
                if (typeof child === "string") return child;
                if (child && typeof child === "object") {
                    return String((child as { content?: unknown }).content ?? "");
                }
                return "";
            })
            .join("\n");
    }
    return "";
}

function topicLooksLikeFinalCapstone(topic: TopicQualityInput): boolean {
    const text = [
        topic.seed.topicId,
        topic.seed.title,
        topic.seed.summary,
        topic.seed.moduleProject,
        topic.draft?.title,
        topic.draft?.summary,
        topic.draft?.projectDraft?.title,
    ]
        .map((part) => String(part ?? "").toLowerCase())
        .join(" ");

    return /\b(final|capstone|project)\b/.test(text);
}

function topicPath(seed: TopicSeed): string {
    return `${seed.moduleSlug}/${seed.sectionSlug}/${seed.topicId}`;
}

function stripCodeComments(value: string): string {
    return value
        .split("\n")
        .map((line) =>
            line
                .replace(/#.*$/g, "")
                .replace(/\/\/.*$/g, "")
                .replace(/--.*$/g, ""),
        )
        .join("\n");
}

function normalizeCode(value: unknown): string {
    return stripCodeComments(String(value ?? ""))
        .replace(/\s+/g, "")
        .trim();
}

function countSubstantiveLines(value: unknown): number {
    return stripCodeComments(String(value ?? ""))
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean).length;
}

function containsLearningGoalLanguage(args: {
    seed: TopicSeed;
    draft?: TopicAuthoringDraft;
}): boolean {
    const learningGoals = args.seed.learningGoals ?? [];
    if (learningGoals.length === 0) return false;

    const exerciseText = collapseText(
        (args.draft?.quizDraft ?? [])
            .map((exercise) => `${exercise.title} ${exercise.prompt}`)
            .join(" "),
    );

    return learningGoals.some((goal) =>
        tokenize(goal).some((token) => exerciseText.includes(token)),
    );
}

function isSqlMutation(solutionCode: string): boolean {
    return /^(insert|update|delete|replace|create|drop|alter)\b/i.test(
        String(solutionCode ?? "").trim(),
    );
}

function addIssue(issues: CurriculumQualityIssue[], issue: CurriculumQualityIssue) {
    issues.push(issue);
}

export function buildCurriculumQualityReport(args: {
    profileId: string;
    subjectSlug: string;
    courseSlug?: string;
    topics: TopicQualityInput[];
    requireFinalCapstone?: boolean;
    minFixedTests?: number;
    spec?: CourseSpec | null;
}): CurriculumQualityReport {
    const profile = getCurriculumProfile(args.profileId);
    const supportsCodeInput = profileSupportsCodeInput(profile);
    const minFixedTests =
        profile.codeInput?.minimumFixedTests ?? args.minFixedTests ?? 2;
    const issues: CurriculumQualityIssue[] = [];
    const exerciseCountsByKind: Record<string, number> = {};
    let exercises = 0;
    let codeInputCount = 0;
    let projectCount = 0;
    let capstoneCount = 0;
    let thinFixedTestCount = 0;
    let hasFinalCapstone = false;
    const moduleIds = new Set<string>();

    for (const topic of args.topics) {
        moduleIds.add(topic.seed.moduleSlug);
        hasFinalCapstone = hasFinalCapstone || topicLooksLikeFinalCapstone(topic);
        const topicId = topic.seed.topicId;
        const draftExercises = topic.draft?.quizDraft ?? [];
        const bundleExercises = topic.topicBundle?.exercises ?? [];
        const path = topicPath(topic.seed);
        const repeatedThreshold =
            profile.qualityPolicy?.repeatedExerciseTextThreshold ?? 2;

        if ((topic.seed.learningGoals?.length ?? 0) === 0) {
            addIssue(issues, {
                code: "MISSING_TOPIC_LEARNING_GOALS",
                severity: "warning",
                path,
                profileId: profile.id,
                moduleId: topic.seed.moduleSlug,
                topicId,
                message: `Topic "${topicId}" has no learning goals on its seed metadata.`,
            });
        } else if (!containsLearningGoalLanguage({ seed: topic.seed, draft: topic.draft })) {
            addIssue(issues, {
                code: "LEARNING_GOAL_ALIGNMENT_WEAK",
                severity: "warning",
                path,
                profileId: profile.id,
                moduleId: topic.seed.moduleSlug,
                topicId,
                message: `Topic "${topicId}" exercises do not clearly reflect the topic learning goals.`,
            });
        }

        const repeatedTexts = new Map<string, string[]>();
        for (const exercise of draftExercises) {
            exercises += 1;
            exerciseCountsByKind[exercise.kind] = (exerciseCountsByKind[exercise.kind] ?? 0) + 1;

            if (!profile.allowedExerciseKinds.includes(exercise.kind)) {
                addIssue(issues, {
                    code: "UNSUPPORTED_EXERCISE_KIND",
                    severity: "blocker",
                    path,
                    profileId: profile.id,
                    moduleId: topic.seed.moduleSlug,
                    topicId,
                    exerciseId: exercise.id,
                    message: `Profile "${profile.id}" does not allow exercise kind "${exercise.kind}".`,
                });
            }

            const repeatedKey = collapseText(`${exercise.prompt} ${exercise.hint}`);
            if (repeatedKey.length > 24) {
                const ids = repeatedTexts.get(repeatedKey) ?? [];
                ids.push(exercise.id);
                repeatedTexts.set(repeatedKey, ids);
            }

            if (exercise.kind === "code_input") {
                codeInputCount += 1;

                if (!supportsCodeInput) {
                    addIssue(issues, {
                        code: "PROFILE_DOES_NOT_SUPPORT_CODE_INPUT",
                        severity: "blocker",
                        path,
                        profileId: profile.id,
                        moduleId: topic.seed.moduleSlug,
                        topicId,
                        exerciseId: exercise.id,
                        message: `Profile "${profile.id}" does not support code_input exercises.`,
                    });
                }

                if (
                    normalizeCode(exercise.starterCode) &&
                    normalizeCode(exercise.solutionCode) &&
                    normalizeCode(exercise.starterCode) === normalizeCode(exercise.solutionCode)
                ) {
                    addIssue(issues, {
                        code: "STARTER_REVEALS_SOLUTION",
                        severity: "blocker",
                        path,
                        profileId: profile.id,
                        moduleId: topic.seed.moduleSlug,
                        topicId,
                        exerciseId: exercise.id,
                        message: `Exercise "${exercise.id}" starterCode matches solutionCode.`,
                    });
                }

                if (
                    normalizeCode(exercise.starterCode) &&
                    normalizeCode(exercise.solutionCode) &&
                    countSubstantiveLines(exercise.solutionCode) > 1 &&
                    normalizeCode(exercise.solutionCode).includes(
                        normalizeCode(exercise.starterCode),
                    )
                ) {
                    addIssue(issues, {
                        code: "STARTER_MAY_REVEAL_SOLUTION_STRUCTURE",
                        severity: "warning",
                        path,
                        profileId: profile.id,
                        moduleId: topic.seed.moduleSlug,
                        topicId,
                        exerciseId: exercise.id,
                        message: `Exercise "${exercise.id}" starterCode appears to contain most of the final solution structure.`,
                    });
                }

                if ((exercise.recipeType ?? "") === "fixed_tests" && (exercise.tests?.length ?? 0) < minFixedTests) {
                    thinFixedTestCount += 1;
                    addIssue(issues, {
                        code: "THIN_FIXED_TEST_COVERAGE",
                        severity: "error",
                        path,
                        profileId: profile.id,
                        moduleId: topic.seed.moduleSlug,
                        topicId,
                        exerciseId: exercise.id,
                        message: `Exercise "${exercise.id}" has fewer than ${minFixedTests} fixed test cases.`,
                    });
                }
            }
        }

        for (const [text, ids] of repeatedTexts.entries()) {
            if (ids.length >= repeatedThreshold) {
                addIssue(issues, {
                    code: "REPEATED_EXERCISE_WORDING",
                    severity: "warning",
                    path,
                    profileId: profile.id,
                    moduleId: topic.seed.moduleSlug,
                    topicId,
                    message: `Repeated exercise prompt/hint wording appears in exercises: ${ids.join(", ")}.`,
                });
            }
        }

        for (const exercise of bundleExercises) {
            exerciseCountsByKind[exercise.kind] = exerciseCountsByKind[exercise.kind] ?? 0;
            if (!isCodeInputExercise(exercise)) continue;
            projectCount += exercise.purpose === "project" ? 1 : 0;
            capstoneCount += hasFinalCapstone && exercise.purpose === "project" ? 1 : 0;

            const expectedLanguage = profile.defaultLanguage;
            const expectedEntryFile = profile.defaultEntryFileName;
            const actualLanguage = exercise.language ?? exercise.workspace?.language;
            const runtimeKind = exercise.runtime?.kind ?? topic.topicBundle?.runtimeDefaults?.kind;

            if (!supportsCodeInput) {
                addIssue(issues, {
                    code: "CODE_INPUT_BUNDLE_FOR_CONCEPT_PROFILE",
                    severity: "blocker",
                    path,
                    profileId: profile.id,
                    moduleId: topic.seed.moduleSlug,
                    topicId,
                    exerciseId: exercise.id,
                    message: `Profile "${profile.id}" produced a code_input bundle exercise even though it has no codeInput capability.`,
                });
            }

            if (expectedLanguage && actualLanguage && actualLanguage !== expectedLanguage) {
                addIssue(issues, {
                    code: "WORKSPACE_LANGUAGE_LEAK",
                    severity: "blocker",
                    path,
                    profileId: profile.id,
                    moduleId: topic.seed.moduleSlug,
                    topicId,
                    exerciseId: exercise.id,
                    message: `Exercise "${exercise.id}" uses language "${actualLanguage}" but profile "${profile.id}" expects "${expectedLanguage}".`,
                });
            }

            if (profile.runtimeKind && runtimeKind && runtimeKind !== profile.runtimeKind) {
                addIssue(issues, {
                    code: "RUNTIME_KIND_LEAK",
                    severity: "blocker",
                    path,
                    profileId: profile.id,
                    moduleId: topic.seed.moduleSlug,
                    topicId,
                    exerciseId: exercise.id,
                    message: `Exercise "${exercise.id}" uses runtime kind "${runtimeKind}" but profile "${profile.id}" expects "${profile.runtimeKind}".`,
                });
            }

            const starterText = [
                exercise.workspace?.entryFile,
                exercise.workspace?.entryPath,
                exercise.workspace?.entryFilePath,
                exercise.workspace?.mainFile,
                exercise.workspace?.mainFilePath,
                ...(exercise.workspace?.openTabs ?? []),
                flattenStarterFileText(exercise.workspace?.starterFiles),
                flattenStarterFileText(exercise.starterFiles),
            ]
                .filter(Boolean)
                .join("\n");

            if (expectedEntryFile && starterText && !starterText.includes(expectedEntryFile)) {
                addIssue(issues, {
                    code: "EXPECTED_ENTRY_FILE_MISSING",
                    severity: "error",
                    path,
                    profileId: profile.id,
                    moduleId: topic.seed.moduleSlug,
                    topicId,
                    exerciseId: exercise.id,
                    message: `Exercise "${exercise.id}" workspace does not reference expected entry file "${expectedEntryFile}".`,
                });
            }

            if (
                expectedEntryFile &&
                exercise.workspace?.entryFilePath &&
                exercise.workspace.entryFilePath !== expectedEntryFile
            ) {
                addIssue(issues, {
                    code: "WORKSPACE_ENTRY_FILE_LEAK",
                    severity: "blocker",
                    path,
                    profileId: profile.id,
                    moduleId: topic.seed.moduleSlug,
                    topicId,
                    exerciseId: exercise.id,
                    message: `Exercise "${exercise.id}" uses workspace entry file "${exercise.workspace.entryFilePath}" but profile "${profile.id}" expects "${expectedEntryFile}".`,
                });
            }

            if (
                exercise.recipe.type === "sql_query" &&
                !normalizeText(exercise.recipe.datasetId)
            ) {
                addIssue(issues, {
                    code: "SQL_DATASET_ID_MISSING",
                    severity: "error",
                    path,
                    profileId: profile.id,
                    moduleId: topic.seed.moduleSlug,
                    topicId,
                    exerciseId: exercise.id,
                    message: `Exercise "${exercise.id}" emits sql_query without datasetId.`,
                });
            }

            if (
                exercise.recipe.type === "sql_query" &&
                isSqlMutation(exercise.recipe.solutionCode) &&
                !normalizeText(exercise.recipe.checkSql)
            ) {
                addIssue(issues, {
                    code: "SQL_MUTATION_CHECK_SQL_MISSING",
                    severity: "blocker",
                    path,
                    profileId: profile.id,
                    moduleId: topic.seed.moduleSlug,
                    topicId,
                    exerciseId: exercise.id,
                    message: `Exercise "${exercise.id}" emits a SQL mutation without checkSql.`,
                });
            }
        }
    }

    if (args.requireFinalCapstone && !hasFinalCapstone) {
        addIssue(issues, {
            code: "MISSING_FINAL_CAPSTONE",
            severity: "error",
            profileId: profile.id,
            message: "Course is configured to require a final capstone, but none was detected.",
        });
    }

    for (const rule of args.spec?.policy?.qualityPolicy?.reservedConceptsByModule ?? []) {
        const concept = collapseText(rule.concept);
        for (const topic of args.topics) {
            if (topic.seed.moduleOrder >= rule.earliestModuleNumber) continue;
            const text = collapseText(
                [
                    topic.seed.title,
                    topic.seed.summary,
                    ...(topic.seed.learningGoals ?? []),
                    topic.draft?.title,
                    topic.draft?.summary,
                ].join(" "),
            );
            if (!concept || !text.includes(concept)) continue;

            addIssue(issues, {
                code: "CONCEPT_INTRODUCED_TOO_EARLY",
                severity: "warning",
                path: topicPath(topic.seed),
                profileId: profile.id,
                moduleId: topic.seed.moduleSlug,
                topicId: topic.seed.topicId,
                message: `Concept "${rule.concept}" appears before module ${rule.earliestModuleNumber}.`,
            });
        }
    }

    const severityCounts = countIssues(issues);

    return {
        ok: severityCounts.blocker === 0 && severityCounts.error === 0,
        profileId: args.profileId,
        subjectSlug: args.subjectSlug,
        courseSlug: args.courseSlug,
        topicId: args.topics.length === 1 ? args.topics[0]?.seed.topicId : undefined,
        summary: {
            modules: moduleIds.size,
            topicsTotal: args.topics.length,
            exercises,
            exerciseKinds: exerciseCountsByKind,
            codeInputs: codeInputCount,
            projects: projectCount,
            capstones: capstoneCount,
            thinFixedTestCount,
            blockers: severityCounts.blocker,
            errors: severityCounts.error,
            warnings: severityCounts.warning,
            infos: severityCounts.info,
        },
        severityCounts,
        issues,
    };
}

export function assertCurriculumQualityReport(report: CurriculumQualityReport) {
    if (!report.ok) {
        const messages = report.issues
            .filter((issue) => issue.severity === "blocker" || issue.severity === "error")
            .map((issue) => `${issue.code}: ${issue.message}`)
            .join("\n");
        throw new Error(`Curriculum quality gate failed.\n${messages}`);
    }
}
