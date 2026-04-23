import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { RepairReport } from "../../shared/profileServices.js";
import { makeEmptyRepairReport } from "../../shared/noopReports.js";

export async function repairSqlDraft(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): Promise<{
    draft: TopicAuthoringDraft;
    report: RepairReport;
}> {
    const moduleDatasetId =
        args.seed.moduleRuntimeDefaults?.kind === "sql"
            ? args.seed.moduleRuntimeDefaults.datasetId
            : undefined;

    const report = makeEmptyRepairReport(args.seed.topicId);

    const quizDraft = args.draft.quizDraft.map((exercise) => {
        if (exercise.kind !== "code_input") {
            return exercise;
        }

        let next = exercise;

        if (!next.recipeType) {
            next = {
                ...next,
                recipeType: "sql_query",
            };
            report.repairs.push({
                code: "SQL_DEFAULTED_MISSING_RECIPE_TYPE",
                category: "recipe",
                severity: "low",
                field: `${exercise.id}.recipeType`,
                message: `Defaulted missing recipeType to "sql_query" for SQL profile.`,
            });
        }

        if (!next.datasetId && moduleDatasetId) {
            next = {
                ...next,
                datasetId: moduleDatasetId,
            };
            report.repairs.push({
                code: "SQL_DEFAULTED_MISSING_DATASET",
                category: "dataset",
                severity: "low",
                field: `${exercise.id}.datasetId`,
                message: "Defaulted missing datasetId from module runtime defaults.",
            });
        }

        return next;
    });

    return {
        draft: {
            ...args.draft,
            quizDraft,
        },
        report,
    };
}