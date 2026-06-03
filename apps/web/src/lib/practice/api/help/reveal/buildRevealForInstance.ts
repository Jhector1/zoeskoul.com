import type { LoadedValidateInstance } from "@/lib/practice/api/validate/repositories/instance.repo";

export async function buildRevealForInstance(args: {
    instance: LoadedValidateInstance;
    expectedCanon: any;
    showDebug: boolean;
}) {
    const { instance, expectedCanon } = args;
    const publicPayload =
        instance.publicPayload && typeof instance.publicPayload === "object"
            ? (instance.publicPayload as Record<string, unknown>)
            : {};
    const publicRecipe =
        publicPayload.recipe && typeof publicPayload.recipe === "object"
            ? (publicPayload.recipe as Record<string, unknown>)
            : null;
    const solutionFiles =
        expectedCanon?.solutionFiles ??
        publicPayload.solutionFiles ??
        publicRecipe?.solutionFiles;

    switch (instance.kind) {
        case "single_choice":
            return {
                revealAnswer: {
                    kind: "single_choice",
                    optionId: String(expectedCanon?.optionId ?? ""),
                },
                explanation: "Solution shown.",
            };

        case "multi_choice":
            return {
                revealAnswer: {
                    kind: "multi_choice",
                    optionIds: Array.isArray(expectedCanon?.optionIds)
                        ? expectedCanon.optionIds.map(String)
                        : [],
                },
                explanation: "Solution shown.",
            };

        case "drag_reorder":
            return {
                revealAnswer: {
                    kind: "drag_reorder",
                    order: Array.isArray(expectedCanon?.order)
                        ? expectedCanon.order.map(String)
                        : [],
                },
                explanation: "Solution shown.",
            };

        case "code_input":
            return {
                revealAnswer: {
                    kind: "code_input",
                    language: String(expectedCanon?.language ?? publicPayload.language ?? "python"),
                    solutionCode: String(
                        expectedCanon?.solutionCode ??
                        publicRecipe?.solutionCode ??
                        publicPayload.solutionCode ??
                        "",
                    ),
                    ...(solutionFiles !== undefined ? { solutionFiles } : {}),
                },
                explanation: "Here is a working solution.",
            };

        default:
            return {
                revealAnswer: {
                    kind: instance.kind,
                    ...(expectedCanon ?? {}),
                },
                explanation: "Solution shown.",
            };
    }
}
