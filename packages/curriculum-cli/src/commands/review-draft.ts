import { loadBlueprint, reviewSubjectDraft } from "@zoeskoul/curriculum-compiler";
import { openAiProvider } from "@zoeskoul/curriculum-ai";
import path from "node:path";
import {
    finishProgressBar,
    renderProgressBar,
} from "../utils/renderProgressBar.js";

type ReviewDraftOptions = {
    moduleSlugs: string[];
    topicIds: string[];
    failOnErrors: boolean;
    applyFixes: boolean;
};

type Issue = {
    severity: "warn" | "error";
    message: string;
};

function makeProgressLabel(info: {
    stage: string;
    moduleSlug?: string;
    topicId?: string;
}) {
    const location =
        info.moduleSlug && info.topicId
            ? `${info.moduleSlug} / ${info.topicId}`
            : info.moduleSlug
                ? info.moduleSlug
                : info.topicId
                    ? info.topicId
                    : "";

    return location ? `${info.stage} - ${location}` : info.stage;
}

function countIssues(issues: Issue[]) {
    let errors = 0;
    let warnings = 0;

    for (const issue of issues) {
        if (issue.severity === "error") errors += 1;
        else warnings += 1;
    }

    return { errors, warnings };
}

function summarizeTopicResults(
    topics: Array<{
        critiqueReport: { issues: Issue[] };
        semanticReport: { issues: Issue[] };
        goldenReport: { issues: Issue[] };
    }>,
) {
    let critiqueErrors = 0;
    let critiqueWarnings = 0;
    let semanticErrors = 0;
    let semanticWarnings = 0;
    let goldenErrors = 0;
    let goldenWarnings = 0;

    for (const topic of topics) {
        const critique = countIssues(topic.critiqueReport.issues);
        const semantic = countIssues(topic.semanticReport.issues);
        const golden = countIssues(topic.goldenReport.issues);

        critiqueErrors += critique.errors;
        critiqueWarnings += critique.warnings;
        semanticErrors += semantic.errors;
        semanticWarnings += semantic.warnings;
        goldenErrors += golden.errors;
        goldenWarnings += golden.warnings;
    }

    return {
        critiqueErrors,
        critiqueWarnings,
        semanticErrors,
        semanticWarnings,
        goldenErrors,
        goldenWarnings,
    };
}

function parseReviewDraftOptions(args: string[]): ReviewDraftOptions {
    const options: ReviewDraftOptions = {
        moduleSlugs: [],
        topicIds: [],
        failOnErrors: false,
        applyFixes: false,
    };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        if (arg === "--module") {
            const value = args[index + 1];
            if (!value) throw new Error("Usage: --module <moduleSlug|moduleIndex>");
            options.moduleSlugs.push(value);
            index += 1;
            continue;
        }

        if (arg === "--topic") {
            const value = args[index + 1];
            if (!value) throw new Error("Usage: --topic <topicId>");
            options.topicIds.push(value);
            index += 1;
            continue;
        }

        if (arg === "--fail-on-errors") {
            options.failOnErrors = true;
            continue;
        }

        if (arg === "--fix") {
            options.applyFixes = true;
            continue;
        }

        throw new Error(
            `Unknown review-draft option: ${arg}. Supported options: --module <moduleSlug|moduleIndex>, --topic <topicId>, --fix, --fail-on-errors`,
        );
    }

    return options;
}

function formatIssueList(issues: Issue[]) {
    if (issues.length < 1) return "none";
    return issues.map((issue) => `- [${issue.severity}] ${issue.message}`).join("\n");
}

