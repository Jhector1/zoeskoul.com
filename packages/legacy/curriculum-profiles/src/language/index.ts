import type { CourseProfile } from "../types.js";

export const languageProfile: CourseProfile = {
    id: "language",
    allowedExerciseKinds: ["single_choice", "multi_choice", "drag_reorder", "fill_blank_choice"],
    allowedRecipeTypes: ["fixed_tests", "template_io"],
    buildModuleRuntimeDefaults() {
        return null;
    },
    getRecipeRegistry() {
        return {};
    },
    validateTopicBundle() {
        return [];
    },
};