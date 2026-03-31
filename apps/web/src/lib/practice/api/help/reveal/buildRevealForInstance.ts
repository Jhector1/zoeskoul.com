import type { LoadedValidateInstance } from "@/lib/practice/api/validate/repositories/instance.repo";

export async function buildRevealForInstance(args: {
    instance: LoadedValidateInstance;
    expectedCanon: any;
    showDebug: boolean;
}) {
    const { instance, expectedCanon } = args;

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
                    language: String(expectedCanon?.language ?? "python"),
                    solutionCode: String(expectedCanon?.solutionCode ?? ""),
                },
                explanation: "Solution shown.",
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