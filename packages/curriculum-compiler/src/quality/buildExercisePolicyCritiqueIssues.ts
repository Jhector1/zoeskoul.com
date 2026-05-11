import type {
    ResolvedExercisePolicy,
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { CritiqueIssue } from "@zoeskoul/curriculum-profiles";

const KINDS = [
    "single_choice",
    "multi_choice",
    "drag_reorder",
    "fill_blank_choice",
    "code_input",
] as const;

type Kind = (typeof KINDS)[number];

type PlannedExerciseCounts = NonNullable<TopicSeed["plannedExerciseCounts"]>;

type GenerationTargets = TopicSeed["generationTargets"];

function dominantKind(mix: Record<Kind, number>): Kind {
    return dominantKinds(mix)[0] ?? "single_choice";
}

function dominantKinds(mix: Record<Kind, number>): Kind[] {
    const maxValue = Math.max(...KINDS.map((kind) => mix[kind]));
    return KINDS.filter((kind) => mix[kind] === maxValue);
}

function countKinds(draft: TopicAuthoringDraft): Record<Kind, number> {
    const counts: Record<Kind, number> = {
        single_choice: 0,
        multi_choice: 0,
        drag_reorder: 0,
        fill_blank_choice: 0,
        code_input: 0,
    };

    for (const exercise of draft.quizDraft) {
        if (exercise.kind in counts) {
            counts[exercise.kind as Kind] += 1;
        }
    }

    return counts;
}

function toMix(counts: Record<Kind, number>): Record<Kind, number> {
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

    if (total <= 0) {
        return {
            single_choice: 0,
            multi_choice: 0,
            drag_reorder: 0,
            fill_blank_choice: 0,
            code_input: 0,
        };
    }

    return {
        single_choice: counts.single_choice / total,
        multi_choice: counts.multi_choice / total,
        drag_reorder: counts.drag_reorder / total,
        fill_blank_choice: counts.fill_blank_choice / total,
        code_input: counts.code_input / total,
    };
}

function buildGenerationTargetIssues(args: {
    draft: TopicAuthoringDraft;
    generationTargets?: GenerationTargets;
}): CritiqueIssue[] {
    const targets = args.generationTargets;

    if (!targets) {
        return [];
    }

    const quizCount = args.draft.quizDraft.filter(
        (exercise) => exercise.kind !== "code_input",
    ).length;

    const codeInputCount = args.draft.quizDraft.filter(
        (exercise) => exercise.kind === "code_input",
    ).length;

    const issues: CritiqueIssue[] = [];

    if (quizCount < targets.quizBankMin) {
        issues.push({
            code: "QUIZ_BANK_TOO_SMALL",
            category: "clarity",
            severity: "error",
            message: `Expected at least ${targets.quizBankMin} non-code quiz exercise(s), but the draft has ${quizCount}.`,
        });
    }

    if (codeInputCount < targets.projectCodeInputMin) {
        issues.push({
            code: "PROJECT_CODE_INPUT_TOO_SMALL",
            category: "clarity",
            severity: "error",
            message: `Expected at least ${targets.projectCodeInputMin} code_input project exercise(s), but the draft has ${codeInputCount}.`,
        });
    }

    if (codeInputCount > targets.projectCodeInputMax) {
        issues.push({
            code: "PROJECT_CODE_INPUT_TOO_LARGE",
            category: "clarity",
            severity: "warn",
            message: `Expected no more than ${targets.projectCodeInputMax} code_input project exercise(s), but the draft has ${codeInputCount}. Extra code_input exercises may be ignored by the project card.`,
        });
    }

    return issues;
}

function buildCountBasedIssues(args: {
    counts: Record<Kind, number>;
    plannedCounts: PlannedExerciseCounts;
    generationTargets?: GenerationTargets;
}): CritiqueIssue[] {
    const issues: CritiqueIssue[] = [];
    const { counts, plannedCounts, generationTargets } = args;

    for (const kind of KINDS) {
        const expected = plannedCounts.counts[kind] ?? 0;
        const actual = counts[kind] ?? 0;

        if (actual === expected) continue;

        const delta = Math.abs(actual - expected);

        if (kind === "code_input" && actual < expected) {
            issues.push({
                code: "EXERCISE_POLICY_CODE_INPUT_UNDER_TARGET",
                category: "clarity",
                severity: "error",
                message: `Exercise policy expects ${expected} "code_input" exercise(s), but the draft has ${actual}.`,
            });
            continue;
        }

        issues.push({
            code:
                actual < expected
                    ? "EXERCISE_POLICY_KIND_UNDER_TARGET"
                    : "EXERCISE_POLICY_KIND_OVER_TARGET",
            category: "clarity",
            severity: delta <= 1 ? "warn" : "error",
            message: `Exercise policy targets ${expected} "${kind}" exercise(s), but the draft has ${actual}.`,
        });
    }

    const actualDominants = dominantKinds(toMix(counts));

    if (!actualDominants.includes(plannedCounts.dominantKind)) {
        issues.push({
            code: "EXERCISE_POLICY_DOMINANT_KIND_MISMATCH",
            category: "clarity",
            severity: generationTargets ? "warn" : "error",
            message: `Exercise policy expects "${plannedCounts.dominantKind}" to be dominant, but the draft is dominated by "${actualDominants.join(" / ")}".`,
        });
    }

    const expectedTotal = plannedCounts.total;
    const actualTotal = Object.values(counts).reduce((sum, value) => sum + value, 0);

    if (actualTotal !== expectedTotal) {
        issues.push({
            code: "EXERCISE_POLICY_TOTAL_MISMATCH",
            category: "clarity",
            severity: "error",
            message: `Exercise policy expects ${expectedTotal} total exercise(s), but the draft has ${actualTotal}.`,
        });
    }

    return issues;
}

function buildMixBasedIssues(args: {
    counts: Record<Kind, number>;
    policy: ResolvedExercisePolicy;
    generationTargets?: GenerationTargets;
}): CritiqueIssue[] {
    const actualMix = toMix(args.counts);
    const targetMix = args.policy.mix as Record<Kind, number>;
    const issues: CritiqueIssue[] = [];

    const desiredDominant = dominantKind(targetMix);
    const actualDominant = dominantKind(actualMix);

    if (desiredDominant !== actualDominant) {
        issues.push({
            code: "EXERCISE_POLICY_DOMINANT_KIND_MISMATCH",
            category: "clarity",
            severity: args.generationTargets ? "warn" : "error",
            message: `Exercise policy expects "${desiredDominant}" to be dominant, but the draft is dominated by "${actualDominant}".`,
        });
    }

    if (targetMix.code_input >= 0.5 && actualMix.code_input < 0.4) {
        issues.push({
            code: "EXERCISE_POLICY_CODE_INPUT_TOO_LOW",
            category: "clarity",
            severity: "error",
            message:
                "Exercise policy expects a code_input-heavy topic, but the draft does not contain enough code_input exercises.",
        });
    }

    if (targetMix.code_input >= 0.35 && args.counts.code_input === 0) {
        issues.push({
            code: "EXERCISE_POLICY_CODE_INPUT_MISSING",
            category: "clarity",
            severity: "error",
            message:
                "Exercise policy expects code_input exercises, but the draft contains none.",
        });
    }

    for (const kind of KINDS) {
        if (kind === "code_input") continue;

        if (targetMix[kind] >= 0.2 && args.counts[kind] === 0) {
            issues.push({
                code: "EXERCISE_POLICY_KIND_MISSING",
                category: "clarity",
                severity: "warn",
                message: `Exercise policy gives meaningful weight to "${kind}", but the draft contains none.`,
            });
        }
    }

    return issues;
}

export function buildExercisePolicyCritiqueIssues(args: {
    draft: TopicAuthoringDraft;
    policy?: ResolvedExercisePolicy;
    plannedCounts?: PlannedExerciseCounts;
    generationTargets?: GenerationTargets;
}): CritiqueIssue[] {
    const counts = countKinds(args.draft);
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

    if (total === 0) {
        return [
            {
                code: "EXERCISE_POLICY_EMPTY_DRAFT",
                category: "clarity",
                severity: "error",
                message:
                    "Draft has no exercises, so it cannot satisfy the exercise policy.",
            },
        ];
    }

    const issues: CritiqueIssue[] = [];

    issues.push(
        ...buildGenerationTargetIssues({
            draft: args.draft,
            generationTargets: args.generationTargets,
        }),
    );

    if (args.plannedCounts) {
        issues.push(
            ...buildCountBasedIssues({
                counts,
                plannedCounts: args.plannedCounts,
                generationTargets: args.generationTargets,
            }),
        );
    } else if (args.policy) {
        issues.push(
            ...buildMixBasedIssues({
                counts,
                policy: args.policy,
                generationTargets: args.generationTargets,
            }),
        );
    }

    return issues;
}