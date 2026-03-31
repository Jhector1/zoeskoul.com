// src/lib/practice/help/steps.ts
export type PracticeHelpStepKind = "concept" | "hint" | "reveal";

export type PracticeHelpStepDef = {
    key: string;
    kind: PracticeHelpStepKind;
    label: string;
    description?: string;
    revealAnswer?: boolean;
    aiMode?: "concept" | "hint";
};

export type PracticeHelpPolicy = {
    stepKeys: string[];
};

export const PRACTICE_HELP_STEP_DEFS: readonly PracticeHelpStepDef[] = [
    {
        key: "concept",
        kind: "concept",
        label: "Need a hint?",
        description: "Small conceptual nudge without giving away the answer.",
        aiMode: "concept",
    },
    {
        key: "hint_1",
        kind: "hint",
        label: "Still stuck?",
        description: "A more direct hint.",
        aiMode: "hint",
    },
    {
        key: "hint_2",
        kind: "hint",
        label: "Almost there?",
        description: "A stronger hint, still without revealing the full answer.",
        aiMode: "hint",
    },
    {
        key: "reveal",
        kind: "reveal",
        label: "Reveal answer",
        description: "Show the answer as the final fallback.",
        revealAnswer: true,
    },
] as const;

export const PRACTICE_HELP_STEP_DEF_MAP = new Map(
    PRACTICE_HELP_STEP_DEFS.map((step) => [step.key, step]),
);

export const DEFAULT_PRACTICE_HELP_POLICY: PracticeHelpPolicy = {
    stepKeys: PRACTICE_HELP_STEP_DEFS.map((step) => step.key),
};

export function getPracticeHelpStepDef(stepKey: string): PracticeHelpStepDef | null {
    return PRACTICE_HELP_STEP_DEF_MAP.get(stepKey) ?? null;
}

export function getPracticeHelpStepIndex(stepKey: string): number {
    return PRACTICE_HELP_STEP_DEFS.findIndex((step) => step.key === stepKey);
}

export function isRevealStepKey(stepKey: string): boolean {
    return Boolean(getPracticeHelpStepDef(stepKey)?.revealAnswer);
}

export function normalizePracticeHelpPolicy(
    raw: unknown,
    legacyAllowReveal = true,
): PracticeHelpPolicy {
    const fallback = DEFAULT_PRACTICE_HELP_POLICY.stepKeys.filter(
        (key) => legacyAllowReveal || !isRevealStepKey(key),
    );

    if (!raw || typeof raw !== "object") {
        return { stepKeys: fallback };
    }

    const source = raw as { stepKeys?: unknown };
    const keys = Array.isArray(source.stepKeys)
        ? source.stepKeys
            .map((v) => String(v))
            .filter((key) => PRACTICE_HELP_STEP_DEF_MAP.has(key))
        : [];

    return { stepKeys: keys.length ? keys : fallback };
}

export function resolveEffectivePracticeHelpPolicy(args: {
    isAssignment: boolean;
    payloadAllowReveal: boolean;
    assignmentAllowReveal: boolean;
    sessionHelpPolicy?: unknown;
    assignmentHelpPolicy?: unknown;
    presetHelpPolicy?: unknown;
    presetAllowReveal?: boolean;
}): PracticeHelpPolicy {
    const base = normalizePracticeHelpPolicy(
        args.sessionHelpPolicy ??
        args.assignmentHelpPolicy ??
        args.presetHelpPolicy ??
        null,
        args.isAssignment
            ? args.assignmentAllowReveal && args.payloadAllowReveal
            : args.payloadAllowReveal && (args.presetAllowReveal ?? true),
    );

    const revealAllowed = args.isAssignment
        ? args.assignmentAllowReveal && args.payloadAllowReveal
        : args.payloadAllowReveal;

    return {
        stepKeys: base.stepKeys.filter((key) =>
            key === "reveal" ? revealAllowed : true,
        ),
    };
}

export function canOpenHelpStep(policy: PracticeHelpPolicy, stepKey: string) {
    return policy.stepKeys.includes(stepKey);
}

export function getNextPracticeHelpStepKey(
    enabledStepKeys: string[],
    openedStepKeys: string[],
): string | null {
    const opened = new Set(openedStepKeys);
    for (const key of enabledStepKeys) {
        if (!opened.has(key)) return key;
    }
    return null;
}