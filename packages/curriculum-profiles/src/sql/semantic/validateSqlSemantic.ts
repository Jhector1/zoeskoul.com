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
import { validateSqlConceptStage } from "./validateSqlConceptStage.js";
import { validateSqlDatasetConsistency } from "../validate/validateSqlDatasetConsistency.js";

function readEnvFlag(name: string): boolean {
    const maybeGlobal = globalThis as typeof globalThis & {
        process?: {
            env?: Record<string, string | undefined>;
        };
    };

    return maybeGlobal.process?.env?.[name] === "1";
}

export async function validateSqlSemantic(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): Promise<SemanticValidationReport> {
    const execution = await validateSqlSolutionExecutes(args);
    const conceptStageIssues = validateSqlConceptStage(args);

    const shape = validateSqlResultShape({
        runsByExerciseId: execution.runsByExerciseId,
    });

    const promptIntent = validateSqlPromptIntent(args);

    const strictDatasetConsistency = readEnvFlag(
        "CURRICULUM_STRICT_SQL_DATASET_CONSISTENCY",
    );

    const datasetConsistencyIssues: SemanticValidationIssue[] =
        validateSqlDatasetConsistency(args).map((message) => ({
            code: "SQL_DATASET_CONSISTENCY",
            category: "dataset",
            severity: strictDatasetConsistency ? "error" : "warn",
            message,
        }));

    const issues: SemanticValidationIssue[] = [
        ...execution.issues,
        ...conceptStageIssues,
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
