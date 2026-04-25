import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type {
    SemanticValidationIssue,
    SemanticValidationReport,
} from "../../shared/profileServices.js";
import { validateSqlPromptIntent } from "./validateSqlPromptIntent.js";
import { validateSqlResultShape } from "./validateSqlResultShape.js";
import { validateSqlSolutionExecutes } from "./validateSqlSolutionExecutes.js";
import { validateSqlDatasetConsistency } from "../validate/validateSqlDatasetConsistency.js";

export async function validateSqlSemantic(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): Promise<SemanticValidationReport> {
    const execution = await validateSqlSolutionExecutes(args);

    const shape = validateSqlResultShape({
        runsByExerciseId: execution.runsByExerciseId,
    });

    const promptIntent = validateSqlPromptIntent(args);

    const datasetConsistencyIssues: SemanticValidationIssue[] =
        validateSqlDatasetConsistency(args).map((message) => ({
            code: "SQL_DATASET_CONSISTENCY",
            category: "dataset",
            severity: "error",
            message,
        }));

    const issues: SemanticValidationIssue[] = [
        ...execution.issues,
        ...shape.issues,
        ...promptIntent.issues,
        ...datasetConsistencyIssues,
    ];

    return {
        topicId: args.seed.topicId,
        ok: !issues.some((issue) => issue.severity === "error"),
        issues,
    };
}