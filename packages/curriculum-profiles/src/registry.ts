import type {
    CodeInputProfileCapability,
    CourseProfile,
    CourseProfileAdapter,
    RecipeHandler,
} from "./types.js";
import type { ExerciseKind } from "@zoeskoul/curriculum-contracts";
import { applyBaseCourseGenerationPolicy } from "./shared/generationPolicy.js";
import { buildFixedTestsRecipe } from "./base/recipes/buildFixedTestsRecipe.js";
import { buildSemanticRecipe } from "./base/recipes/buildSemanticRecipe.js";
import { buildTemplateIoRecipe } from "./base/recipes/buildTemplateIoRecipe.js";
import { bashProfile, bashProfileAdapter } from "./bash/index.js";
import { sqlProfile, sqlProfileAdapter } from "./sql/index.js";
import { pythonProfile, pythonProfileAdapter } from "./python/index.js";
import { mathProfile, mathProfileAdapter } from "./math/index.js";

const builtinProfiles = [bashProfile, sqlProfile, pythonProfile, mathProfile] satisfies CourseProfile[];
const builtinAdapters = [
    bashProfileAdapter,
    sqlProfileAdapter,
    pythonProfileAdapter,
    mathProfileAdapter,
] satisfies CourseProfileAdapter[];

const profileRegistry = new Map<string, CourseProfile>(
    builtinProfiles.map((profile) => [profile.id, profile]),
);
const adapterRegistry = new Map<string, CourseProfileAdapter>(
    builtinAdapters.map((adapter) => [adapter.id, adapter]),
);

export const BASE_RECIPE_REGISTRY: Record<string, RecipeHandler> = {
    fixed_tests: buildFixedTestsRecipe,
    semantic: buildSemanticRecipe,
    template_io: buildTemplateIoRecipe,
};

function unknownProfileError(profileId: string): Error {
    return new Error(
        `Unknown curriculum profile: ${profileId}. Register a profile adapter before compiling.`,
    );
}

export function listCurriculumProfiles(): CourseProfile[] {
    return Array.from(profileRegistry.values()).map((profile) =>
        applyBaseCourseGenerationPolicy(profile),
    );
}

export function registerCurriculumProfile(profile: CourseProfile) {
    profileRegistry.set(profile.id, profile);
}

export function unregisterCurriculumProfile(profileId: string) {
    if (builtinProfiles.some((profile) => profile.id === profileId)) return;
    profileRegistry.delete(profileId);
}

export function registerCurriculumProfileAdapter(adapter: CourseProfileAdapter) {
    adapterRegistry.set(adapter.id, adapter);
}

export function unregisterCurriculumProfileAdapter(profileId: string) {
    if (builtinAdapters.some((adapter) => adapter.id === profileId)) return;
    adapterRegistry.delete(profileId);
}

export function assertCurriculumProfile(profileId: string): CourseProfile {
    const profile = profileRegistry.get(profileId);
    if (!profile) {
        throw unknownProfileError(profileId);
    }

    return applyBaseCourseGenerationPolicy(profile);
}

export function getCurriculumProfile(profileId: string): CourseProfile {
    return assertCurriculumProfile(profileId);
}

export function profileSupportsExerciseKind(
    profile: CourseProfile,
    kind: ExerciseKind,
): boolean {
    return profile.allowedExerciseKinds.includes(kind);
}

export function profileSupportsCodeInput(
    profile: CourseProfile,
): profile is CourseProfile & { codeInput: CodeInputProfileCapability } {
    return profileSupportsExerciseKind(profile, "code_input") && !!profile.codeInput;
}

export function validateProfileShapeConsistency(profile: CourseProfile): string[] {
    const issues: string[] = [];
    const profileKinds = new Set(profile.allowedExerciseKinds);
    const shapeKinds = new Set(profile.shape.topicBundle.allowedExerciseKinds);
    const profileAllowsCodeInput = profileKinds.has("code_input");
    const shapeAllowsCodeInput = shapeKinds.has("code_input");
    const supportsCodeInput = profileSupportsCodeInput(profile);

    for (const kind of profileKinds) {
        if (!shapeKinds.has(kind as ExerciseKind)) {
            issues.push(
                `Profile "${profile.id}" allows "${kind}" but shape.topicBundle.allowedExerciseKinds does not. Update ${profile.shape.profileId} shape or ${profile.id} profile so capabilities agree.`,
            );
        }
    }

    for (const kind of shapeKinds) {
        if (!profileKinds.has(kind)) {
            issues.push(
                `Profile "${profile.id}" shape allows "${kind}" but profile.allowedExerciseKinds does not. Update ${profile.shape.profileId} shape or ${profile.id} profile so capabilities agree.`,
            );
        }
    }

    if (!supportsCodeInput) {
        if (profileAllowsCodeInput) {
            issues.push(
                `Profile "${profile.id}" allows "code_input" but has no codeInput capability. Add profile.codeInput or remove "code_input" from profile.allowedExerciseKinds.`,
            );
        }

        if (shapeAllowsCodeInput) {
            issues.push(
                `Profile "${profile.id}" shape allows "code_input" but profile does not support code_input. Update ${profile.shape.profileId} shape or add codeInput support to the profile.`,
            );
        }

        if (profile.runtimeKind || profile.defaultLanguage || profile.defaultEntryFileName) {
            const configured = [
                profile.runtimeKind
                    ? `runtimeKind "${profile.runtimeKind}"`
                    : null,
                profile.defaultLanguage
                    ? `defaultLanguage "${profile.defaultLanguage}"`
                    : null,
                profile.defaultEntryFileName
                    ? `defaultEntryFileName "${profile.defaultEntryFileName}"`
                    : null,
            ].filter(Boolean);

            issues.push(
                `Profile "${profile.id}" is concept-only but still defines ${configured.join(", ")}. Remove code workspace defaults or add code_input capability intentionally.`,
            );
        }
    } else {
        if (!profileAllowsCodeInput) {
            issues.push(
                `Profile "${profile.id}" supports code_input via profile.codeInput, but profile.allowedExerciseKinds is missing "code_input". Add it so capabilities agree.`,
            );
        }

        if (!shapeAllowsCodeInput) {
            issues.push(
                `Profile "${profile.id}" supports code_input, but shape.topicBundle.allowedExerciseKinds is missing "code_input". Update ${profile.shape.profileId} shape or remove codeInput support from the profile.`,
            );
        }
    }

    return issues;
}

export function assertProfileSupportsCodeInput(
    profile: CourseProfile,
): CodeInputProfileCapability {
    if (!profileSupportsCodeInput(profile)) {
        throw new Error(`Profile "${profile.id}" does not support code_input exercises.`);
    }

    return profile.codeInput;
}

export function getProfile(id: string): CourseProfile {
    return getCurriculumProfile(id);
}

export function getProfileAdapter(id: string): CourseProfileAdapter {
    const adapter = adapterRegistry.get(id);
    if (!adapter) {
        throw unknownProfileError(id);
    }

    return adapter;
}

export function getRecipeRegistryForProfile(id: string) {
    const profile = getCurriculumProfile(id);
    return {
        ...BASE_RECIPE_REGISTRY,
        ...profile.getRecipeRegistry(),
    };
}
