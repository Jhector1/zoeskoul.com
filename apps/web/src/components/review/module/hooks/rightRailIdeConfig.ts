import type { LearningIdeConfig } from "@/lib/ide/learningIdeConfig";

export function resolveRightRailIdeConfig(args: {
    toolIdeConfig?: LearningIdeConfig | null;
    rightRailExerciseIdeConfig?: LearningIdeConfig | null;
    boundExerciseIdeConfig?: LearningIdeConfig | null;
    runtimeEffectiveIdeConfig?: LearningIdeConfig | null;
}) {
    /**
     * The authored runtime for the currently active route/exercise is the
     * canonical source for step-local terminal settings like terminalCwd.
     *
     * tool.toolIdeConfig is sticky by design so the tools panel can survive
     * navigation and rebinding, but that also means it can legitimately lag one
     * step behind during project/question transitions. If it wins here, the
     * terminal can reopen in /workspace or the previous step's folder even
     * though the current manifest authored a different cwd.
     */
    return (
        args.rightRailExerciseIdeConfig ??
        args.boundExerciseIdeConfig ??
        args.toolIdeConfig ??
        args.runtimeEffectiveIdeConfig ??
        null
    );
}
