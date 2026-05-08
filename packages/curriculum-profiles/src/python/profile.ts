// import type { CourseProfile } from "../types.js";
//
// export const pythonProfile: CourseProfile = {
//     id: "python",
//     allowedExerciseKinds: [
//         "single_choice",
//         "multi_choice",
//         "drag_reorder",
//         "fill_blank_choice",
//         "code_input",
//     ],
//     allowedRecipeTypes: ["fixed_tests", "template_io"],
//
//     buildModuleRuntimeDefaults() {
//         return {
//             kind: "code",
//             language: "python",
//         };
//     },
//
//     getRecipeRegistry() {
//         return {};
//     },
//
//     validateTopicBundle() {
//         return [];
//     },
// };





import type {
    TopicRecipe,
    BuildSubjectManifestArgs,
    BuildTopicSeedArgs,
    CompileTopicRecipeArgs,
} from "@zoeskoul/curriculum-contracts";
import { buildBaseSubjectManifest } from "../shared/buildBaseSubjectManifest.js";
import type { CourseProfile, CourseProfileAdapter } from "../types.js";

export const pythonProfile: CourseProfile = {
    id: "python",
    allowedExerciseKinds: [
        "single_choice",
        "multi_choice",
        "drag_reorder",
        "fill_blank_choice",
        "code_input",
    ],
    allowedRecipeTypes: ["fixed_tests", "template_io", "semantic"],
    buildModuleRuntimeDefaults() {
        return { kind: "code", language: "python" };
    },
    getRecipeRegistry() {
        return {};
    },
    validateTopicBundle() {
        return [];
    },
};
