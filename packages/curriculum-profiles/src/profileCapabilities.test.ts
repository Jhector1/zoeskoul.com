import { describe, expect, it } from "vitest";
import { listSqlDatasetIds } from "./sql/datasets/index.js";
import {
    assertProfileSupportsCodeInput,
    getCurriculumProfile,
    listCurriculumProfiles,
    profileSupportsCodeInput,
    validateProfileShapeConsistency,
} from "./registry.js";
import { bashShape, mathShape, pythonShape, sqlShape } from "./shapes/index.js";
import type { CourseProfile } from "./types.js";
import { WORKSPACE_PROFILES } from "./workspaceProfiles.js";

describe("workspace profile file and folder creation capabilities", () => {
    it("makes browser Python files runner explicitly folder/file creation aware", () => {
        const profile = WORKSPACE_PROFILES["browser-python-files-runner"];

        expect(profile.capabilities.filesystem.enabled).toBe(true);
        expect(profile.capabilities.multiFileProjects.enabled).toBe(true);
        expect(profile.capabilities.createFiles?.enabled).toBe(true);
        expect(profile.capabilities.createFolders?.enabled).toBe(true);

        expect(profile.preferredActionLanguage.join("\n")).toMatch(/create files or folders/i);
        expect(profile.preferredActionLanguage.join("\n")).toMatch(/data\/input\.txt|src\/main\.py/i);
    });

    it("keeps simple browser code runner single-file only", () => {
        const profile = WORKSPACE_PROFILES["browser-code-runner"];

        expect(profile.capabilities.filesystem.enabled).toBe(false);
        expect(profile.capabilities.createFiles?.enabled).toBe(false);
        expect(profile.capabilities.createFolders?.enabled).toBe(false);
    });

    it("registers the Linux terminal workspace runner profile", () => {
        const profile = WORKSPACE_PROFILES["terminal-workspace-runner"];

        expect(profile).toBeDefined();
        expect(profile.capabilities.terminal.enabled).toBe(true);
        expect(profile.capabilities.filesystem.enabled).toBe(true);
        expect(profile.capabilities.multiFileProjects.enabled).toBe(true);
        expect(profile.capabilities.createFiles?.enabled).toBe(true);
        expect(profile.capabilities.createFolders?.enabled).toBe(true);
        expect(profile.capabilities.packageInstall.enabled).toBe(false);
        expect(profile.preferredActionLanguage.join("\n")).toMatch(/terminal/i);
        expect(profile.preferredActionLanguage.join("\n")).toMatch(/mkdir|touch|cp|mv|rm/i);
    });
});
describe("profile code_input capabilities", () => {
    it("marks math as concept-only and keeps bash/python/sql code-capable", () => {
        const mathProfile = getCurriculumProfile("math");
        const bashProfile = getCurriculumProfile("bash");
        const pythonProfile = getCurriculumProfile("python");
        const sqlProfile = getCurriculumProfile("sql");

        expect(profileSupportsCodeInput(mathProfile)).toBe(false);
        expect(mathProfile.codeInput).toBeUndefined();
        expect(mathProfile.runtimeKind).toBeUndefined();
        expect(mathProfile.defaultLanguage).toBeUndefined();
        expect(mathProfile.defaultEntryFileName).toBeUndefined();
        expect(mathProfile.allowedExerciseKinds).not.toContain("code_input");
        expect(mathProfile.shape.topicBundle.allowedExerciseKinds).not.toContain("code_input");
        expect(JSON.stringify(mathProfile)).not.toContain("main.py");
        expect(JSON.stringify(mathProfile)).not.toContain("# Write your answer below");

        expect(profileSupportsCodeInput(bashProfile)).toBe(true);
        expect(profileSupportsCodeInput(pythonProfile)).toBe(true);
        expect(profileSupportsCodeInput(sqlProfile)).toBe(true);
    });

    it("throws a clear capability error for profiles without code_input support", () => {
        expect(() =>
            assertProfileSupportsCodeInput(getCurriculumProfile("math")),
        ).toThrow('Profile "math" does not support code_input exercises.');
    });

    it("keeps all built-in profiles in sync with their shapes", () => {
        for (const profile of listCurriculumProfiles()) {
            expect(validateProfileShapeConsistency(profile)).toEqual([]);
        }
    });

    it("keeps math shape concept-only", () => {
        expect(mathShape.topicBundle.allowedExerciseKinds).not.toContain("code_input");
    });

    it("accepts built-in Bash, Python, and SQL code-capable profiles", () => {
        expect(validateProfileShapeConsistency(getCurriculumProfile("bash"))).toEqual([]);
        expect(validateProfileShapeConsistency(getCurriculumProfile("python"))).toEqual([]);
        expect(validateProfileShapeConsistency(getCurriculumProfile("sql"))).toEqual([]);
    });

    it("keeps bash shape code-capable", () => {
        expect(bashShape.topicBundle.allowedExerciseKinds).toContain("code_input");
    });

    it("exposes a project capability for the Python profile", () => {
        const pythonProfile = getCurriculumProfile("python");

        expect(pythonProfile.project).toBeDefined();
    });

    it("exposes a practice capability for the Python profile and leaves SQL opted out", () => {
        const pythonProfile = getCurriculumProfile("python");
        const sqlProfile = getCurriculumProfile("sql");

        expect(pythonProfile.practice?.tryItDefault).toEqual({
            enabled: true,
            sketchIndex: 0,
            allowReveal: true,
        });
        expect(pythonProfile.practice?.preferredTryItExerciseKind).toBe("code_input");
        expect(sqlProfile.practice).toBeUndefined();
    });

    it("returns the expected Python module_project config defaults", () => {
        const pythonProfile = getCurriculumProfile("python");
        const config = pythonProfile.project?.getProjectConfig({
            seed: {} as any,
            topicKind: "module_project",
        });

        expect(config).toBeDefined();
        expect(config?.targetStepCount).toBe(3);
        expect(config?.allowReveal).toBe(true);
    });

    it("returns the expected Python capstone config defaults", () => {
        const pythonProfile = getCurriculumProfile("python");
        const config = pythonProfile.project?.getProjectConfig({
            seed: {} as any,
            topicKind: "capstone",
        });

        expect(config).toBeDefined();
        expect(config?.targetStepCount).toBe(5);
        expect(config?.allowReveal).toBe(true);
    });

    it("classifies Python project exercises through profile.project", () => {
        const pythonProfile = getCurriculumProfile("python");

        expect(
            pythonProfile.project?.isProjectExercise({
                exercise: {
                    kind: "code_input",
                } as any,
                seed: {} as any,
                topicKind: "module_project",
            }),
        ).toBe(true);

        expect(
            pythonProfile.project?.isProjectExercise({
                exercise: {
                    kind: "single_choice",
                } as any,
                seed: {} as any,
                topicKind: "module_project",
            }),
        ).toBe(false);
    });

    it("keeps the SQL profile project capability available", () => {
        const sqlProfile = getCurriculumProfile("sql");

        expect(sqlProfile.project).toBeDefined();
        expect(
            sqlProfile.project?.isProjectExercise({
                exercise: {
                    kind: "code_input",
                } as any,
                seed: {} as any,
                topicKind: "module_project",
            }),
        ).toBe(true);
    });

    it("keeps sqlShape allowedDatasetIds aligned with the canonical SQL dataset registry", () => {
        const canonicalDatasetIds = listSqlDatasetIds().slice().sort();
        const shapeDatasetIds = [...(sqlShape.sqlCodeRecipe?.allowedDatasetIds ?? [])].sort();

        expect(shapeDatasetIds).toEqual(canonicalDatasetIds);
        expect(shapeDatasetIds).toContain("design_sandbox");
        expect(shapeDatasetIds).toContain("capstone_sandbox");
    });

    it("flags shapes that allow code_input when the profile does not", () => {
        const badProfile = {
            ...getCurriculumProfile("math"),
            shape: {
                ...mathShape,
                topicBundle: {
                    ...mathShape.topicBundle,
                    allowedExerciseKinds: [...pythonShape.topicBundle.allowedExerciseKinds],
                },
            },
        } satisfies CourseProfile;

        expect(validateProfileShapeConsistency(badProfile)).toContain(
            'Profile "math" shape allows "code_input" but profile.allowedExerciseKinds does not. Update math shape or math profile so capabilities agree.',
        );
    });

    it("flags profiles that allow code_input when the shape does not", () => {
        const badProfile = {
            ...getCurriculumProfile("math"),
            allowedExerciseKinds: [...sqlShape.topicBundle.allowedExerciseKinds],
        } satisfies CourseProfile;

        expect(validateProfileShapeConsistency(badProfile)).toContain(
            'Profile "math" allows "code_input" but shape.topicBundle.allowedExerciseKinds does not. Update math shape or math profile so capabilities agree.',
        );
        expect(validateProfileShapeConsistency(badProfile)).toContain(
            'Profile "math" allows "code_input" but has no codeInput capability. Add profile.codeInput or remove "code_input" from profile.allowedExerciseKinds.',
        );
    });

    it("flags code_input profiles that are missing a codeInput capability", () => {
        const pythonProfile = getCurriculumProfile("python");
        const badProfile = {
            ...pythonProfile,
            codeInput: undefined,
        } satisfies CourseProfile;

        expect(validateProfileShapeConsistency(badProfile)).toContain(
            'Profile "python" allows "code_input" but has no codeInput capability. Add profile.codeInput or remove "code_input" from profile.allowedExerciseKinds.',
        );
    });
});
