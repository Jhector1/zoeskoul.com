import type {
    CourseBlueprint,
    CourseSpec, ManifestRuntimeDefaults,
    PracticeConfig,
    PlannedModule,
    PlannedSection,
    PlannedTopic,
} from "@zoeskoul/curriculum-contracts";
import { getCurriculumProfile, getProfileAdapter } from "@zoeskoul/curriculum-profiles";
import { resolveExercisePolicy } from "../spec/resolveExercisePolicy.js";
import { planExerciseCounts } from "../policy/planExerciseCounts.js";
import {
    resolveModuleRuntimePolicy,
    runtimePolicyToTopicRuntimeDefaults,
} from "../spec/resolveModuleRuntimePolicy.js";
import {resolveWorkspacePolicy} from "../policy/resolveWorkspacePolicy.js";
import {workspaceToRuntimeDefaults} from "../policy/workspaceToRuntimeDefaults.js";
function findSpecModule(args: {
    spec?: CourseSpec | null;
    moduleSlug: string;
}) {
    return args.spec?.modules.find(
        (module) => module.moduleSlug === args.moduleSlug,
    );
}

function findSpecSection(args: {
    spec?: CourseSpec | null;
    moduleSlug: string;
    sectionSlug: string;
}) {
    const specModule = findSpecModule({
        spec: args.spec,
        moduleSlug: args.moduleSlug,
    });

    return specModule?.sections.find(
        (section) => section.sectionSlug === args.sectionSlug,
    );
}

