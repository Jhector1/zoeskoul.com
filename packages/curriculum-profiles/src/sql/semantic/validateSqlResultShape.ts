import type { SemanticValidationIssue } from "../../shared/profileServices.js";
import { extractFirstSqlTable } from "@zoeskoul/curriculum-runtime";

export function validateSqlResultShape(args: {
    runsByExerciseId: Record<string, unknown>;
}): {
    issues: SemanticValidationIssue[];
} {
    const issues: SemanticValidationIssue[] = [];

    for (const [exerciseId, run] of Object.entries(args.runsByExerciseId)) {
        const table = extractFirstSqlTable(run as any);

        if (!table) {
            issues.push({
                code: "SQL_RESULT_SHAPE_MISMATCH",
                category: "result_shape",
                severity: "error",
                exerciseId,
                message: "SQL solution ran but did not produce a readable table result.",
            });
        }
    }

    return { issues };
}