
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
    generationTargets?: TopicSeed["generationTargets"];
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
    const targets = args.generationTargets;

    const deliveryRules = targets
        ? `
Topic delivery policy:
- Generate at least ${targets.quizBankMin} non-code quiz exercises.
- Target ${targets.quizBankTarget} non-code quiz exercises.
- Generate ${targets.projectCodeInputTarget} code_input exercises for the project.
- Project code_input count must be between ${targets.projectCodeInputMin} and ${targets.projectCodeInputMax}.
- Quiz card will show ${targets.quizVisibleDefault} random exercises by default.
- Quiz card may show up to ${targets.quizVisibleMax} exercises.
- Do not put code_input exercises in quiz practice.
- All code_input exercises become project practice.
- Attempts are unlimited when maxAttempts is null.
`
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
${deliveryRules}
Policy rules:
- Required exercise counts are hard constraints.
- The final quizDraft must match each required count exactly.
- Do not approximate the mix when exact counts are provided.
- Do not generate more than the required count for any exercise kind.
- Do not replace missing non-code exercises with extra code_input exercises.
- If required counts say code_input: 3, generate exactly 3 code_input exercises.
- If delivery policy gives a min/max range, the exact required counts still win.
- "Dominant" means the planned dominant kind has the highest planned count; it does not mean you should add extra exercises.
- Keep beginner-friendly variety, but do not violate the required counts.`;


}
