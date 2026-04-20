import type { CourseProfile } from "../types.js";

export const webProfile: CourseProfile = {
    id: "web",
    allowedExerciseKinds: [
        "single_choice",
        "multi_choice",
        "drag_reorder",
        "fill_blank_choice",
        "code_input",
    ],
    allowedRecipeTypes: ["fixed_tests", "template_io"],
    buildModuleRuntimeDefaults() {
        return {
            kind: "code",
            language: "javascript",
        };
    },
    getRecipeRegistry() {
        return {};
    },
    validateTopicBundle() {
        return [];
    },
};