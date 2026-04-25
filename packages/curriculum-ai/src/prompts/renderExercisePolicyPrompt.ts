
import type {
    ResolvedExercisePolicy,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";

type PlannedExerciseCounts = NonNullable<TopicSeed["plannedExerciseCounts"]>;

function formatPercent(value: number) {
    return `${Math.round(value * 100)}%`;
}

export function renderExercisePolicyPrompt(args: {
    policy?: ResolvedExercisePolicy;
    plannedCounts?: PlannedExerciseCounts;
}): string {
    if (!args.policy) return "";

    const entries = Object.entries(args.policy.mix).sort((a, b) => b[1] - a[1]);
    const dominant =
        args.plannedCounts?.dominantKind ?? entries[0]?.[0] ?? "fill_blank_choice";

    const orderedMix = entries
        .map(([kind, weight]) => `- ${kind}: ${formatPercent(weight)}`)
        .join("\n");

    const orderedCounts = args.plannedCounts
        ? (Object.entries(args.plannedCounts.counts) as Array<[string, number]>)
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([kind, count]) => `- ${kind}: ${count}`)
            .join("\n")
        : "";

    return `
Exercise policy (important; follow this exactly in the generated quizDraft):
- Policy source: ${args.policy.source}
- Dominant exercise kind: ${dominant}
- Target exercise mix:
${orderedMix}
${
        args.plannedCounts
            ? `- Target quizDraft total: ${args.plannedCounts.total}
- Required exercise counts:
${orderedCounts}`
            : ""
    }

Policy rules:
- If required exercise counts are provided, the final quizDraft must match them exactly.
- The dominant exercise kind must actually dominate the topic draft.
- Do not approximate the mix when exact counts are provided.
- If code_input count is 1 or higher, include that many code_input exercises.
- Keep beginner-friendly variety, but do not violate the required counts.
`;
}