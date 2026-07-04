import type {
    CourseBlueprint,
    CourseSpec, ManifestRuntimeDefaults, ManifestIdeServiceConfig,
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
import { workspaceToServiceDefaults } from "../policy/workspaceToServiceDefaults.js";
import { mergeManifestIdeServiceConfigs } from "@zoeskoul/curriculum-contracts";


type CodeInputTargetOverrides = {
    projectCodeInputMin?: number;
    projectCodeInputTarget?: number;
    projectCodeInputMax?: number;
};

function hasExplicitCodeInputTargetOverrides(targets: CodeInputTargetOverrides | undefined): boolean {
    return (
        typeof targets?.projectCodeInputMin === "number" ||
        typeof targets?.projectCodeInputTarget === "number" ||
        typeof targets?.projectCodeInputMax === "number"
    );
}

function hasBooleanOverride(...values: Array<boolean | undefined>) {
    return values.find((value) => typeof value === "boolean");
}

function normalizeConceptText(value: unknown): string {
    return String(value ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function isConceptualOnlyTopic(args: {
    topic: PlannedTopic;
    section: PlannedSection;
    topicPolicy?: { teachingMode?: string; conceptualOnly?: boolean };
    topicPractice?: PracticeConfig;
    inheritedPractice?: PracticeConfig;
    authoringPolicyConceptualSignals?: string[];
}): boolean {
    const explicitConceptualOnly = hasBooleanOverride(
        args.topicPractice?.conceptualOnly,
        args.topicPolicy?.conceptualOnly,
        args.inheritedPractice?.conceptualOnly,
    );

    if (explicitConceptualOnly === true) return true;
    if (explicitConceptualOnly === false) return false;
    if (args.topicPolicy?.teachingMode === "conceptual-only") return true;
    if (args.topic.technical === false) return true;

    if (args.section.role === "module_project" || args.section.role === "capstone") {
        return false;
    }

    const text = normalizeConceptText(
        `${args.topic.topicId} ${args.topic.title} ${args.topic.summary ?? ""}`,
    );
    const defaultSignals = [
        "what is",
        "orientation",
        "introduction",
        "overview",
        "course map",
        "tour",
    ];
    const configuredSignals = (args.authoringPolicyConceptualSignals ?? [])
        .map((signal) => normalizeConceptText(signal))
        .filter(Boolean);
    const conceptualSignals = configuredSignals.length > 0
        ? configuredSignals
        : defaultSignals;

    return (
        /^what .* is\b/.test(text) ||
        conceptualSignals.some((signal) => text.includes(signal))
    );
}

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
    const authoringPolicy = args.spec?.resolvedAuthoringPolicy;
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
    const logicalModuleNumber =
        typeof args.module.moduleNumber === "number" && Number.isFinite(args.module.moduleNumber)
            ? args.module.moduleNumber
            : args.module.order - 1;

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

    const adapterServiceDefaults =
        adapter.getTopicSeedServiceDefaults?.({
            blueprint: args.blueprint,
            module: {
                slug: args.module.moduleSlug,
                order: args.module.order,
            },
        }) ?? null;

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
            serviceDefaults: null,
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
        moduleNumber: logicalModuleNumber,
        topicId: args.topic.topicId,
    });

    const workspaceRuntimeDefaults = workspaceToRuntimeDefaults({
        policy: workspacePolicy,
        profileId: args.blueprint.profileId,
    });

    const workspaceServiceDefaults = workspaceToServiceDefaults({
        policy: workspacePolicy,
    });

    const mergedServiceDefaults: ManifestIdeServiceConfig | null =
        mergeManifestIdeServiceConfigs(
            args.blueprint.idePolicy?.defaultServices,
            args.blueprint.idePolicy?.moduleServiceDefaults?.[args.module.moduleSlug],
            adapterServiceDefaults,
            workspaceServiceDefaults,
        );

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
    const preferredTryItExerciseKind = defaultPractice?.preferredTryItExerciseKind;
    const supportsPractice = preferredTryItExerciseKind
        ? profile.allowedExerciseKinds.includes(preferredTryItExerciseKind)
        : profile.allowedExerciseKinds.length > 0;
    const policyPracticeDefaults = authoringPolicy?.practiceDefaults;

    const inheritedPractice = mergePracticeDefaults(
        policyPracticeDefaults,
        args.spec?.practiceDefaults,
        specModule?.practiceDefaults,
        args.module.practiceDefaults,
        specSection?.practiceDefaults,
        args.section.practiceDefaults,
    );

    const topicPractice = mergePracticeDefaults(
        specTopic?.practice,
        args.topic.practice,
        topicPolicy
            ? {
                ...(typeof topicPolicy.conceptualOnly === "boolean"
                    ? { conceptualOnly: topicPolicy.conceptualOnly }
                    : {}),
                ...(typeof topicPolicy.requiresTryIt === "boolean"
                    ? { requiresTryIt: topicPolicy.requiresTryIt }
                    : {}),
                ...(topicPolicy.runtimeMode
                    ? { runtimeMode: topicPolicy.runtimeMode }
                    : {}),
                ...(Array.isArray(topicPolicy.expectedPracticeKinds)
                    ? { expectedPracticeKinds: topicPolicy.expectedPracticeKinds }
                    : {}),
                ...(topicPolicy.terminalSessionScope
                    ? { terminalSessionScope: topicPolicy.terminalSessionScope }
                    : {}),
            }
            : undefined,
    );

    const conceptualOnly = isConceptualOnlyTopic({
        topic: args.topic,
        section: args.section,
        topicPolicy,
        topicPractice,
        inheritedPractice,
        authoringPolicyConceptualSignals: authoringPolicy?.topicDefaults?.conceptualSignals,
    });

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

    const hasExplicitTopicCodeInputTargets = hasExplicitCodeInputTargetOverrides(topicTargets);
    if (
        conceptualOnly &&
        !hasExplicitTopicCodeInputTargets &&
        !topicKind
    ) {
        generationTargets.projectCodeInputMin = 0;
        generationTargets.projectCodeInputTarget = 0;
        generationTargets.projectCodeInputMax = 0;
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
    const resolvedPractice = resolvePractice({
        inheritedPractice,
        topicPractice,
        defaultPractice,
        projectConfig,
        authoringPolicy,
        conceptualOnly,
        supportsPractice,
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
        authoringPolicy,
        generationTargets,
        plannedExerciseCounts,
        moduleRuntimeDefaults: mergedRuntimeDefaults,
        moduleServiceDefaults: mergedServiceDefaults,
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
    authoringPolicy?: CourseSpec["resolvedAuthoringPolicy"];
    conceptualOnly: boolean;
    supportsPractice: boolean;
}): PracticeConfig | undefined {
    const merged = {
        ...(args.inheritedPractice ?? {}),
        ...(args.topicPractice ?? {}),
    } as PracticeConfig;

    if (
        !args.supportsPractice &&
        !args.projectConfig &&
        Object.keys(merged).length === 0
    ) {
        return undefined;
    }

    const tryItDefault = args.projectConfig?.tryItDefault ?? args.defaultPractice?.tryItDefault;
    const requiresTryItDefault =
        args.authoringPolicy?.topicDefaults?.requiresTryIt ?? true;
    const requiresTryIt =
        merged.requiresTryIt ?? (args.conceptualOnly ? false : requiresTryItDefault);
    const tryIt =
        typeof merged.tryIt === "boolean"
            ? merged.tryIt
            : args.conceptualOnly
                ? false
                : requiresTryIt
                    ? true
                    : tryItDefault?.enabled;
    const placement =
        merged.tryItPlacement ?? (tryIt === true ? tryItDefault?.placement ?? "all_sketches" : undefined);
    const effectiveTryIt = placement === "none" ? false : tryIt;
    const tryItSketchIndex =
        effectiveTryIt === true || typeof merged.tryItSketchIndex === "number"
            ? merged.tryItSketchIndex ?? tryItDefault?.sketchIndex ?? 0
            : undefined;
    const projectFlow = merged.projectFlow ?? args.projectConfig?.projectFlowDefault;

    const resolved: PracticeConfig = {
        ...merged,
        conceptualOnly: args.conceptualOnly,
        requiresTryIt,
        ...(typeof effectiveTryIt === "boolean" ? { tryIt: effectiveTryIt } : {}),
        ...(placement ? { tryItPlacement: placement } : {}),
        ...(typeof tryItSketchIndex === "number" ? { tryItSketchIndex } : {}),
        ...(projectFlow ? { projectFlow } : {}),
    };

    return Object.keys(resolved).length > 0 ? resolved : undefined;
}
