import { describe, expect, it } from "vitest";
import { listSqlDatasetIds } from "./sql/datasets/index.js";
import {
    assertProfileSupportsCodeInput,
    getCurriculumProfile,
    listCurriculumProfiles,
    profileSupportsCodeInput,
    validateProfileShapeConsistency,
} from "./registry.js";
import { mathShape, pythonShape, sqlShape } from "./shapes/index.js";
import type { CourseProfile } from "./types.js";

describe("profile code_input capabilities", () => {
    it("marks math as concept-only and keeps python/sql code-capable", () => {
        const mathProfile = getCurriculumProfile("math");
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

    it("accepts built-in Python and SQL code-capable profiles", () => {
        expect(validateProfileShapeConsistency(getCurriculumProfile("python"))).toEqual([]);
        expect(validateProfileShapeConsistency(getCurriculumProfile("sql"))).toEqual([]);
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
