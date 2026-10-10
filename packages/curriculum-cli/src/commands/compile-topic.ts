// packages/curriculum-cli/src/commands/compile-topic.ts

import { compileTopic, findTopicSourceDraft, loadBlueprint } from "@zoeskoul/curriculum-compiler";
import {
    finishProgressBar,
    renderProgressBar,
} from "../utils/renderProgressBar.js";
import { resolveAiProviderOptions } from "../utils/resolveAiProviderOptions.js";

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

export async function runCompileTopic(
    blueprintPath: string,
    topicId: string,
    args: string[] = [],
) {
    const blueprint = await loadBlueprint(blueprintPath);
    const existingSource = blueprint.courseSlug
        ? await findTopicSourceDraft({
              subjectSlug: blueprint.subjectSlug,
              courseSlug: blueprint.courseSlug,
              topicId,
          })
        : null;
    const needsTranslation = (blueprint.targetLocales ?? []).some(
        (locale) => locale !== blueprint.sourceLocale,
    );
    const ai = await resolveAiProviderOptions({
        cliArgs: args,
        needsGeneration: !existingSource || needsTranslation,
    });

    if (!ai && args.includes("--list-ai-models")) {
        return;
    }
    let sawProgress = false;

    console.log(`Compiling topic ${topicId} for subject ${blueprint.subjectSlug}...`);
    if (existingSource) console.log(`Using canonical source draft: ${existingSource.sourcePath}`);

    try {
        const out = await compileTopic({
            blueprint,
            ...(ai ? { provider: ai.provider, translationProvider: ai.translationProvider } : {}),
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