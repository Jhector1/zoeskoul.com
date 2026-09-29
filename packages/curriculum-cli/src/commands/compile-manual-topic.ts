import {
    compileManualTopic,
    loadBlueprint,
    resolveAuthoringCompileTarget,
} from "@zoeskoul/curriculum-compiler";
import { finishProgressBar, renderProgressBar } from "../utils/renderProgressBar.js";

function makeProgressLabel(info: {
    stage: string;
    moduleSlug?: string;
    topicId?: string;
}) {
    const location =
        info.moduleSlug && info.topicId
            ? `${info.moduleSlug} / ${info.topicId}`
            : info.moduleSlug ?? info.topicId ?? "";
    return location ? `${info.stage} - ${location}` : info.stage;
}

export async function runCompileManualTopic(blueprintPath: string, topicId: string) {
    const blueprint = await loadBlueprint(blueprintPath);
    const courseSlug = blueprint.courseSlug;

    if (!courseSlug) {
        throw new Error(
            `Manual topic compilation requires blueprint.courseSlug for subject "${blueprint.subjectSlug}".`,
        );
    }

    const target = await resolveAuthoringCompileTarget({
        subjectSlug: blueprint.subjectSlug,
        courseSlug,
        options: { draftOnly: true },
    });

    let sawProgress = false;
    try {
        const result = await compileManualTopic({
            blueprint,
            outputSubjectSlug: target.blueprint.subjectSlug,
            topicId,
            onProgress(info) {
                sawProgress = true;
                renderProgressBar({
                    current: info.current,
                    total: info.total,
                    label: makeProgressLabel(info),
                });
            },
        });
        if (sawProgress) finishProgressBar("✓ Manual topic compiled");
        console.log(`Manual source: ${result.sourcePath}`);
        console.log(`Topic: ${result.topicId}`);
        console.log(`Authoring subject: ${blueprint.subjectSlug}`);
        console.log(`Output subject: ${result.subjectSlug}`);
        console.log("External AI: NO");
    } catch (error) {
        if (sawProgress) finishProgressBar("✖ Manual topic compile failed");
        throw error;
    }
}