export async function runReviewDraft(
    blueprintPath: string,
    rawArgs: string[],
) {
    const options = parseReviewDraftOptions(rawArgs);
    const blueprint = await loadBlueprint(blueprintPath);
    let sawProgress = false;

    console.log(`Reviewing saved drafts for subject ${blueprint.subjectSlug}...`);

    try {
        const result = await reviewSubjectDraft({
            blueprint,
            provider: openAiProvider,
            moduleSlugs: options.moduleSlugs,
            topicIds: options.topicIds,
            applyFixes: options.applyFixes,
            onProgress: (info: {
                current: number;
                total: number;
                stage: string;
                moduleSlug?: string;
                topicId?: string;
            }) => {
                sawProgress = true;
                renderProgressBar({
                    current: info.current,
                    total: info.total,
                    label: makeProgressLabel(info),
                });
            },
        });

        if (sawProgress) {
            finishProgressBar(
                `✔ Reviewed saved drafts for ${result.subjectSlug} (${result.topics.length} topics)`,
            );
        } else {
            console.log(
                `Reviewed saved drafts for ${result.subjectSlug} (${result.topics.length} topics)`,
            );
        }

        const summary = summarizeTopicResults(result.topics);

        console.log(`Mode: ${result.mode}`);
        console.log(
            `Reports root: ${path.join(".curriculum-drafts", "reports", result.subjectSlug)}`,
        );
        if (result.moduleFilters.length > 0) {
            console.log(`Modules: ${result.moduleFilters.join(", ")}`);
        }
        if (result.topicFilters.length > 0) {
            console.log(`Topics: ${result.topicFilters.join(", ")}`);
        }
        if (options.applyFixes) {
            console.log(`Applied fixes: ${result.appliedFixCount}`);
            if (result.skippedMissingDraftCount > 0) {
                console.log(
                    `Skipped missing saved drafts: ${result.skippedMissingDraftCount}`,
                );
            }
        }

        console.log(
            `Critique issues: ${summary.critiqueErrors + summary.critiqueWarnings} (${summary.critiqueErrors} errors, ${summary.critiqueWarnings} warnings)`,
        );
        console.log(
            `Semantic issues: ${summary.semanticErrors + summary.semanticWarnings} (${summary.semanticErrors} errors, ${summary.semanticWarnings} warnings)`,
        );
        console.log(
            `Golden issues: ${summary.goldenErrors + summary.goldenWarnings} (${summary.goldenErrors} errors, ${summary.goldenWarnings} warnings)`,
        );

        for (const topic of result.topics) {
            const critique = countIssues(topic.critiqueReport.issues);
            const semantic = countIssues(topic.semanticReport.issues);
            const golden = countIssues(topic.goldenReport.issues);
            const totalIssues =
                topic.critiqueReport.issues.length +
                topic.semanticReport.issues.length +
                topic.goldenReport.issues.length;

            console.log("");
            console.log(
                `${topic.moduleSlug} / ${topic.topicId} (${totalIssues} total issues)`,
            );
            console.log(`Report: ${topic.reportDir}`);
            console.log(
                `Critique: ${topic.critiqueReport.issues.length} (${critique.errors} errors, ${critique.warnings} warnings)`,
            );
            console.log(
                `Semantic: ${topic.semanticReport.issues.length} (${semantic.errors} errors, ${semantic.warnings} warnings)`,
            );
            console.log(
                `Golden: ${topic.goldenReport.issues.length} (${golden.errors} errors, ${golden.warnings} warnings)`,
            );

            if (topic.critiqueReport.issues.length > 0) {
                console.log("Critique details:");
                console.log(formatIssueList(topic.critiqueReport.issues));
            }

            if (topic.semanticReport.issues.length > 0) {
                console.log("Semantic details:");
                console.log(formatIssueList(topic.semanticReport.issues));
            }

            if (topic.goldenReport.issues.length > 0) {
                console.log("Golden details:");
                console.log(formatIssueList(topic.goldenReport.issues));
            }
        }

        if (
            options.failOnErrors &&
            (summary.critiqueErrors > 0 ||
                summary.semanticErrors > 0 ||
                summary.goldenErrors > 0)
        ) {
            throw new Error("Draft review found one or more errors.");
        }
    } catch (error) {
        if (sawProgress) {
            finishProgressBar("✖ Draft review failed");
        }
        throw error;
    }
}
