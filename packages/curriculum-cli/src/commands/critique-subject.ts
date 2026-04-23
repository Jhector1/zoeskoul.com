import { loadBlueprint, critiqueSubject } from "@zoeskoul/curriculum-compiler";
import { openAiProvider } from "@zoeskoul/curriculum-ai";
import path from "node:path";
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

function summarizeTopicResults(
    topics: Array<{
        critiqueReport: { issues: Array<{ severity: "warn" | "error" }> };
        semanticReport: { issues: Array<{ severity: "warn" | "error" }> };
    }>,
) {
    let critiqueErrors = 0;
    let critiqueWarnings = 0;
    let semanticErrors = 0;
    let semanticWarnings = 0;

    for (const topic of topics) {
        for (const issue of topic.critiqueReport.issues) {
            if (issue.severity === "error") critiqueErrors += 1;
            else critiqueWarnings += 1;
        }

        for (const issue of topic.semanticReport.issues) {
            if (issue.severity === "error") semanticErrors += 1;
            else semanticWarnings += 1;
        }
    }

    return {
        critiqueErrors,
        critiqueWarnings,
        semanticErrors,
        semanticWarnings,
    };
}

export async function runCritiqueSubject(blueprintPath: string) {
    const blueprint = await loadBlueprint(blueprintPath);
    let sawProgress = false;

    console.log(`Critiquing subject ${blueprint.subjectSlug}...`);

    try {
        const result = await critiqueSubject({
            blueprint,
            provider: openAiProvider,
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
                `✔ Critiqued subject ${result.subjectSlug} (${result.topics.length} topics)`,
            );
        } else {
            console.log(
                `Critiqued subject ${result.subjectSlug} (${result.topics.length} topics)`,
            );
        }

        const summary = summarizeTopicResults(result.topics);

        console.log(`Mode: ${result.mode}`);
        console.log(
            `Reports root: ${path.join(".curriculum-drafts", "reports", result.subjectSlug)}`,
        );
        console.log(
            `Critique issues: ${summary.critiqueErrors + summary.critiqueWarnings} (${summary.critiqueErrors} errors, ${summary.critiqueWarnings} warnings)`,
        );
        console.log(
            `Semantic issues: ${summary.semanticErrors + summary.semanticWarnings} (${summary.semanticErrors} errors, ${summary.semanticWarnings} warnings)`,
        );
    } catch (error) {
        if (sawProgress) {
            finishProgressBar("✖ Critique failed");
        }
        throw error;
    }
}