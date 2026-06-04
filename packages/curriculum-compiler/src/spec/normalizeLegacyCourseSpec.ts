import type {
    CourseSpec,
    CourseSpecModule,
    CourseSpecTopic,
    ExerciseKindMix,
} from "@zoeskoul/curriculum-contracts";
import { getCurriculumProfile } from "@zoeskoul/curriculum-profiles";

function cleanString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function cleanCourseDescription(input: any): string | undefined {
    return (
        cleanString(input.description) ??
        cleanString(input.courseOverview?.summary) ??
        cleanString(input.subtitle)
    );
}
function cleanStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;

    const items = value
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean);

    return items.length ? items : undefined;
}

function cleanNumberOrNull(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeModuleRuntimePolicy(args: {
    profileId: string;
    moduleNumber: number;
    rawModuleRuntimePolicy: any;
    rawGlobalRuntimePolicy: any;
}) {
    const profile = getCurriculumProfile(args.profileId);
    const profileRuntimeDefaults = profile.buildModuleRuntimeDefaults(args.moduleNumber + 1);
    const profileSqlDefaults =
        profileRuntimeDefaults?.kind === "sql" ? profileRuntimeDefaults : null;

    const moduleRuntime =
        args.rawModuleRuntimePolicy && typeof args.rawModuleRuntimePolicy === "object"
            ? args.rawModuleRuntimePolicy
            : undefined;

    const globalRuntime =
        args.rawGlobalRuntimePolicy && typeof args.rawGlobalRuntimePolicy === "object"
            ? args.rawGlobalRuntimePolicy
            : undefined;

    const sqlDialect =
        typeof moduleRuntime?.sqlDialect === "string"
            ? moduleRuntime.sqlDialect.trim()
            : typeof globalRuntime?.sqlDialect === "string"
                ? globalRuntime.sqlDialect.trim()
                : profileSqlDefaults?.fixedSqlDialect;

    const datasetStrategy =
        moduleRuntime?.datasetStrategy ??
        globalRuntime?.datasetStrategy ??
        (profile.runtimeKind === "sql" ? "module_based" : undefined);

    const preferredDatasetId =
        typeof moduleRuntime?.preferredDatasetId === "string"
            ? moduleRuntime.preferredDatasetId.trim()
            : typeof globalRuntime?.preferredDatasetId === "string"
                ? globalRuntime.preferredDatasetId.trim()
                : undefined;

    const datasetId =
        typeof moduleRuntime?.datasetId === "string" && moduleRuntime.datasetId.trim()
            ? moduleRuntime.datasetId.trim()
            : typeof globalRuntime?.datasetId === "string" && globalRuntime.datasetId.trim()
                ? globalRuntime.datasetId.trim()
                : profile.runtimeKind === "sql" && datasetStrategy === "module_based"
                    ? profileSqlDefaults?.datasetId
                    : preferredDatasetId;

    const resultShape =
        typeof moduleRuntime?.resultShape === "string"
            ? moduleRuntime.resultShape.trim()
            : typeof globalRuntime?.resultShape === "string"
                ? globalRuntime.resultShape.trim()
                : profileSqlDefaults?.resultShape;

    if (!sqlDialect && !datasetStrategy && !datasetId && !preferredDatasetId && !resultShape) {
        return undefined;
    }

    return {
        sqlDialect,
        datasetStrategy,
        datasetId,
        preferredDatasetId,
        resultShape,
    };
}

function slugify(input: string) {
    return String(input ?? "")
        .trim()
        .toLowerCase()
        .replace(/['"]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function defaultSqlMix(): ExerciseKindMix {
    return {
        single_choice: 0.08,
        multi_choice: 0.08,
        drag_reorder: 0.08,
        fill_blank_choice: 0.16,
        code_input: 0.6,
    };
}

function conceptualSqlMix(): ExerciseKindMix {
    return {
        single_choice: 0.24,
        multi_choice: 0.22,
        drag_reorder: 0.14,
        fill_blank_choice: 0.2,
        code_input: 0.2,
    };
}

function technicalSqlMix(): ExerciseKindMix {
    return {
        single_choice: 0.05,
        multi_choice: 0.08,
        drag_reorder: 0.07,
        fill_blank_choice: 0.15,
        code_input: 0.65,
    };
}

function balancedSqlMix(): ExerciseKindMix {
    return {
        single_choice: 0.12,
        multi_choice: 0.12,
        drag_reorder: 0.08,
        fill_blank_choice: 0.18,
        code_input: 0.5,
    };
}

function pickModuleMix(moduleNumber: number): ExerciseKindMix {
    if (moduleNumber === 0 || moduleNumber === 14) return conceptualSqlMix();

    if ([2, 6, 7, 8, 10, 11, 12, 13, 15].includes(moduleNumber)) {
        return technicalSqlMix();
    }

    return balancedSqlMix();
}

const OVERLOADED_PROJECT_MARKERS = [
    "Assessment and Delivery Notes",
    "Suggested beginner rhythm",
    "Recommended Course Deliverables",
    "Module-to-Module Milestones",
    "Sample Pacing Options",
    "Tooling Suggestions",
    "Closing Note",
];

function cleanModuleProject(value: unknown): string | undefined {
    const text = String(value ?? "").trim();
    if (!text) return undefined;

    let cut = text.length;

    for (const marker of OVERLOADED_PROJECT_MARKERS) {
        const idx = text.indexOf(marker);
        if (idx >= 0 && idx < cut) cut = idx;
    }

    return text.slice(0, cut).trim() || undefined;
}

function normalizeReleasePlan(raw: any, moduleNumbers: number[]) {
    const current = raw?.currentRelease;
    const releases = Array.isArray(raw?.releases) ? raw.releases : [];
    const startModuleNumber = moduleNumbers.length ? Math.min(...moduleNumbers) : 0;
    const endModuleNumber = moduleNumbers.length ? Math.max(...moduleNumbers) : 0;

    const normalizedCurrent =
        current &&
        typeof current.startModuleNumber === "number" &&
        typeof current.endModuleNumber === "number"
            ? {
                name:
                    typeof current.name === "string" && current.name.trim()
                        ? current.name.trim()
                        : "current",
                startModuleNumber: current.startModuleNumber,
                endModuleNumber: current.endModuleNumber,
            }
            : {
                name: "current",
                startModuleNumber,
                endModuleNumber,
            };

    const normalizedReleases =
        releases.length > 0
            ? releases
                .filter(
                    (r: any) =>
                        typeof r?.startModuleNumber === "number" &&
                        typeof r?.endModuleNumber === "number",
                )
                .map((r: any) => ({
                    name:
                        typeof r.name === "string" && r.name.trim()
                            ? r.name.trim()
                            : "release",
                    startModuleNumber: r.startModuleNumber,
                    endModuleNumber: r.endModuleNumber,
                }))
            : [normalizedCurrent];

    return {
        currentRelease: normalizedCurrent,
        releases: normalizedReleases,
    };
}

function normalizeTopicId(args: {
    topic: any;
    moduleNumber: number;
    sectionNumber?: string;
    topicIndex: number;
    used: Set<string>;
}) {
    let base =
        typeof args.topic === "string"
            ? args.topic.trim()
            : String(args.topic?.topicId ?? "").trim();

    if (!base) {
        const titleSlug = slugify(args.topic?.title ?? "");
        const sectionSlug = slugify(args.sectionNumber ?? "");

        base =
            titleSlug ||
            `m${args.moduleNumber}-${sectionSlug || "section"}-topic-${args.topicIndex + 1}`;
    }

    let candidate = base;
    let counter = 2;

    while (args.used.has(candidate)) {
        candidate = `${base}-${counter}`;
        counter += 1;
    }

    args.used.add(candidate);
    return candidate;
}

function normalizeTopic(
    topic: any,
    moduleNumber: number,
    sectionNumber: string | undefined,
    topicIndex: number,
    used: Set<string>,
): CourseSpecTopic {
    const topicTitle =
        typeof topic === "string" ? topic.replace(/[_-]+/g, " ") : topic?.title;

    return {
        topicNumber: cleanString(topic?.topicNumber),
        topicId: normalizeTopicId({
            topic,
            moduleNumber,
            sectionNumber,
            topicIndex,
            used,
        }),
        title: String(topicTitle ?? "").trim(),
        summary: cleanString(topic?.summary),
        minutes:
            typeof topic?.minutes === "number" && Number.isFinite(topic.minutes)
                ? topic.minutes
                : 15,
        difficulty: topic?.difficulty ?? "beginner",
        technical: typeof topic?.technical === "boolean" ? topic.technical : moduleNumber >= 1,
        tags: Array.isArray(topic?.tags)
            ? topic.tags.filter((x: unknown): x is string => typeof x === "string")
            : [],
        learningGoals: cleanStringArray(topic?.learningGoals),
        practice:
            topic?.practice && typeof topic.practice === "object"
                ? {
                    ...(typeof topic.practice.tryIt === "boolean"
                        ? { tryIt: topic.practice.tryIt }
                        : {}),
                    ...(cleanString(topic.practice.tryItExerciseId)
                        ? { tryItExerciseId: cleanString(topic.practice.tryItExerciseId) }
                        : {}),
                    ...(typeof topic.practice.tryItSketchIndex === "number" &&
                        Number.isFinite(topic.practice.tryItSketchIndex)
                        ? { tryItSketchIndex: topic.practice.tryItSketchIndex }
                        : {}),
                    ...(topic.practice.projectFlow === "progressive" ||
                        topic.practice.projectFlow === "standalone"
                        ? { projectFlow: topic.practice.projectFlow }
                        : {}),
                }
                : undefined,
    };
}

function normalizeModule(
    module: any,
    usedTopicIds: Set<string>,
    profileId: string,
    globalRuntimePolicy: any,
): CourseSpecModule {
    const moduleNumber =
        typeof module?.moduleNumber === "number" && Number.isFinite(module.moduleNumber)
            ? module.moduleNumber
            : 0;

    const sections = Array.isArray(module?.sections) ? module.sections : [];

    const normalizedSections = sections.map((section: any, sectionIndex: number) => {
        const topics = Array.isArray(section?.topics) ? section.topics : [];

        return {
            sectionNumber:
                typeof section?.sectionNumber === "string"
                    ? section.sectionNumber
                    : undefined,
            sectionSlug:
                typeof section?.sectionSlug === "string" && section.sectionSlug.trim()
                    ? section.sectionSlug.trim()
                    : `section-${moduleNumber}-${sectionIndex + 1}`,
            order:
                typeof section?.order === "number" && Number.isFinite(section.order)
                    ? section.order
                    : sectionIndex + 1,
            title: String(section?.title ?? "").trim(),
            description: cleanString(section?.description),
            role:
                section?.role === "module_project" || section?.role === "capstone"
                    ? section.role
                    : section?.role === "lesson"
                        ? "lesson"
                        : undefined,

            weekStart: cleanNumberOrNull(section?.weekStart),
            weekEnd: cleanNumberOrNull(section?.weekEnd),
            weeksLabel: cleanString(section?.weeksLabel) ?? null,

            bullets: cleanStringArray(section?.bullets),

            topics: topics.map((topic: any, topicIndex: number) =>
                normalizeTopic(
                    topic,
                    moduleNumber,
                    typeof section?.sectionNumber === "string"
                        ? section.sectionNumber
                        : undefined,
                    topicIndex,
                    usedTopicIds,
                ),
            ),
        };
    });

    const actualTopicCount = normalizedSections.reduce(
        (sum: number, section: any) => sum + section.topics.length,
        0,
    );

    return {
        moduleNumber,
        moduleSlug: String(module?.moduleSlug ?? "").trim(),
        prefix: cleanString(module?.prefix),
        role:
            module?.role === "capstone"
                ? "capstone"
                : module?.role === "standard"
                    ? "standard"
                    : undefined,
        accessOverride:
            module?.accessOverride === "free" || module?.accessOverride === "paid"
                ? module.accessOverride
                : null,

        order:
            typeof module?.order === "number" && Number.isFinite(module.order)
                ? module.order
                : moduleNumber + 1,
        title: String(module?.title ?? "").trim(),
        description: cleanString(module?.description),
        purpose: cleanString(module?.purpose),
        learningObjectives: cleanStringArray(module?.learningObjectives) ?? [],
        guidedExercises: cleanStringArray(module?.guidedExercises) ?? [],
        quizFocus: cleanStringArray(module?.quizFocus) ?? [],
        moduleProject: cleanModuleProject(module?.moduleProject),

        weekStart: cleanNumberOrNull(module?.weekStart),
        weekEnd: cleanNumberOrNull(module?.weekEnd),

        sectionCount:
            typeof module?.sectionCount === "number" && Number.isFinite(module.sectionCount)
                ? module.sectionCount
                : normalizedSections.length,
        topicCount:
            typeof module?.topicCount === "number" && Number.isFinite(module.topicCount)
                ? module.topicCount
                : actualTopicCount,
        recommendedPacing: cleanString(module?.recommendedPacing),
        typicalOutcome: cleanString(module?.typicalOutcome),
        exercisePolicy:
            module?.exercisePolicy && typeof module.exercisePolicy === "object"
                ? module.exercisePolicy
                : {
                    mix: pickModuleMix(moduleNumber),
                },
        runtimePolicy: normalizeModuleRuntimePolicy({
            profileId,
            moduleNumber,
            rawModuleRuntimePolicy: module?.runtimePolicy,
            rawGlobalRuntimePolicy: globalRuntimePolicy,
        }),
        sections: normalizedSections,
    };
}

export function normalizeLegacyCourseSpec(raw: unknown): CourseSpec {
    const input = (raw ?? {}) as any;
    const usedTopicIds = new Set<string>();

    const modules = Array.isArray(input.modules) ? input.modules : [];
    const profileId = String(input.profileId ?? "").trim();

    const globalRuntimePolicy =
        input.policy?.runtimePolicy && typeof input.policy.runtimePolicy === "object"
            ? input.policy.runtimePolicy
            : undefined;

    const normalizedModules: CourseSpecModule[] = modules.map((module: any) =>
        normalizeModule(module, usedTopicIds, profileId, globalRuntimePolicy),
    );

    return {
        authoringFormatVersion:
            typeof input.authoringFormatVersion === "string"
                ? input.authoringFormatVersion
                : "2.0",
        subjectSlug: String(input.subjectSlug ?? "").trim(),
        courseSlug: String(input.courseSlug ?? "").trim(),
        catalogSlug: String(input.catalogSlug ?? "").trim(),
        accessPolicy:
            input.accessPolicy === "free" || input.accessPolicy === "paid"
                ? input.accessPolicy
                : undefined,
        moduleAccessOverrideDefault:
            input.moduleAccessOverrideDefault === "free" ||
            input.moduleAccessOverrideDefault === "paid"
                ? input.moduleAccessOverrideDefault
                : null,
        profileId,
        sourceLocale: cleanString(input.sourceLocale) ?? "en",
        targetLocales: Array.isArray(input.targetLocales)
            ? input.targetLocales.filter((x: unknown): x is string => typeof x === "string")
            : [],
        title: String(input.title ?? "").trim(),
        description: cleanCourseDescription(input),

        trackSlug: cleanString(input.trackSlug),
        courseNumber:
            typeof input.courseNumber === "number" && Number.isFinite(input.courseNumber)
                ? input.courseNumber
                : undefined,
        status: cleanString(input.status) as any,
        subtitle: cleanString(input.subtitle),
        prerequisites: cleanStringArray(input.prerequisites),
        recommendedPrerequisites: cleanStringArray(input.recommendedPrerequisites),
        moduleRange:
            input.moduleRange && typeof input.moduleRange === "object"
                ? input.moduleRange
                : undefined,
        versioning:
            input.versioning && typeof input.versioning === "object"
                ? input.versioning
                : undefined,
        validationPolicy:
            input.validationPolicy && typeof input.validationPolicy === "object"
                ? input.validationPolicy
                : undefined,
        intendedFor: Array.isArray(input.intendedFor)
            ? cleanStringArray(input.intendedFor)
            : cleanString(input.intendedFor),
        courseOverview: {
            recommendedSequence: cleanString(input.courseOverview?.recommendedSequence),
            summary: cleanString(input.courseOverview?.summary),
            moduleSummary: Array.isArray(input.courseOverview?.moduleSummary)
                ? input.courseOverview.moduleSummary
                : [],
        },
        releasePlan: normalizeReleasePlan(
            input.releasePlan,
            normalizedModules.map((module) => module.moduleNumber),
        ),
        policy:
            input.policy && typeof input.policy === "object"
                ? input.policy
                : {
                    exercisePolicy: {
                        defaultMix: defaultSqlMix(),
                        minimums: {
                            technicalTopicCodeInputMin: 1,
                            topicExerciseMin: 4,
                        },
                    },
                    projectPolicy: {
                        minProjectsBeforeCapstone: 3,
                        capstoneRequired: true,
                    },
                    runtimePolicy: {
                        sqlDialect: "sqlite",
                        datasetStrategy: "module_based",
                        resultShape: "table",
                    },
                    qualityPolicy: {
                        allowBlankTopicIds: false,
                        allowDuplicateTopicIds: false,
                        requireUniqueModuleSlugs: true,
                        requireUniqueSectionSlugs: true,
                        requireModuleProject: true,
                        maxModuleProjectLength: 320,
                    },
                },
        authoringGuidance: cleanStringArray(input.authoringGuidance) ?? [],
        modules: normalizedModules,
        assessmentAndDelivery:
            input.assessmentAndDelivery && typeof input.assessmentAndDelivery === "object"
                ? {
                    suggestedBeginnerRhythm: cleanString(
                        input.assessmentAndDelivery.suggestedBeginnerRhythm,
                    ),
                    recommendedCourseDeliverables:
                        cleanStringArray(
                            input.assessmentAndDelivery.recommendedCourseDeliverables,
                        ) ?? [],
                    samplePacingOptions:
                        input.assessmentAndDelivery.samplePacingOptions &&
                        typeof input.assessmentAndDelivery.samplePacingOptions === "object"
                            ? input.assessmentAndDelivery.samplePacingOptions
                            : {},
                    toolingSuggestions:
                        cleanStringArray(input.assessmentAndDelivery.toolingSuggestions) ?? [],
                    closingNote: cleanString(input.assessmentAndDelivery.closingNote),
                    moduleMilestones: Array.isArray(
                        input.assessmentAndDelivery.moduleMilestones,
                    )
                        ? input.assessmentAndDelivery.moduleMilestones.filter(
                            (x: unknown) => typeof x === "object" && x !== null,
                        )
                        : [],
                }
                : undefined,
        workspaceProfileId: cleanString(input.workspaceProfileId),
        workspacePolicyId: cleanString(input.workspacePolicyId),
        workspaceOverrides:
            input.workspaceOverrides && typeof input.workspaceOverrides === "object"
                ? input.workspaceOverrides
                : undefined,
        courseGenerationPolicy:
            input.courseGenerationPolicy && typeof input.courseGenerationPolicy === "object"
                ? input.courseGenerationPolicy
                : undefined,
        modulePolicies: Array.isArray(input.modulePolicies) ? input.modulePolicies : undefined,
        topicPolicies:
            input.topicPolicies && typeof input.topicPolicies === "object"
                ? input.topicPolicies
                : undefined,
    };
}
