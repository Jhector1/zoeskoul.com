
import type {
    CourseSpec,
    CourseSpecModule,
    CourseSpecTopic,
    ExerciseKindMix,
} from "@zoeskoul/curriculum-contracts";
import {getSqlModuleDatasetPolicy} from "@zoeskoul/curriculum-profiles";


function normalizeModuleRuntimePolicy(args: {
    profileId: string;
    moduleNumber: number;
    rawModuleRuntimePolicy: any;
    rawGlobalRuntimePolicy: any;
}) {
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
                : args.profileId === "sql"
                    ? "sqlite"
                    : undefined;

    const datasetStrategy =
        moduleRuntime?.datasetStrategy ??
        globalRuntime?.datasetStrategy ??
        (args.profileId === "sql" ? "module_based" : undefined);

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
                : args.profileId === "sql" && datasetStrategy === "module_based"
                    ? getSqlModuleDatasetPolicy(args.moduleNumber).datasetId
                    : preferredDatasetId;

    const resultShape =
        typeof moduleRuntime?.resultShape === "string"
            ? moduleRuntime.resultShape.trim()
            : typeof globalRuntime?.resultShape === "string"
                ? globalRuntime.resultShape.trim()
                : args.profileId === "sql"
                    ? "table"
                    : undefined;

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

function normalizeReleasePlan(raw: any) {
    const current = raw?.currentRelease;
    const releases = Array.isArray(raw?.releases) ? raw.releases : [];

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
                startModuleNumber: 0,
                endModuleNumber: 8,
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
    let base = String(args.topic?.topicId ?? "").trim();

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
    return {
        topicNumber:
            typeof topic?.topicNumber === "string" ? topic.topicNumber : undefined,
        topicId: normalizeTopicId({
            topic,
            moduleNumber,
            sectionNumber,
            topicIndex,
            used,
        }),
        title: String(topic?.title ?? "").trim(),
        summary:
            typeof topic?.summary === "string" ? topic.summary.trim() : undefined,
        minutes:
            typeof topic?.minutes === "number" && Number.isFinite(topic.minutes)
                ? topic.minutes
                : 15,
        difficulty: "beginner",
        technical: moduleNumber >= 1,
        tags: [],
        learningGoals:
            Array.isArray(topic?.learningGoals)
                ? topic.learningGoals.filter((x: unknown) => typeof x === "string")
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
        typeof module?.moduleNumber === "number" ? module.moduleNumber : 0;

    const sections = Array.isArray(module?.sections) ? module.sections : [];
    const normalizedSections = sections.map((section: any) => {
        const topics = Array.isArray(section?.topics) ? section.topics : [];
        return {
            sectionNumber:
                typeof section?.sectionNumber === "string"
                    ? section.sectionNumber
                    : undefined,
            sectionSlug: String(section?.sectionSlug ?? "").trim(),
            title: String(section?.title ?? "").trim(),
            description:
                typeof section?.description === "string"
                    ? section.description.trim()
                    : undefined,
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
        order: moduleNumber + 1,
        title: String(module?.title ?? "").trim(),
        description:
            typeof module?.description === "string" ? module.description.trim() : undefined,
        purpose: typeof module?.purpose === "string" ? module.purpose.trim() : undefined,
        learningObjectives: Array.isArray(module?.learningObjectives)
            ? module.learningObjectives.filter((x: unknown) => typeof x === "string")
            : [],
        guidedExercises: Array.isArray(module?.guidedExercises)
            ? module.guidedExercises.filter((x: unknown) => typeof x === "string")
            : [],
        quizFocus: Array.isArray(module?.quizFocus)
            ? module.quizFocus.filter((x: unknown) => typeof x === "string")
            : [],
        moduleProject: cleanModuleProject(module?.moduleProject),
        sectionCount:
            typeof module?.sectionCount === "number"
                ? module.sectionCount
                : normalizedSections.length,
        topicCount:
            typeof module?.topicCount === "number"
                ? module.topicCount
                : actualTopicCount,
        recommendedPacing:
            typeof module?.recommendedPacing === "string"
                ? module.recommendedPacing.trim()
                : undefined,
        typicalOutcome:
            typeof module?.typicalOutcome === "string"
                ? module.typicalOutcome.trim()
                : undefined,
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

    const normalizedModules = modules.map((module: any) =>
        normalizeModule(module, usedTopicIds, profileId, globalRuntimePolicy),
    );

    return {
        authoringFormatVersion:
            typeof input.authoringFormatVersion === "string"
                ? input.authoringFormatVersion
                : "2.0",
        subjectSlug: String(input.subjectSlug ?? "").trim(),
        profileId: String(input.profileId ?? "").trim(),
        title: String(input.title ?? "").trim(),
        subtitle:
            typeof input.subtitle === "string" ? input.subtitle.trim() : undefined,
        intendedFor:
            typeof input.intendedFor === "string"
                ? input.intendedFor.trim()
                : undefined,
        courseOverview: {
            recommendedSequence:
                typeof input.courseOverview?.recommendedSequence === "string"
                    ? input.courseOverview.recommendedSequence.trim()
                    : undefined,
            summary:
                typeof input.courseOverview?.summary === "string"
                    ? input.courseOverview.summary.trim()
                    : undefined,
            moduleSummary: Array.isArray(input.courseOverview?.moduleSummary)
                ? input.courseOverview.moduleSummary
                : [],
        },
        releasePlan: normalizeReleasePlan(input.releasePlan),
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
        authoringGuidance: Array.isArray(input.authoringGuidance)
            ? input.authoringGuidance.filter((x: unknown) => typeof x === "string")
            : [],
        modules: normalizedModules,
        assessmentAndDelivery:
            input.assessmentAndDelivery && typeof input.assessmentAndDelivery === "object"
                ? {
                    suggestedBeginnerRhythm:
                        typeof input.assessmentAndDelivery.suggestedBeginnerRhythm ===
                        "string"
                            ? input.assessmentAndDelivery.suggestedBeginnerRhythm.trim()
                            : undefined,
                    recommendedCourseDeliverables: Array.isArray(
                        input.assessmentAndDelivery.recommendedCourseDeliverables,
                    )
                        ? input.assessmentAndDelivery.recommendedCourseDeliverables.filter(
                            (x: unknown) => typeof x === "string",
                        )
                        : [],
                    samplePacingOptions:
                        input.assessmentAndDelivery.samplePacingOptions &&
                        typeof input.assessmentAndDelivery.samplePacingOptions === "object"
                            ? input.assessmentAndDelivery.samplePacingOptions
                            : {},
                    toolingSuggestions: Array.isArray(
                        input.assessmentAndDelivery.toolingSuggestions,
                    )
                        ? input.assessmentAndDelivery.toolingSuggestions.filter(
                            (x: unknown) => typeof x === "string",
                        )
                        : [],
                    closingNote:
                        typeof input.assessmentAndDelivery.closingNote === "string"
                            ? input.assessmentAndDelivery.closingNote.trim()
                            : undefined,
                    moduleMilestones: Array.isArray(
                        input.assessmentAndDelivery.moduleMilestones,
                    )
                        ? input.assessmentAndDelivery.moduleMilestones.filter(
                            (x: unknown) => typeof x === "object" && x !== null,
                        )
                        : [],
                }
                : undefined,
    };
}