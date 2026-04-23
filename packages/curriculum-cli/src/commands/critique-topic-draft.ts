import { loadBlueprint, critiqueTopicDraft } from "@zoeskoul/curriculum-compiler";
import { openAiProvider } from "@zoeskoul/curriculum-ai";
import {
    finishProgressBar,
    renderProgressBar,
} from "../utils/renderProgressBar.js";

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

function countIssues(issues: Array<{ severity: "warn" | "error" }>) {
    let errors = 0;
    let warnings = 0;

    for (const issue of issues) {
        if (issue.severity === "error") errors += 1;
        else warnings += 1;
    }

    return { errors, warnings };
}

export async function runCritiqueTopicDraft(
    blueprintPath: string,
    topicId: string,
) {
    const blueprint = await loadBlueprint(blueprintPath);
    let sawProgress = false;

    console.log(
        `Critiquing saved draft for topic ${topicId} in subject ${blueprint.subjectSlug}...`,
    );

    try {
        const result = await critiqueTopicDraft({
            blueprint,
            provider: openAiProvider,
            topicId,
            onProgress: (info) => {
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
                `✔ Critiqued saved draft for ${result.topicId} in subject ${result.subjectSlug}`,
            );
        } else {
            console.log(
                `Critiqued saved draft for ${result.topicId} in subject ${result.subjectSlug}`,
            );
        }

        const critiqueCounts = countIssues(result.critiqueReport.issues);
        const semanticCounts = countIssues(result.semanticReport.issues);

        console.log(`Mode: ${result.mode}`);
        console.log(`Report saved: ${result.reportDir}`);
        console.log(
            `Critique issues: ${result.critiqueReport.issues.length} (${critiqueCounts.errors} errors, ${critiqueCounts.warnings} warnings)`,
        );
        console.log(
            `Semantic issues: ${result.semanticReport.issues.length} (${semanticCounts.errors} errors, ${semanticCounts.warnings} warnings)`,
        );
    } catch (error) {
        if (sawProgress) {
            finishProgressBar("✖ Critique failed");
        }
        throw error;
    }
}