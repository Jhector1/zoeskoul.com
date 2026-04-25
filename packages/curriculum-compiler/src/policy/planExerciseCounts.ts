
import type {
    ExerciseKindKey,
    ResolvedExercisePolicy,
} from "@zoeskoul/curriculum-contracts";

const KIND_KEYS: ExerciseKindKey[] = [
    "single_choice",
    "multi_choice",
    "drag_reorder",
    "fill_blank_choice",
    "code_input",
];

export type PlannedExerciseCounts = {
    total: number;
    dominantKind: ExerciseKindKey;
    counts: Record<ExerciseKindKey, number>;
};

export function planExerciseCounts(args: {
    policy: ResolvedExercisePolicy;
    total: number;
}): PlannedExerciseCounts {
    const total = Math.max(1, Math.floor(args.total));
    const mix = args.policy.mix;

    const rawCounts = KIND_KEYS.map((kind) => ({
        kind,
        raw: mix[kind] * total,
        base: Math.floor(mix[kind] * total),
        remainder: (mix[kind] * total) - Math.floor(mix[kind] * total),
    }));

    let assigned = rawCounts.reduce((sum, item) => sum + item.base, 0);
    const counts: Record<ExerciseKindKey, number> = {
        single_choice: 0,
        multi_choice: 0,
        drag_reorder: 0,
        fill_blank_choice: 0,
        code_input: 0,
    };

    for (const item of rawCounts) {
        counts[item.kind] = item.base;
    }

    const sortedByRemainder = [...rawCounts].sort((a, b) => b.remainder - a.remainder);

    let index = 0;
    while (assigned < total) {
        const item = sortedByRemainder[index % sortedByRemainder.length];
        counts[item.kind] += 1;
        assigned += 1;
        index += 1;
    }

    if (mix.code_input >= 0.35 && counts.code_input === 0) {
        const donor = KIND_KEYS
            .filter((kind) => kind !== "code_input")
            .sort((a, b) => counts[b] - counts[a])[0];

        if (donor && counts[donor] > 1) {
            counts[donor] -= 1;
            counts.code_input += 1;
        }
    }

    const dominantKind = enforceStrictDominance({ counts, mix });

    return {
        total,
        dominantKind,
        counts,
    };
}



function dominantFromMix(mix: Record<ExerciseKindKey, number>): ExerciseKindKey {
    return KIND_KEYS.slice().sort((a, b) => mix[b] - mix[a])[0] ?? "fill_blank_choice";
}

function enforceStrictDominance(args: {
    counts: Record<ExerciseKindKey, number>;
    mix: Record<ExerciseKindKey, number>;
}) {
    const targetDominant = dominantFromMix(args.mix);
    const maxOther = Math.max(
        ...KIND_KEYS.filter((kind) => kind !== targetDominant).map(
            (kind) => args.counts[kind],
        ),
    );

    if (args.counts[targetDominant] > maxOther) {
        return targetDominant;
    }

    const donor = KIND_KEYS
        .filter((kind) => kind !== targetDominant)
        .sort((a, b) => {
            const countDiff = args.counts[b] - args.counts[a];
            if (countDiff !== 0) return countDiff;
            return args.mix[a] - args.mix[b];
        })
        .find((kind) => args.counts[kind] > 0);

    if (donor) {
        args.counts[donor] -= 1;
        args.counts[targetDominant] += 1;
    }

    return targetDominant;
}