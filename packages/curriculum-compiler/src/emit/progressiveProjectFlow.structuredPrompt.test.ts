import { describe, expect, it } from "vitest";
import { applyProgressiveProjectFlow } from "./progressiveProjectFlow.js";

function projectConfig() {
    return {
        preferredProjectExerciseKind: "code_input",
        minStepCount: 2,
        targetStepCount: 2,
        allowReveal: true,
        tryItDefault: {
            enabled: true,
            sketchIndex: 0,
            allowReveal: true,
        },
        projectFlowDefault: "progressive",
        projectTitle: "Final Capstone Project",
        projectStepLabel: "Capstone step",
        startPromptPrefix: "Start the final capstone project.",
        continuePromptPrefix:
            "Continue the final capstone project from the previous working step.",
        helpConcept:
            "The final capstone is progressive. Each step starts from the previous working solution and adds one focused feature.",
    } as any;
}

function codeStep(args: {
    id: string;
    prompt: string;
    starterCode: string;
    solutionCode: string;
}) {
    return {
        id: args.id,
        kind: "code_input",
        title: args.id,
        prompt: args.prompt,
        hint: "Hint",
        help: {
            concept: "Concept",
            hint_1: "Hint 1",
            hint_2: "Hint 2",
        },
        starterCode: args.starterCode,
        solutionCode: args.solutionCode,
        fixedLanguage: "web",
        entryFilePath: "styles.css",
        recipeType: "source_checks",
        sourceChecks: [
            {
                type: "source_regex",
                path: "styles.css",
                pattern: "body",
                message: "Add the rule.",
                normalizeWhitespace: false,
            },
        ],
    } as any;
}

describe("progressiveProjectFlow structured learner prompts", () => {
    it("does not prefix structured Problem/Task prompts on any progressive step", () => {
        const firstPrompt = `**Problem**

The page needs a foundation.

**Task**

Add the body rule.`;

        const secondPrompt = `**Problem**

The links need hover feedback.

**Task**

Add the hover rule.`;

        expect(firstPrompt.startsWith("**Problem**\n")).toBe(true);
        expect(secondPrompt.startsWith("**Problem**\n")).toBe(true);

        const result = applyProgressiveProjectFlow({
            exercises: [
                codeStep({
                    id: "step-1",
                    prompt: firstPrompt,
                    starterCode: "",
                    solutionCode: "body { color: black; }\n",
                }),
                codeStep({
                    id: "step-2",
                    prompt: secondPrompt,
                    starterCode: "body { color: black; }\n",
                    solutionCode:
                        "body { color: black; }\na:hover { color: white; }\n",
                }),
            ],
            projectStepIds: ["step-1", "step-2"],
            projectConfig: projectConfig(),
            seed: {
                profileId: "web",
                practice: { projectFlow: "progressive" },
            } as any,
        });

        expect(result[0]?.prompt).toBe(firstPrompt);
        expect(result[1]?.prompt).toBe(secondPrompt);
        expect(result[0]?.prompt).not.toContain("Start the final capstone project");
        expect(result[1]?.prompt).not.toContain("Continue the final capstone project");
        expect(result[1]?.prompt).not.toContain("In step 2 of 2");
    });

    it("preserves legacy prefix behavior for unstructured project prompts", () => {
        const result = applyProgressiveProjectFlow({
            exercises: [
                codeStep({
                    id: "step-1",
                    prompt: "Add the body rule.",
                    starterCode: "",
                    solutionCode: "body { color: black; }\n",
                }),
                codeStep({
                    id: "step-2",
                    prompt: "Add the hover rule.",
                    starterCode: "body { color: black; }\n",
                    solutionCode:
                        "body { color: black; }\na:hover { color: white; }\n",
                }),
            ],
            projectStepIds: ["step-1", "step-2"],
            projectConfig: projectConfig(),
            seed: {
                profileId: "web",
                practice: { projectFlow: "progressive" },
            } as any,
        });

        expect(result[0]?.prompt).toContain("Start the final capstone project.");
        expect(result[0]?.prompt).toContain("In step 1 of 2");
        expect(result[1]?.prompt).toContain(
            "Continue the final capstone project from the previous working step.",
        );
        expect(result[1]?.prompt).toContain("In step 2 of 2");
    });
});
