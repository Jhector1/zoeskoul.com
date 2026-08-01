import type {
    TopicAuthoringDraft,
    TopicBundleManifest,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import { validateCodeProfileGolden } from "../shared/validateCodeProfileGolden.js";
import { validateGoldenTopicBundle } from "../shared/validateGoldenTopicBundle.js";
import { makeEmptyGoldenValidationReport } from "../shared/noopReports.js";
import type { GoldenValidationReport } from "../shared/profileServices.js";

export function validateCStaticMemoryContract(
    draft: TopicAuthoringDraft,
): GoldenValidationReport["issues"] {
    return (Array.isArray(draft.quizDraft) ? draft.quizDraft : []).flatMap(
        (exercise) => {
            if (exercise.kind !== "code_input") return [];

            const sources = [
                exercise.solutionCode,
                ...(exercise.solutionFiles ?? []).map((file) => file.content),
            ].join("\n");
            const allocates = /\b(?:malloc|calloc|realloc)\s*\(/.test(sources);
            if (!allocates) return [];

            const issues: GoldenValidationReport["issues"] = [];
            if (!/\bfree\s*\(/.test(sources)) {
                issues.push({
                    code: "C_DYNAMIC_MEMORY_CLEANUP_MISSING",
                    category: "tests",
                    severity: "error",
                    exerciseId: exercise.id,
                    message: `Exercise "${exercise.id}" allocates dynamic memory but its official workspace never calls free(). The harness must release every owned allocation before exit.`,
                });
            }

            const assignedAllocations = [
                ...sources.matchAll(
                    /\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:\([^()]*\)\s*)?(malloc|calloc|realloc)\s*\(/g,
                ),
            ];
            const uncheckedVariables = assignedAllocations
                .map((match) => match[1] ?? "")
                .filter(Boolean)
                .filter((name, index, names) => names.indexOf(name) === index)
                .filter((name) => {
                    const escaped = name.replace(
                        /[.*+?^${}()|[\]\\]/g,
                        "\\$&",
                    );
                    return !new RegExp(
                        `(?:!\\s*${escaped}\\b|${escaped}\\s*==\\s*NULL\\b|NULL\\s*==\\s*${escaped}\\b)`,
                    ).test(sources);
                });

            if (uncheckedVariables.length > 0 || assignedAllocations.length === 0) {
                issues.push({
                    code: "C_ALLOCATION_FAILURE_CHECK_MISSING",
                    category: "tests",
                    severity: "warn",
                    exerciseId: exercise.id,
                    message:
                        assignedAllocations.length === 0
                            ? `Exercise "${exercise.id}" allocates memory without an obvious assigned pointer; verify allocation failure is handled explicitly.`
                            : `Exercise "${exercise.id}" does not explicitly check allocation failure for: ${uncheckedVariables.join(", ")}.`,
                });
            }

            return issues;
        },
    );
}

export async function validateCGolden(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
    topicBundle: TopicBundleManifest;
}): Promise<GoldenValidationReport> {
    const report = makeEmptyGoldenValidationReport(args.seed.topicId);
    const shared = await validateGoldenTopicBundle(args);
    const cStaticIssues = validateCStaticMemoryContract(args.draft);
    const codeGolden = await validateCodeProfileGolden({
        profileId: "c",
        expectedLanguage: "c",
        allowedRecipeTypes: ["fixed_tests"],
        draft: args.draft,
        topicBundle: args.topicBundle,
        minimumFixedTests: 3,
        runLimits: { cCompilerMode: "strict" },
        additionalRunLimits: { cCompilerMode: "sanitized" },
    });

    report.issues.push(...shared.issues, ...cStaticIssues, ...codeGolden);
    report.ok = !report.issues.some((issue) => issue.severity === "error");
    return report;
}
