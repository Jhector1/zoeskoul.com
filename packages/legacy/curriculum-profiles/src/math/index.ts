import type { CourseProfile } from "../types.js";

export const mathProfile: CourseProfile = {
    id: "math",
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