function findSpecTopic(args: {
    spec?: CourseSpec | null;
    moduleSlug: string;
    sectionSlug: string;
    topicId: string;
}) {
    const specSection = findSpecSection({
        spec: args.spec,
        moduleSlug: args.moduleSlug,
        sectionSlug: args.sectionSlug,
    });

    return specSection?.topics.find((topic) => topic.topicId === args.topicId);
}
export function buildTopicSeedFromPlanNode(args: {
    blueprint: CourseBlueprint;
    spec?: CourseSpec | null;
    module: PlannedModule;
    section: PlannedSection;
    topic: PlannedTopic;
}) {
    const adapter = getProfileAdapter(args.blueprint.profileId);
    const profile = getCurriculumProfile(args.blueprint.profileId);
    const topicPolicy = args.spec?.topicPolicies?.[args.topic.topicId];
    const specModule = findSpecModule({
        spec: args.spec,
        moduleSlug: args.module.moduleSlug,
    });

    const specSection = findSpecSection({
        spec: args.spec,
        moduleSlug: args.module.moduleSlug,
        sectionSlug: args.section.sectionSlug,
    });

    const specTopic = findSpecTopic({
        spec: args.spec,
        moduleSlug: args.module.moduleSlug,
        sectionSlug: args.section.sectionSlug,
        topicId: args.topic.topicId,
    });
    const exercisePolicy = resolveExercisePolicy({
        blueprint: args.blueprint,
        spec: args.spec ?? null,
        moduleSlug: args.module.moduleSlug,
    });

    const sourceRuntimePolicy = resolveModuleRuntimePolicy({
        blueprint: args.blueprint,
        spec: args.spec ?? null,
        module: {
            moduleSlug: args.module.moduleSlug,
            order: args.module.order,
            runtimePolicy: args.module.runtimePolicy,
        },
    });

    const sourceRuntimeDefaults = runtimePolicyToTopicRuntimeDefaults({
        profileId: args.blueprint.profileId,
        runtimePolicy: sourceRuntimePolicy,
    });

    const adapterRuntimeDefaults =
        adapter.getTopicSeedRuntimeDefaults?.({
            blueprint: args.blueprint,
            module: {
                slug: args.module.moduleSlug,
                order: args.module.order,
            },
        }) ?? null;

    const moduleRuntimeDefaults =
        sourceRuntimeDefaults ?? adapterRuntimeDefaults ?? null;

    const baseSeed = adapter.buildTopicSeed({
        blueprint: args.blueprint,
        module: {
            slug: args.module.moduleSlug,
            prefix: args.module.prefix,
            title: args.module.title,
            order: args.module.order,
            purpose: args.module.purpose,
            learningObjectives:
                args.module.learningObjectives ?? args.topic.learningGoals ?? [],
            guidedExercises: args.module.guidedExercises ?? [],
            quizFocus: args.module.quizFocus ?? [],
            moduleProject: args.module.moduleProject,
            runtimeDefaults: moduleRuntimeDefaults,
            exercisePolicy,
            role: args.module.role,
        },
        section: {
            slug: args.section.sectionSlug,
            title: args.section.title,
            order: args.section.order,
            role: args.section.role,
        },
        topic: {
            topicId: args.topic.topicId,
            order: args.topic.order,
            title: args.topic.title,
            summary: args.topic.summary,
            minutes: args.topic.minutes,
            technical: args.topic.technical,
            practice: args.topic.practice,
        },
    });
    const workspacePolicy = resolveWorkspacePolicy({
        blueprint: args.blueprint,
        moduleNumber: args.module.order - 1,
        topicId: args.topic.topicId,
    });

    const workspaceRuntimeDefaults = workspaceToRuntimeDefaults({
        policy: workspacePolicy,
        profileId: args.blueprint.profileId,
    });

    const mergedRuntimeDefaults: ManifestRuntimeDefaults =
        workspaceRuntimeDefaults.kind === "sql" && moduleRuntimeDefaults?.kind === "sql"
            ? {
                ...workspaceRuntimeDefaults,
                datasetId: moduleRuntimeDefaults.datasetId,
                fixedSqlDialect: moduleRuntimeDefaults.fixedSqlDialect,
                resultShape: moduleRuntimeDefaults.resultShape,
            }
            : workspaceRuntimeDefaults;

    const policyTargets = args.spec?.policy?.exercisePolicy?.generationTargets ?? {};
    const topicTargets = topicPolicy?.generationTargets ?? {};
    const topicKind =
        args.module.role === "capstone" || args.section.role === "capstone"
            ? "capstone"
            : args.section.role === "module_project"
                ? "module_project"
                : null;
    const projectConfig =
        topicKind && profile.project
            ? profile.project.getProjectConfig({
                seed: baseSeed,
                topicKind,
            })
            : null;
    const defaultPractice = profile.practice;

    const generationTargets = {
        quizBankMin: topicTargets.quizBankMin ?? policyTargets.quizBankMin ?? 6,
        quizBankTarget: topicTargets.quizBankTarget ?? policyTargets.quizBankTarget ?? 8,
        quizVisibleDefault:
            topicTargets.quizVisibleDefault ?? policyTargets.quizVisibleDefault ?? 4,
        quizVisibleMax: topicTargets.quizVisibleMax ?? policyTargets.quizVisibleMax ?? 6,

        projectCodeInputMin:
            topicTargets.projectCodeInputMin ?? policyTargets.projectCodeInputMin ?? 3,
        projectCodeInputTarget:
            topicTargets.projectCodeInputTarget ??
            policyTargets.projectCodeInputTarget ??
            3,
        projectCodeInputMax:
            topicTargets.projectCodeInputMax ?? policyTargets.projectCodeInputMax ?? 5,

        maxAttempts: topicTargets.maxAttempts ?? policyTargets.maxAttempts ?? null,
    };

    if (topicKind && projectConfig) {
        generationTargets.quizBankMin = 0;
        generationTargets.quizBankTarget = 0;
        generationTargets.quizVisibleDefault = 0;
        generationTargets.quizVisibleMax = 0;

        if (typeof projectConfig.minStepCount === "number") {
            generationTargets.projectCodeInputMin = Math.max(
                generationTargets.projectCodeInputMin,
                projectConfig.minStepCount,
            );
        }

        if (typeof projectConfig.targetStepCount === "number") {
            generationTargets.projectCodeInputTarget = Math.max(
                generationTargets.projectCodeInputTarget,
                projectConfig.targetStepCount,
            );
        }

        generationTargets.projectCodeInputMax = Math.max(
            generationTargets.projectCodeInputMax,
            generationTargets.projectCodeInputTarget,
        );
    }

    const hasExplicitTopicCodeInputTargets =
        typeof topicTargets.projectCodeInputMin === "number" ||
        typeof topicTargets.projectCodeInputTarget === "number" ||
        typeof topicTargets.projectCodeInputMax === "number";

    if (
        args.blueprint.profileId === "python" &&
        args.topic.technical === false &&
        !hasExplicitTopicCodeInputTargets
    ) {
        generationTargets.projectCodeInputTarget = Math.min(
            generationTargets.projectCodeInputTarget,
            1,
        );
        generationTargets.projectCodeInputMax = Math.min(
            generationTargets.projectCodeInputMax,
            1,
        );
        generationTargets.projectCodeInputMin = Math.min(
            generationTargets.projectCodeInputMin,
            generationTargets.projectCodeInputTarget,
        );
    }

    const totalGeneratedExercises =
        generationTargets.quizBankTarget +
        generationTargets.projectCodeInputTarget;

    const plannedExerciseCounts = planExerciseCounts({
        policy: exercisePolicy,
        total: totalGeneratedExercises,
        constraints: {
            code_input: {
                min: generationTargets.projectCodeInputTarget,
                max: generationTargets.projectCodeInputTarget,
            },
        },
    });
    const inheritedPractice = mergePracticeDefaults(
        args.spec?.practiceDefaults,
        specModule?.practiceDefaults,
        args.module.practiceDefaults,
        specSection?.practiceDefaults,
        args.section.practiceDefaults,
    );

    const topicPractice = mergePracticeDefaults(
        specTopic?.practice,
        args.topic.practice,
    );

    const resolvedPractice = resolvePractice({
        inheritedPractice,
        topicPractice,
        defaultPractice,
        projectConfig,
    });

    return {
        ...baseSeed,

        // Resolved course-plan identity. These fields are the source of truth.
        subjectSlug: args.blueprint.subjectSlug,
        courseSlug: args.spec?.courseSlug ?? args.blueprint.courseSlug,
        profileId: args.blueprint.profileId,
        moduleSlug: args.module.moduleSlug,
        modulePrefix: args.module.prefix,
        moduleOrder: args.module.order,
        sectionSlug: args.section.sectionSlug,
        sectionOrder: args.section.order,
        topicId: args.topic.topicId,
        order: args.topic.order,
        title: args.topic.title,
        summary: args.topic.summary,
        minutes: args.topic.minutes,

        exercisePolicy,
        workspacePolicy,
        authoringPolicy: args.spec?.resolvedAuthoringPolicy,
        generationTargets,
        plannedExerciseCounts,
        moduleRuntimeDefaults: mergedRuntimeDefaults,
        moduleRole: args.module.role,
        sectionRole: args.section.role,
        practice: resolvedPractice,
    };
}

