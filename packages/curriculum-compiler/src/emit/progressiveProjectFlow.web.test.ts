import { describe, expect, it } from "vitest";
import { applyProgressiveProjectFlow } from "./progressiveProjectFlow.js";

function webStep(args: {
    id: string;
    title: string;
    prompt: string;
    starter: string;
    solution: string;
}) {
    return {
        id: args.id,
        kind: "code_input" as const,
        title: args.title,
        prompt: args.prompt,
        hint: "Use the browser preview after this change.",
        help: {
            concept: "Each HTML project step keeps one cumulative page.",
            hint_1: "Keep the previous document structure.",
            hint_2: "Add only the requested HTML for this step.",
        },
        fixedLanguage: "web" as const,
        recipeType: "source_checks" as const,
        entryFilePath: "index.html",
        starterCode: args.starter,
        solutionCode: args.solution,
        sourceChecks: [
            {
                type: "source_contains" as const,
                path: "index.html",
                pattern: "<html",
                message: "Keep the html root.",
            },
        ],
    };
}

describe("progressiveProjectFlow web pages", () => {
    it("carries HTML forward with browser-safe comments and cumulative replacement solutions", () => {
        const step1 = webStep({
            id: "step-1",
            title: "Build the shell",
            prompt: "Create the page shell.",
            starter: "<!-- start -->\n",
            solution: [
                "<!DOCTYPE html>",
                '<html lang="en">',
                "  <head><title>Page</title></head>",
                "  <body>",
                "  </body>",
                "</html>",
                "",
            ].join("\n"),
        });
        const step2 = webStep({
            id: "step-2",
            title: "Add the heading",
            prompt: "Add an h1 inside body.",
            starter: step1.solutionCode,
            solution: [
                "<!DOCTYPE html>",
                '<html lang="en">',
                "  <head><title>Page</title></head>",
                "  <body>",
                "    <h1>Hello</h1>",
                "  </body>",
                "</html>",
                "",
            ].join("\n"),
        });

        const result = applyProgressiveProjectFlow({
            exercises: [step1, step2],
            projectStepIds: ["step-1", "step-2"],
            projectConfig: {
                preferredProjectExerciseKind: "code_input",
                minStepCount: 2,
                targetStepCount: 2,
                allowReveal: true,
                tryItDefault: { enabled: true, sketchIndex: 0, allowReveal: true },
                projectFlowDefault: "progressive",
                projectTitle: "Module Project",
                projectStepLabel: "Project step",
                startPromptPrefix: "Start the module project.",
                continuePromptPrefix: "Continue the same module project.",
                helpConcept: "Keep one cumulative web page.",
            },
            seed: {
                profileId: "web",
                courseSlug: "html-foundations",
                topicId: "first-page-project",
                practice: { projectFlow: "progressive" },
            } as any,
        });

        const next = result[1];
        expect(next.kind).toBe("code_input");
        if (next.kind !== "code_input") return;

        expect(next.entryFilePath).toBe("index.html");
        expect(next.starterCode).toContain("<title>Page</title>");
        expect(next.starterCode).toContain("<!-- Project step 2: Add the heading -->");
        expect(next.starterCode).not.toContain("# Project step 2");
        expect(next.starterCode.indexOf("<!-- Project step 2")).toBeLessThan(
            next.starterCode.indexOf("</body>"),
        );
        expect(next.solutionCode.trim()).toBe(step2.solutionCode.trim());
        expect(next.solutionCode.match(/<!DOCTYPE html>/g)).toHaveLength(1);
        expect(next.hint).toContain("browser preview");
        expect(next.help.hint_2).toContain("Preview");
    });
});
