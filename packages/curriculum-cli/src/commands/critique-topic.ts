import { loadBlueprint, critiqueTopic } from "@zoeskoul/curriculum-compiler";
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

export async function runCritiqueTopic(blueprintPath: string, topicId: string) {
    const blueprint = await loadBlueprint(blueprintPath);
    let sawProgress = false;

    console.log(`Critiquing topic ${topicId} for subject ${blueprint.subjectSlug}...`);

    try {
        const result = await critiqueTopic({
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
                `✔ Critiqued topic ${result.topicId} for subject ${result.subjectSlug}`,
            );
        } else {
            console.log(
                `Critiqued topic ${result.topicId} for subject ${result.subjectSlug}`,
            );
        }

        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        if (sawProgress) {
            finishProgressBar("✖ Critique failed");
        }
        throw error;
    }
}