function mergePracticeDefaults(...values: Array<PracticeConfig | undefined>): PracticeConfig | undefined {
    const merged = values.reduce<PracticeConfig>(
        (acc, value) => ({
            ...acc,
            ...(value ?? {}),
        }),
        {},
    );

    return Object.keys(merged).length > 0 ? merged : undefined;
}

function resolvePractice(args: {
    inheritedPractice?: PracticeConfig;
    topicPractice?: PracticeConfig;
    defaultPractice?: {
        tryItDefault: {
            enabled?: boolean;
            placement?: "first_sketch" | "all_sketches" | "none";
            sketchIndex?: number;
        };
    } | null;
    projectConfig?: {
        tryItDefault?: {
            enabled?: boolean;
            placement?: "first_sketch" | "all_sketches" | "none";
            sketchIndex?: number;
        };
        projectFlowDefault?: "standalone" | "progressive";
    } | null;
}): PracticeConfig | undefined {
    const merged = {
        ...(args.inheritedPractice ?? {}),
        ...(args.topicPractice ?? {}),
    } as PracticeConfig;

    const tryItDefault = args.projectConfig?.tryItDefault ?? args.defaultPractice?.tryItDefault;
    const tryIt = merged.tryIt ?? tryItDefault?.enabled;
    const placement =
        merged.tryItPlacement ?? (tryIt === true ? tryItDefault?.placement ?? "first_sketch" : undefined);
    const effectiveTryIt = placement === "none" ? false : tryIt;
    const tryItSketchIndex =
        effectiveTryIt === true || typeof merged.tryItSketchIndex === "number"
            ? merged.tryItSketchIndex ?? tryItDefault?.sketchIndex ?? 0
            : undefined;
    const projectFlow = merged.projectFlow ?? args.projectConfig?.projectFlowDefault;

    const resolved: PracticeConfig = {
        ...merged,
        ...(typeof effectiveTryIt === "boolean" ? { tryIt: effectiveTryIt } : {}),
        ...(placement ? { tryItPlacement: placement } : {}),
        ...(typeof tryItSketchIndex === "number" ? { tryItSketchIndex } : {}),
        ...(projectFlow ? { projectFlow } : {}),
    };

    return Object.keys(resolved).length > 0 ? resolved : undefined;
}
