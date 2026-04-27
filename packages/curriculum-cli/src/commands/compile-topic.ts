// packages/curriculum-cli/src/commands/compile-topic.ts

import { loadBlueprint, compileTopic } from "@zoeskoul/curriculum-compiler";
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

export async function runCompileTopic(blueprintPath: string, topicId: string) {
    const blueprint = await loadBlueprint(blueprintPath);
    let sawProgress = false;

    console.log(`Compiling topic ${topicId} for subject ${blueprint.subjectSlug}...`);

    try {
        const out = await compileTopic({
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
                `✔ Compiled topic ${out.topicId} for subject ${out.subjectSlug}`,
            );
        } else {
            console.log(`Compiled topic ${out.topicId} for subject ${out.subjectSlug}`);
        }
    } catch (error) {
        if (sawProgress) {
            finishProgressBar("✖ Compile failed");
        }

        throw error;
    }
}