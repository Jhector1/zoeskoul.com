





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

type CountConstraint = {
    min?: number;
    max?: number;
};

export function planExerciseCounts(args: {
    policy: ResolvedExercisePolicy;
    total: number;
    constraints?: Partial<Record<ExerciseKindKey, CountConstraint>>;
}): PlannedExerciseCounts {
    const total = Math.max(1, Math.floor(args.total));
    const mix = args.policy.mix;
    const constraints = args.constraints ?? {};

    const counts: Record<ExerciseKindKey, number> = {
        single_choice: 0,
        multi_choice: 0,
        drag_reorder: 0,
        fill_blank_choice: 0,
        code_input: 0,
    };

    // 1. Apply fixed/min constraints first.
    for (const kind of KIND_KEYS) {
        const min = constraints[kind]?.min;

        if (typeof min === "number" && min > 0) {
            counts[kind] = Math.floor(min);
        }
    }

    let assigned = KIND_KEYS.reduce((sum, kind) => sum + counts[kind], 0);

    if (assigned > total) {
        throw new Error(
            `Exercise count constraints exceed total. Constraints require ${assigned}, but total is ${total}.`,
        );
    }

    // 2. Distribute remaining slots by mix.
    const remaining = total - assigned;

    const eligibleKinds = KIND_KEYS.filter((kind) => {
        const max = constraints[kind]?.max;
        return typeof max !== "number" || counts[kind] < max;
    });

    const rawCounts = eligibleKinds.map((kind) => ({
        kind,
        raw: mix[kind] * remaining,
        base: Math.floor(mix[kind] * remaining),
        remainder: mix[kind] * remaining - Math.floor(mix[kind] * remaining),
    }));

    for (const item of rawCounts) {
        const max = constraints[item.kind]?.max;
        const allowedBase =
            typeof max === "number"
                ? Math.max(0, Math.min(item.base, max - counts[item.kind]))
                : item.base;

        counts[item.kind] += allowedBase;
        assigned += allowedBase;
    }

    const sortedByRemainder = [...rawCounts].sort(
        (a, b) => b.remainder - a.remainder,
    );

    let index = 0;

    while (assigned < total && sortedByRemainder.length > 0) {
        const item = sortedByRemainder[index % sortedByRemainder.length];
        const max = constraints[item.kind]?.max;

        if (typeof max !== "number" || counts[item.kind] < max) {
            counts[item.kind] += 1;
            assigned += 1;
        }

        index += 1;

        if (index > total * KIND_KEYS.length * 2) {
            throw new Error("Could not satisfy exercise count constraints.");
        }
    }

    const dominantKind = dominantFromCounts(counts, mix);

    return {
        total,
        dominantKind,
        counts,
    };
}

function dominantFromCounts(
    counts: Record<ExerciseKindKey, number>,
    mix: Record<ExerciseKindKey, number>,
): ExerciseKindKey {
    return KIND_KEYS.slice().sort((a, b) => {
        const countDiff = counts[b] - counts[a];
        if (countDiff !== 0) return countDiff;
        return mix[b] - mix[a];
    })[0] ?? "fill_blank_choice";
}









//
// function dominantFromMix(mix: Record<ExerciseKindKey, number>): ExerciseKindKey {
//     return KIND_KEYS.slice().sort((a, b) => mix[b] - mix[a])[0] ?? "fill_blank_choice";
// }
//
// function enforceStrictDominance(args: {
//     counts: Record<ExerciseKindKey, number>;
//     mix: Record<ExerciseKindKey, number>;
// }) {
//     const targetDominant = dominantFromMix(args.mix);
//     const maxOther = Math.max(
//         ...KIND_KEYS.filter((kind) => kind !== targetDominant).map(
//             (kind) => args.counts[kind],
//         ),
//     );
//
//     if (args.counts[targetDominant] > maxOther) {
//         return targetDominant;
//     }
//
//     const donor = KIND_KEYS
//         .filter((kind) => kind !== targetDominant)
//         .sort((a, b) => {
//             const countDiff = args.counts[b] - args.counts[a];
//             if (countDiff !== 0) return countDiff;
//             return args.mix[a] - args.mix[b];
//         })
//         .find((kind) => args.counts[kind] > 0);
//
//     if (donor) {
//         args.counts[donor] -= 1;
//         args.counts[targetDominant] += 1;
//     }
//
//     return targetDominant;
// }