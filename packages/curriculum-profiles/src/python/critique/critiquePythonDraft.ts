import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { CritiqueIssue, CritiqueReport } from "../../shared/profileServices.js";
import { makeEmptyCritiqueReport } from "../../shared/noopReports.js";
import { PYTHON_MINIMUM_FIXED_TESTS } from "../profile.js";

function hasInputCalls(source: string) {
    return /\binput\s*\(/.test(source);
}

export async function critiquePythonDraft(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): Promise<CritiqueReport> {
    const report = makeEmptyCritiqueReport(args.seed.topicId);
    const issues: CritiqueIssue[] = [];

    for (const exercise of args.draft.quizDraft) {
        if (exercise.kind !== "code_input") continue;
        if ((exercise.recipeType ?? "fixed_tests") !== "fixed_tests") continue;

        const tests = Array.isArray(exercise.tests) ? exercise.tests : [];
        if (tests.length >= PYTHON_MINIMUM_FIXED_TESTS) continue;

        const combinedCode = `${String(exercise.starterCode ?? "")}\n${String(exercise.solutionCode ?? "")}`;
        const message = hasInputCalls(combinedCode)
            ? `Exercise "${exercise.id}" still has fewer than ${PYTHON_MINIMUM_FIXED_TESTS} meaningful fixed tests. Add distinct stdin/stdout cases or replace the exercise.`
            : `Exercise "${exercise.id}" is invalid as fixed_tests code_input because it does not read stdin and cannot support ${PYTHON_MINIMUM_FIXED_TESTS} meaningful fixed tests. Replace it with a non-code exercise or regenerate it as stdin-based code_input.`;

        issues.push({
            code: "PYTHON_FIXED_TEST_REPAIR_UNSAFE",
            category: "pedagogy",
            severity: "error",
            exerciseId: exercise.id,
            message,
        });
    }

    report.issues = issues;
    report.ok = issues.length < 1;
    return report;
}
