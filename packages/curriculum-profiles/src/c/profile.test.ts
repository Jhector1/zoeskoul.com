import { describe, expect, it } from "vitest";
import { cProfile } from "./profile.js";
import { validateProfileShapeConsistency } from "../registry.js";

function seed() {
    return {
        subjectSlug: "c-data-structures",
        profileId: "c",
        moduleSlug: "c-1",
        sectionSlug: "c-1-compiled-lab-1",
        topicId: "stack-lab",
        order: 1,
        title: "Stack lab",
        summary: "Build a stack in C.",
        minutes: 30,
        technical: true,
        moduleTitle: "Data structures",
        modulePurpose: "Implement structures.",
        moduleObjectives: [],
        guidedExercises: [],
        quizFocus: [],
        sectionTitle: "Stacks",
        sourceLocale: "en",
        targetLocales: [],
        modulePrefix: "c1",
        moduleOrder: 1,
        sectionOrder: 1,
    } as any;
}

describe("cProfile", () => {
    it("is shape-consistent and uses a multi-file C runtime", () => {
        expect(validateProfileShapeConsistency(cProfile)).toEqual([]);
        expect(cProfile.buildModuleRuntimeDefaults()).toMatchObject({
            kind: "code",
            language: "c",
            supportsMultiFile: true,
            supportsFileSystem: true,
        });
    });

    it("builds a fixed-tests C workspace with main.c", () => {
        const manifest = cProfile.codeInput!.buildManifest({
            seed: seed(),
            messageBase: "topics.c.lab.exercise",
            exercise: {
                id: "exercise",
                kind: "code_input",
                title: "Compile C",
                prompt: "Complete the function.",
                hint: "Use the helper.",
                help: { concept: "Compile all files.", hint_1: "Edit helper.c.", hint_2: "Run it." },
                starterCode: "int main(void) { return 0; }",
                solutionCode: "int main(void) { return 0; }",
                fixedLanguage: "c",
                recipeType: "fixed_tests",
                tests: [{ stdin: "", stdout: "ok\n", match: "exact" }],
            },
        });

        expect(manifest.language).toBe("c");
        expect(manifest.workspace?.entryFilePath).toBe("main.c");
        expect(manifest.recipe.type).toBe("fixed_tests");
    });
});
