import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { SemanticValidationReport } from "../../shared/profileServices.js";
import { validateSqlPromptIntent } from "./validateSqlPromptIntent.js";
import { validateSqlResultShape } from "./validateSqlResultShape.js";
import { validateSqlSolutionExecutes } from "./validateSqlSolutionExecutes.js";

export async function validateSqlSemantic(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): Promise<SemanticValidationReport> {
    const execution = await validateSqlSolutionExecutes(args);
    const shape = validateSqlResultShape({
        runsByExerciseId: execution.runsByExerciseId,
    });
    const promptIntent = validateSqlPromptIntent(args);

    const issues = [
        ...execution.issues,
        ...shape.issues,
        ...promptIntent.issues,
    ];

    return {
        topicId: args.seed.topicId,
        ok: !issues.some((issue) => issue.severity === "error"),
        issues,
    };
}