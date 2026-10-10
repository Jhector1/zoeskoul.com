import { describe, expect, it } from "vitest";
import { getCurriculumProfile } from "../registry.js";

const seed: any = {
    subjectSlug: "html",
    profileId: "web",
    topicId: "document-structure",
    title: "Document Structure",
    summary: "Build a complete HTML document.",
};

describe("web curriculum profile", () => {
    it("is registered and uses browser web runtime defaults", () => {
        const profile = getCurriculumProfile("web");
        expect(profile.defaultLanguage).toBe("web");
        expect(profile.buildModuleRuntimeDefaults()).toMatchObject({
            kind: "code",
            language: "web",
            supportsTerminal: false,
        });
    });

    it("builds source-checked index.html exercises without stdout tests", () => {
        const profile = getCurriculumProfile("web");
        if (!profile.codeInput) throw new Error("web profile must support code_input");
        const manifest = profile.codeInput.buildManifest({
            seed,
            messageBase: "quiz.html_document_structure",
            exercise: {
                id: "html-document-structure",
                kind: "code_input",
                title: "Build the page",
                prompt: "Add a main heading.",
                hint: "Use h1.",
                starterCode: "<!doctype html><html><body></body></html>",
                solutionCode: "<!doctype html><html><body><h1>Hello</h1></body></html>",
                fixedLanguage: "web",
                recipeType: "source_checks",
                sourceChecks: [{
                    type: "source_regex",
                    path: "index.html",
                    pattern: "<h1[^>]*>\\s*Hello\\s*</h1>",
                    message: "Add an h1 that says Hello.",
                }],
            } as any,
        });

        expect(manifest.language).toBe("web");
        expect(manifest.recipe.type).toBe("source_checks");
        expect(manifest.workspace?.entryFilePath).toBe("index.html");
        expect((manifest.recipe as any).tests).toBeUndefined();
    });
});
